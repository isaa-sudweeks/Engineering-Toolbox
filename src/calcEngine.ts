import { MarkdownPostProcessorContext } from "obsidian";

import {
  math,
  formatUnitLatex,
  escapeLatex,
  normalizeUnitToSystem,
  formatValueParts,
  UnitSystem,
} from "./utils/format";
import type { NoteScope, VarEntry, GlobalVarEntry, VarName, LineCacheEntry } from "./utils/types";
import type EngineeringToolkitPlugin from "./main";

export type EvaluatedLineType = "blank" | "comment" | "assignment" | "convert" | "expression" | "error";

export interface EvaluatedLine {
  raw: string;
  line: string;
  type: EvaluatedLineType;
  name?: string;
  expr?: string;
  target?: string;
  value?: any;
  display?: string;
  displayValue?: any;
  magnitude?: string;
  unit?: string;
  plain?: string;
  text?: string;
  error?: string;
}

export interface EvaluateOptions {
  /** When false, scope mutations are kept local to the provided scope */
  persist?: boolean;
  /** Optional working scope when persist is false */
  scope?: NoteScope;
  /** Clear the working scope before evaluating */
  resetScope?: boolean;
  /** Optional key to identify the calc block for caching */
  blockKey?: string;
}

type LineResult =
  | { kind: "comment"; text: string; plain: string }
  | {
      kind: "assignment";
      name: string;
      expr: string;
      value: any;
      displayValue: any;
      display: string;
      magnitude: string;
      unit: string;
      plain: string;
    }
  | {
      kind: "conversion";
      expr: string;
      target: string;
      value: any;
      displayValue: any;
      display: string;
      magnitude: string;
      unit: string;
      plain: string;
    }
  | {
      kind: "expression";
      expr: string;
      value: any;
      displayValue: any;
      display: string;
      magnitude: string;
      unit: string;
      plain: string;
    };

export class CalcEngine {
  private plugin: EngineeringToolkitPlugin;
  private scopes = new Map<string, NoteScope>();
  private globalVars = new Map<string, GlobalVarEntry>();
  private readonly unitNames = Object.freeze(
    Object.keys(((math as any).Unit?.UNITS ?? {}) as Record<string, unknown>).sort((a, b) => a.localeCompare(b))
  );

  constructor(plugin: EngineeringToolkitPlugin) {
    this.plugin = plugin;
  }

  getScope(filePath: string): NoteScope {
    let scope = this.scopes.get(filePath);
    if (!scope) {
      scope = {
        vars: new Map(),
        formulas: new Map(),
        dependencies: new Map(),
        dependents: new Map(),
        lineCache: new Map(),
      };
      this.scopes.set(filePath, scope);
    } else {
      this.ensureScopeMaps(scope);
    }
    return scope;
  }
  peekScope(filePath: string): NoteScope | null {
    const scope = this.scopes.get(filePath);
    if (!scope) return null;
    this.ensureScopeMaps(scope);
    return scope;
  }

  clearScope(filePath: string) {
    const removed = this.scopes.delete(filePath);
    if (removed) this.plugin.handleScopeChanged(filePath);
  }
  clearAllScopes() {
    if (this.scopes.size === 0) return;
    this.scopes.clear();
    this.plugin.handleScopeChanged(null);
  }

  listGlobalVars(): ReadonlyMap<string, GlobalVarEntry> { return this.globalVars; }
  listKnownUnits(): readonly string[] { return this.unitNames; }

