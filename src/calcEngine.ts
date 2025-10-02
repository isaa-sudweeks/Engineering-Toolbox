import { MarkdownPostProcessorContext } from "obsidian";
import { math, formatUnit } from "./utils/format";
import type { NoteScope, VarEntry, VarName, LineCacheEntry } from "./utils/types";
import type EngineeringToolkitPlugin from "./main";

export class CalcEngine {
  private plugin: EngineeringToolkitPlugin;
  private scopes = new Map<string, NoteScope>();
  private globalVars = new Map<string, VarEntry>();

  constructor(plugin: EngineeringToolkitPlugin) { this.plugin = plugin; }

  getScope(filePath: string): NoteScope {
    if (!this.scopes.has(filePath)) {
      this.scopes.set(filePath, {
        vars: new Map(),
        formulas: new Map(),
        dependencies: new Map(),
        dependents: new Map(),
        lineCache: new Map()
      });
    }
    return this.scopes.get(filePath)!;
  }
  clearScope(filePath: string) { this.scopes.delete(filePath); }

  async evaluateBlock(source: string, ctx: MarkdownPostProcessorContext): Promise<HTMLElement> {
    const container = document.createElement("div");
    container.classList.add("calc-output");

    const filePath = ctx.sourcePath || "untitled";
    if (!this.plugin.settings.autoRecalc) this.clearScope(filePath);
    const scope = this.getScope(filePath);

    const blockKey = this.buildBlockKey(ctx, source);
    const visitedLineKeys = new Set<string>();
    const dirtyVars = new Set<VarName>();

    const lines = source.split(/\r?\n/);
    lines.forEach((raw, index) => {
      const line = raw.trim();
      if (!line) continue;
      const row = document.createElement("div");
      row.classList.add("calc-line");
      const lineKey = `${blockKey}:${index}`;
      visitedLineKeys.add(lineKey);
      try {
        if (line.startsWith("//") || line.startsWith("#")) {
          row.innerHTML = `<span class="calc-comment">${escapeHtml(line)}</span>`;
        } else if (isAssignment(line)) {
          const { name, expr } = splitAssignment(line);
          const dependencies = this.analyzeDependencies(expr);
          const reasons = this.collectAssignmentReasons(scope, name, expr, dependencies, dirtyVars);
          let entry = scope.vars.get(name);
          if (reasons.length > 0) {
            const value = this.evalExpression(expr, scope);
            const display = formatUnit(value, this.plugin.settings.sigFigs);
            const prevDisplay = entry?.display;
            entry = { value, display };
            scope.vars.set(name, entry);
            if (prevDisplay !== display) {
              dirtyVars.add(name);
              reasons.push("value changed");
            }
            console.debug(`[CalcEngine] Recomputed ${name}`, { expr, dependencies: [...dependencies], reasons });
          } else {
            console.debug(`[CalcEngine] Skipped ${name}, dependencies unchanged`);
          }
          this.updateDependencyGraph(scope, name, expr, dependencies);
          row.innerHTML = `<span class="lhs">${escapeHtml(name)}</span><span class="rhs">= ${entry?.display ?? ""}</span>`;
        } else if (isConvert(line)) {
          const { expr, target } = splitConvert(line);
          const dependencies = this.analyzeDependencies(expr);
          const cached = scope.lineCache.get(lineKey);
          const shouldEval = this.shouldEvaluateLine(cached, expr, dependencies, dirtyVars, target);
          let entry: LineCacheEntry;
          if (shouldEval) {
            const v = this.evalExpression(expr, scope);
            let converted = v;
            if (typeof (v as any)?.to === "function") converted = (v as any).to(target);
            const display = formatUnit(converted, this.plugin.settings.sigFigs);
            entry = { expr, value: converted, display, dependencies: new Set(dependencies), type: "convert", targetUnit: target };
            scope.lineCache.set(lineKey, entry);
            console.debug(`[CalcEngine] Recomputed convert line`, { expr, target, dependencies: [...dependencies] });
          } else {
            entry = cached!;
            console.debug(`[CalcEngine] Skipped convert line`, { expr, target });
          }
          row.innerHTML = `<span class="rhs">${escapeHtml(expr)} → ${escapeHtml(target)} = ${entry.display}</span>`;
        } else {
          const dependencies = this.analyzeDependencies(line);
          const cached = scope.lineCache.get(lineKey);
          const shouldEval = this.shouldEvaluateLine(cached, line, dependencies, dirtyVars);
          let entry: LineCacheEntry;
          if (shouldEval) {
            const value = this.evalExpression(line, scope);
            const display = formatUnit(value, this.plugin.settings.sigFigs);
            entry = { expr: line, value, display, dependencies: new Set(dependencies), type: "expression" };
            scope.lineCache.set(lineKey, entry);
            console.debug(`[CalcEngine] Recomputed expression line`, { expr: line, dependencies: [...dependencies] });
          } else {
            entry = cached!;
            console.debug(`[CalcEngine] Skipped expression line`, { expr: line });
          }
          row.innerHTML = `<span class="rhs">${entry.display}</span>`;
        }
      } catch (e: any) {
        row.classList.add("calc-error");
        row.textContent = `Error: ${e?.message ?? String(e)}`;
      }
      container.appendChild(row);
    });

    for (const key of Array.from(scope.lineCache.keys())) {
      if (key.startsWith(blockKey) && !visitedLineKeys.has(key)) scope.lineCache.delete(key);
    }

    console.debug(`[CalcEngine] Dependency graph for ${filePath}`, this.describeGraph(scope));
    this.plugin.refreshVariablesView(scope);
    return container;
  }

