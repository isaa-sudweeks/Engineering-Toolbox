import { MarkdownPostProcessorContext } from "obsidian";
import { math, formatUnit } from "./utils/format";
import type { NoteScope, VarEntry } from "./utils/types";
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
  error?: string;
}

export interface EvaluateOptions {
  /** When false, scope mutations are kept local to the provided scope */
  persist?: boolean;
  /** Optional working scope when persist is false */
  scope?: NoteScope;
  /** Clear the working scope before evaluating */
  resetScope?: boolean;
}

export class CalcEngine {
  private plugin: EngineeringToolkitPlugin;
  private scopes = new Map<string, NoteScope>();
  private globalVars = new Map<string, VarEntry>();

  constructor(plugin: EngineeringToolkitPlugin) { this.plugin = plugin; }

  getScope(filePath: string): NoteScope {
    if (!this.scopes.has(filePath)) this.scopes.set(filePath, { vars: new Map() });
    return this.scopes.get(filePath)!;
  }
  clearScope(filePath: string) { this.scopes.delete(filePath); }

  async evaluateBlock(source: string, ctx: MarkdownPostProcessorContext): Promise<HTMLElement> {
    const container = document.createElement("div");
    container.classList.add("calc-output");

    const filePath = ctx.sourcePath || "untitled";
    const { entries, scope } = this.evaluateToEntries(source, filePath, {
      persist: true,
      resetScope: !this.plugin.settings.autoRecalc
    });

    for (const entry of entries) {
      if (entry.type === "blank") continue;
      const row = document.createElement("div");
      row.classList.add("calc-line");
      switch (entry.type) {
        case "comment":
          row.innerHTML = `<span class="calc-comment">${escapeHtml(entry.line)}</span>`;
          break;
        case "assignment":
          row.innerHTML = `<span class="lhs">${escapeHtml(entry.name || "")}</span><span class="rhs">= ${entry.display ?? ""}</span>`;
          break;
        case "convert":
          row.innerHTML = `<span class="rhs">${escapeHtml(entry.expr || "")} → ${escapeHtml(entry.target || "")} = ${entry.display ?? ""}</span>`;
          break;
        case "expression":
          row.innerHTML = `<span class="rhs">${entry.display ?? ""}</span>`;
          break;
        case "error":
          row.classList.add("calc-error");
          row.textContent = `Error: ${entry.error}`;
          break;
      }
      container.appendChild(row);
    }
    this.plugin.refreshVariablesView(scope);
    return container;
  }

  evaluateToEntries(source: string, filePath: string, options?: EvaluateOptions): { entries: EvaluatedLine[]; scope: NoteScope } {
    const persist = options?.persist ?? true;
    let workingScope: NoteScope;
    if (persist) {
      const shouldReset = options?.resetScope ?? (!this.plugin.settings.autoRecalc);
      if (shouldReset) this.clearScope(filePath);
      workingScope = this.getScope(filePath);
    } else if (options?.scope) {
      if (options.resetScope) options.scope.vars.clear();
      workingScope = options.scope;
    } else {
      workingScope = { vars: new Map() };
    }

    const entries: EvaluatedLine[] = [];
    const lines = source.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        entries.push({ raw, line: "", type: "blank" });
        continue;
      }
      try {
        if (line.startsWith("//") || line.startsWith("#")) {
          entries.push({ raw, line, type: "comment" });
        } else if (isAssignment(line)) {
          const { name, expr } = splitAssignment(line);
          const value = this.evalExpression(expr, workingScope);
          const display = formatUnit(value, this.plugin.settings.sigFigs);
          workingScope.vars.set(name, { value, display });
          entries.push({ raw, line, type: "assignment", name, expr, value, display });
        } else if (isConvert(line)) {
          const { expr, target } = splitConvert(line);
          const v = this.evalExpression(expr, workingScope);
          let converted = v;
          if (typeof (v as any)?.to === "function") converted = (v as any).to(target);
          const display = formatUnit(converted, this.plugin.settings.sigFigs);
          entries.push({ raw, line, type: "convert", expr, target, value: converted, display });
        } else {
          const value = this.evalExpression(line, workingScope);
          const display = formatUnit(value, this.plugin.settings.sigFigs);
          entries.push({ raw, line, type: "expression", expr: line, value, display });
        }
      } catch (e: any) {
        const message = e?.message ?? String(e);
        entries.push({ raw, line, type: "error", error: message });
      }
    }

    return { entries, scope: workingScope };
  }

  private evalExpression(expr: string, scope: NoteScope): any {
    const mscope: Record<string, any> = {};
    if (this.plugin.settings.globalVarsEnabled) {
      for (const [k, v] of this.globalVars.entries()) mscope[k] = v.value;
    }
    for (const [k, v] of scope.vars.entries()) mscope[k] = v.value;
    return math.evaluate(expr, mscope);
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