  async evaluateBlock(source: string, ctx: MarkdownPostProcessorContext): Promise<HTMLElement> {
    const container = document.createElement("div");
    container.classList.add("calc-output");

    const filePath = ctx.sourcePath || "untitled";
    const useLatex = this.plugin.settings.latexFormatting;
    const blockKey = this.buildBlockKey(ctx, source);
    const { entries, scope } = this.evaluateToEntries(source, filePath, {
      persist: true,
      resetScope: this.plugin.settings.autoRecalc,
      blockKey,
    });


    for (const entry of entries) {
      if (entry.type === "blank") continue;
      const row = document.createElement("div");
      row.classList.add("calc-line");
      row.dataset.plain = entry.plain ?? entry.line ?? "";

      if (entry.type === "comment") {
        const comment = document.createElement("span");
        comment.classList.add("calc-comment");
        comment.textContent = entry.text ?? entry.line;
        row.appendChild(comment);
      } else if (entry.type === "assignment") {
        if (useLatex && entry.displayValue !== undefined) {
          const latex = buildAssignmentLatex(
            entry.name ?? "",
            entry.expr ?? "",
            entry.displayValue,
            this.plugin.settings.sigFigs,
          );
          appendLatex(row, latex);
        } else {
          const lhs = document.createElement("span");
          lhs.classList.add("lhs");
          lhs.textContent = entry.name ?? "";
          const rhs = document.createElement("span");
          rhs.classList.add("rhs");
          rhs.textContent = `= ${entry.display ?? ""}`;
          row.append(lhs, rhs);
        }
      } else if (entry.type === "convert") {
        if (useLatex && entry.displayValue !== undefined) {
          const latex = buildConversionLatex(
            entry.expr ?? "",
            entry.target ?? "",
            entry.displayValue,
            this.plugin.settings.sigFigs,
          );
          appendLatex(row, latex);
        } else {
          const rhs = document.createElement("span");
          rhs.classList.add("rhs");
          rhs.textContent = `${entry.expr ?? ""} → ${entry.target ?? ""} = ${entry.display ?? ""}`;
          row.appendChild(rhs);
        }
      } else if (entry.type === "expression") {
        if (useLatex && entry.displayValue !== undefined) {
          const latex = buildExpressionLatex(
            entry.expr ?? "",
            entry.displayValue,
            this.plugin.settings.sigFigs,
          );
          appendLatex(row, latex);
        } else {
          const rhs = document.createElement("span");
          rhs.classList.add("rhs");
          rhs.textContent = entry.display ?? "";
          row.appendChild(rhs);
        }
      } else if (entry.type === "error") {
        row.classList.add("calc-error");
        row.textContent = `Error: ${entry.error ?? ""}`;
      }

      container.appendChild(row);
    }

    this.plugin.refreshVariablesView(scope);
    this.plugin.handleScopeChanged(filePath);
    return container;
  }

  async evaluateInline(source: string, ctx: MarkdownPostProcessorContext): Promise<HTMLElement> {
    const span = document.createElement("span");
    span.classList.add("calc-inline");

    const statement = source.trim();
    if (!statement) return span;

    const filePath = ctx.sourcePath || "untitled";
    const scope = this.getScope(filePath);
    const system = this.plugin.settings.defaultUnitSystem;

    try {
      const result = this.evaluateLine(statement, scope, system);
      if (result.kind === "assignment") {
        const lhs = document.createElement("span");
        lhs.classList.add("lhs");
        lhs.textContent = result.name;
        const rhs = document.createElement("span");
        rhs.classList.add("rhs");
        rhs.textContent = `= ${result.display}`;
        span.append(lhs, rhs);
      } else if (result.kind === "conversion" || result.kind === "expression") {
        const rhs = document.createElement("span");
        rhs.classList.add("rhs");
        rhs.textContent = `= ${result.display}`;
        span.appendChild(rhs);
      } else {
        span.textContent = statement;
      }
    } catch (error: any) {
      span.classList.add("calc-inline-error");
      span.textContent = `Error: ${error?.message ?? String(error)}`;
    }

    this.plugin.refreshVariablesView(scope);
    this.plugin.handleScopeChanged(filePath);
    return span;
  }