  private evalExpression(expr: string, scope: NoteScope): any {
    const mscope: Record<string, any> = {};
    if (this.plugin.settings.globalVarsEnabled) {
      for (const [k, v] of this.globalVars.entries()) mscope[k] = v.value;
    }
    for (const [k, v] of scope.vars.entries()) mscope[k] = v.value;
    return math.evaluate(expr, mscope);
  }

  private analyzeDependencies(expr: string): Set<VarName> {
    const dependencies = new Set<VarName>();
    try {
      const node = math.parse(expr) as any;
      node.traverse((child: any) => {
        if (child?.isSymbolNode) dependencies.add(child.name as VarName);
      });
    } catch (err) {
      console.debug(`[CalcEngine] Failed to parse expression for dependencies`, { expr, error: err });
    }
    return dependencies;
  }

  private collectAssignmentReasons(
    scope: NoteScope,
    name: VarName,
    expr: string,
    dependencies: Set<VarName>,
    dirtyVars: Set<VarName>
  ): string[] {
    const reasons: string[] = [];
    const previousExpr = scope.formulas.get(name);
    const previousDeps = scope.dependencies.get(name);
    const existing = scope.vars.get(name);
    if (!existing) reasons.push("new variable");
    if (previousExpr !== undefined && previousExpr !== expr) reasons.push("expression updated");
    if (!previousDeps || !setEquals(previousDeps, dependencies)) reasons.push("dependencies updated");
    const dirtyDependencies = [...dependencies].filter(dep => dirtyVars.has(dep));
    if (dirtyDependencies.length > 0) reasons.push(`upstream change: ${dirtyDependencies.join(", ")}`);
    return reasons;
  }

  private shouldEvaluateLine(
    cached: LineCacheEntry | undefined,
    expr: string,
    dependencies: Set<VarName>,
    dirtyVars: Set<VarName>,
    targetUnit?: string
  ): boolean {
    if (!cached) return true;
    if (cached.expr !== expr) return true;
    if (cached.type === "convert" && cached.targetUnit !== targetUnit) return true;
    if (!setEquals(cached.dependencies, dependencies)) return true;
    for (const dep of dependencies) if (dirtyVars.has(dep)) return true;
    return false;
  }

  private updateDependencyGraph(scope: NoteScope, name: VarName, expr: string, dependencies: Set<VarName>) {
    const previous = scope.dependencies.get(name);
    if (previous) {
      for (const dep of previous) {
        if (!dependencies.has(dep)) {
          const dependents = scope.dependents.get(dep);
          if (dependents) {
            dependents.delete(name);
            if (dependents.size === 0) scope.dependents.delete(dep);
          }
        }
      }
    }
    for (const dep of dependencies) {
      if (!scope.dependents.has(dep)) scope.dependents.set(dep, new Set());
      scope.dependents.get(dep)!.add(name);
    }
    scope.dependencies.set(name, new Set(dependencies));
    scope.formulas.set(name, expr);
  }

  private describeGraph(scope: NoteScope) {
    const graph: Record<string, { dependsOn: string[]; dependents: string[] }> = {};
    for (const name of new Set([...scope.dependencies.keys(), ...scope.dependents.keys()])) {
      graph[name] = {
        dependsOn: [...(scope.dependencies.get(name) ?? new Set())],
        dependents: [...(scope.dependents.get(name) ?? new Set())]
      };
    }
    return graph;
  }

  private buildBlockKey(ctx: MarkdownPostProcessorContext, source: string): string {
    const section = ctx.getSectionInfo?.();
    const path = ctx.sourcePath || "untitled";
    if (section) return `${path}:${section.lineStart}-${section.lineEnd}`;
    return `${path}:${this.hashString(source)}`;
  }

  private hashString(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  }
}

function isAssignment(line: string) { return /^[A-Za-z_][A-Za-z0-9_]*\s*=\s*.+$/.test(line); }
function splitAssignment(line: string) {
  const i = line.indexOf("=");
  return { name: line.slice(0, i).trim(), expr: line.slice(i + 1).trim() };
}
function isConvert(line: string) { return /\s(->|to)\s/.test(line); }
function splitConvert(line: string) {
  const m = line.match(/^(.*)\s(?:->|to)\s(.*?)$/);
  if (!m) throw new Error("Bad convert syntax. Use: expr -> unit");
  return { expr: m[1].trim(), target: m[2].trim() };
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!));
}

function setEquals<T>(a?: Set<T>, b?: Set<T>): boolean {
  if (!a || !b) return a === b;
  if (a.size !== b.size) return false;
  for (const val of a) if (!b.has(val)) return false;
  return true;
}