  evaluateToEntries(source: string, filePath: string, options?: EvaluateOptions): { entries: EvaluatedLine[]; scope: NoteScope } {
    const persist = options?.persist ?? true;
    let workingScope: NoteScope;
    if (persist) {
      const shouldReset = options?.resetScope ?? false;
      if (shouldReset) this.clearScope(filePath);
      workingScope = this.getScope(filePath);
    } else if (options?.scope) {
      if (options.resetScope) options.scope.vars.clear();
      workingScope = options.scope;
    } else {
      workingScope = { vars: new Map() };
    }

    this.ensureScopeMaps(workingScope);
    const system = this.plugin.settings.defaultUnitSystem;
    const entries: EvaluatedLine[] = [];
    const lines = source.split(/\r?\n/);
    const blockKey = options?.blockKey ?? `${filePath}:${hashString(source)}`;
    const visitedLineKeys = new Set<string>();
    lines.forEach((raw, index) => {
      const line = raw.trim();
      const lineKey = `${blockKey}:${index}`;
      visitedLineKeys.add(lineKey);
      if (!line) {
        entries.push({ raw, line: "", type: "blank" });
        return;
      }

      try {
        const result = this.evaluateLine(line, workingScope, system, raw.trim());
        if (result.kind === "comment") {
          entries.push({ raw, line, type: "comment", text: result.text, plain: result.plain });
        } else if (result.kind === "assignment") {
          const dependencies = this.analyzeDependencies(result.expr ?? "");
          if (result.name) this.updateDependencyGraph(workingScope, result.name, result.expr ?? "", dependencies);
          entries.push({
            raw,
            line,
            type: "assignment",
            name: result.name,
            expr: result.expr,
            value: result.value,
            display: result.display,
            displayValue: result.displayValue,
            magnitude: result.magnitude,
            unit: result.unit,
            plain: result.plain,
          });
        } else if (result.kind === "conversion") {
          const dependencies = this.analyzeDependencies(result.expr ?? "");
          workingScope.lineCache.set(lineKey, {
            expr: result.expr ?? "",
            value: result.value,
            display: result.display ?? "",
            dependencies,
            type: "convert",
            targetUnit: result.target,
          });
          entries.push({
            raw,
            line,
            type: "convert",
            expr: result.expr,
            target: result.target,
            value: result.value,
            display: result.display,
            displayValue: result.displayValue,
            magnitude: result.magnitude,
            unit: result.unit,
            plain: result.plain,
          });
        } else if (result.kind === "expression") {
          const dependencies = this.analyzeDependencies(result.expr ?? "");
          workingScope.lineCache.set(lineKey, {
            expr: result.expr ?? "",
            value: result.value,
            display: result.display ?? "",
            dependencies,
            type: "expression",
          });
          entries.push({
            raw,
            line,
            type: "expression",
            expr: result.expr,
            value: result.value,
            display: result.display,
            displayValue: result.displayValue,
            magnitude: result.magnitude,
            unit: result.unit,
            plain: result.plain,
          });
        }
      } catch (error: any) {
        const message = error?.message ?? String(error);
        entries.push({ raw, line, type: "error", error: message, plain: line });
      }
    });

    for (const key of Array.from(workingScope.lineCache.keys())) {
      if (key.startsWith(`${blockKey}:`) && !visitedLineKeys.has(key)) {
        workingScope.lineCache.delete(key);
      }
    }

    return { entries, scope: workingScope };
  }

  getGlobalVariables(): Map<string, GlobalVarEntry> {
    return this.globalVars;
  }

  loadGlobalVars(entries: Record<string, GlobalVarEntry> = {}) {
    this.globalVars.clear();
    const system = this.plugin.settings.defaultUnitSystem;
    for (const [name, entry] of Object.entries(entries)) {
      if (!entry) continue;
      const source = entry.source ?? "";
      let value = entry.value;
      let formatted = this.formatForDisplay(value, system);
      if (source) {
        try {
          const scope = this.buildGlobalEvalScope(name);
          value = math.evaluate(source, scope);
          formatted = this.formatForDisplay(value, system);
        } catch {
          formatted = {
            display: entry.display ?? formatted.display,
            magnitude: entry.magnitude ?? formatted.magnitude,
            unit: entry.unit ?? formatted.unit,
          };
        }
      }
      this.globalVars.set(name, {
        value,
        display: formatted.display,
        magnitude: formatted.magnitude,
        unit: formatted.unit,
        source,
      });
    }
    this.plugin.handleScopeChanged(null);
  }

  getGlobalVarsSnapshot(): Array<[string, GlobalVarEntry]> {
    return Array.from(this.globalVars.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, entry]) => [name, this.toGlobalEntry(entry)] as [string, GlobalVarEntry]);
  }

  serializeGlobalVars(): Record<string, GlobalVarEntry> {
    const out: Record<string, GlobalVarEntry> = {};
    for (const [name, entry] of this.globalVars.entries()) {
      out[name] = this.toGlobalEntry(entry);
    }
    return out;
  }

  async upsertGlobalVar(name: string, source: string): Promise<GlobalVarEntry> {
    const trimmedName = name.trim();
    const trimmedSource = source.trim();
    if (!trimmedName) throw new Error("Name is required");
    if (!this.isValidIdentifier(trimmedName)) throw new Error("Invalid variable name");
    if (!trimmedSource) throw new Error("Expression is required");

    const context = this.buildGlobalEvalScope(trimmedName);
    const value = math.evaluate(trimmedSource, context);
    const system = this.plugin.settings.defaultUnitSystem;
    const formatted = this.formatForDisplay(value, system);

    const entry: GlobalVarEntry = {
      value,
      display: formatted.display,
      magnitude: formatted.magnitude,
      unit: formatted.unit,
      source: trimmedSource,
    };
    this.globalVars.set(trimmedName, entry);
    await this.plugin.saveToolkitData();
    this.plugin.handleScopeChanged(null);
    return entry;
  }

  async deleteGlobalVar(name: string): Promise<void> {
    const trimmedName = name.trim();
    if (!this.globalVars.has(trimmedName)) return;
    this.globalVars.delete(trimmedName);
    await this.plugin.saveToolkitData();
    this.plugin.handleScopeChanged(null);
  }

  private evalExpression(expr: string, scope: NoteScope): any {
    const evaluationScope: Record<string, any> = {};
    if (this.plugin.settings.globalVarsEnabled) {
      for (const [k, v] of this.globalVars.entries()) evaluationScope[k] = v.value;
    }
    for (const [k, v] of scope.vars.entries()) evaluationScope[k] = v.value;
    return math.evaluate(expr, evaluationScope);
  }

  private evaluateLine(line: string, scope: NoteScope, system: UnitSystem, sourceLine?: string): LineResult {
    if (line.startsWith("//") || line.startsWith("#")) {
      return { kind: "comment", text: line, plain: line };
    }

    if (isAssignment(line)) {
      const { name, expr } = splitAssignment(line);
      const value = this.evalExpression(expr, scope);
      const { displayValue, formatted } = this.formatForEvaluation(value, system);
      scope.vars.set(name, {
        value,
        display: formatted.display,
        magnitude: formatted.magnitude,
        unit: formatted.unit,
        sourceLine,
      });
      return {
        kind: "assignment",
        name,
        expr,
        value,
        displayValue,
        display: formatted.display,
        magnitude: formatted.magnitude,
        unit: formatted.unit,
        plain: `${name} = ${formatted.display}`,
      };
    }

    if (isConvert(line)) {
      const { expr, target } = splitConvert(line);
      const original = this.evalExpression(expr, scope);
      let converted = original;
      if (typeof (original as any)?.to === "function") converted = (original as any).to(target);
      const formatted = formatValueParts(converted, this.plugin.settings.sigFigs, system, { skipSystemConversion: true });
      return {
        kind: "conversion",
        expr,
        target,
        value: converted,
        displayValue: converted,
        display: formatted.display,
        magnitude: formatted.magnitude,
        unit: formatted.unit,
        plain: `${expr} → ${target} = ${formatted.display}`,
      };
    }

    const value = this.evalExpression(line, scope);
    const { displayValue, formatted } = this.formatForEvaluation(value, system);
    return {
      kind: "expression",
      expr: line,
      value,
      displayValue,
      display: formatted.display,
      magnitude: formatted.magnitude,
      unit: formatted.unit,
      plain: `${line} = ${formatted.display}`,
    };
  }

  private formatForEvaluation(value: any, system: UnitSystem) {
    const displayValue = normalizeUnitToSystem(value, system);
    const formatted = formatValueParts(displayValue, this.plugin.settings.sigFigs, system, { skipSystemConversion: true });
    return { displayValue, formatted };
  }

  private ensureScopeMaps(scope: NoteScope) {
    if (!scope.formulas) scope.formulas = new Map();
    if (!scope.dependencies) scope.dependencies = new Map();
    if (!scope.dependents) scope.dependents = new Map();
    if (!scope.lineCache) scope.lineCache = new Map();
  }

  private buildBlockKey(ctx: MarkdownPostProcessorContext, source: string): string {
    const docId = (ctx as any)?.docId;
    if (docId !== undefined) return String(docId);
    const path = ctx.sourcePath || "untitled";
    return `${path}:${hashString(source)}`;
  }

  private analyzeDependencies(expr: string): Set<VarName> {
    const dependencies = new Set<VarName>();
    if (!expr) return dependencies;
    try {
      const node = math.parse(expr) as any;
      node.traverse((child: any) => {
        if (child?.isSymbolNode) dependencies.add(child.name as VarName);
      });
    } catch (error) {
      console.debug("[CalcEngine] Failed to parse dependencies", { expr, error });
    }
    return dependencies;
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

  private buildGlobalEvalScope(skip?: string): Record<string, any> {
    const scope: Record<string, any> = {};
    for (const [key, entry] of this.globalVars.entries()) {
      if (skip && key === skip) continue;
      scope[key] = entry.value;
    }
    return scope;
  }

  private toGlobalEntry(entry: GlobalVarEntry): GlobalVarEntry {
    return {
      value: entry.value,
      display: entry.display,
      magnitude: entry.magnitude,
      unit: entry.unit,
      source: entry.source ?? "",
    };
  }

  private isValidIdentifier(name: string) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
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

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

function appendLatex(row: HTMLElement, latex: string) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("calc-equation", "mathjax-block");
  wrapper.textContent = `$$${latex}$$`;
  row.appendChild(wrapper);
}

function buildAssignmentLatex(name: string, expr: string, value: any, precision: number): string {
  const lhs = identifierToLatex(name);
  const exprTex = expressionToLatex(expr);
  const result = formatUnitLatex(value, precision);
  return wrapAligned([`${lhs} &= ${exprTex}`, `&= ${result}`]);
}

function buildConversionLatex(expr: string, target: string, value: any, precision: number): string {
  const exprTex = expressionToLatex(expr);
  const targetTex = expressionToLatex(target);
  const result = formatUnitLatex(value, precision);
  return wrapAligned([`${exprTex} &\rightarrow ${targetTex}`, `&= ${result}`]);
}

function buildExpressionLatex(expr: string, value: any, precision: number): string {
  const exprTex = expressionToLatex(expr);
  const result = formatUnitLatex(value, precision);
  return wrapAligned([`${exprTex} &= ${result}`]);
}

function expressionToLatex(expr: string): string {
  try {
    return math.parse(expr).toTex({ parenthesis: "auto" }).trim();
  } catch {
    return escapeLatex(expr);
  }
}

function identifierToLatex(name: string): string {
  try {
    return math.parse(name).toTex({ parenthesis: "auto" }).trim();
  } catch {
    return escapeLatex(name);
  }
}

function wrapAligned(lines: string[]): string {
  return `\\begin{aligned} ${lines.join(" \\\\ ")} \\end{aligned}`;
}
