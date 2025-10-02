import { MarkdownPostProcessorContext } from "obsidian";
import { math, formatUnit } from "./utils/format";
import type { NoteScope, VarEntry } from "./utils/types";
import type EngineeringToolkitPlugin from "./main";

type LineResult =
  | { kind: "comment"; text: string }
  | { kind: "assignment"; name: string; display: string }
  | { kind: "conversion"; expr: string; target: string; display: string }
  | { kind: "expression"; display: string };

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
    if (!this.plugin.settings.autoRecalc) this.clearScope(filePath);
    const scope = this.getScope(filePath);

    const lines = source.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const row = document.createElement("div");
      row.classList.add("calc-line");
      try {
        const result = this.evaluateLine(line, scope);
        if (result.kind === "comment") {
          row.innerHTML = `<span class="calc-comment">${escapeHtml(result.text)}</span>`;
        } else if (result.kind === "assignment") {
          row.innerHTML = `<span class="lhs">${escapeHtml(result.name)}</span><span class="rhs">= ${result.display}</span>`;
        } else if (result.kind === "conversion") {
          row.innerHTML = `<span class="rhs">${escapeHtml(result.expr)} → ${escapeHtml(result.target)} = ${result.display}</span>`;
        } else {
          row.innerHTML = `<span class="rhs">${result.display}</span>`;
        }
      } catch (e: any) {
        row.classList.add("calc-error");
        row.textContent = `Error: ${e?.message ?? String(e)}`;
      }
      container.appendChild(row);
    }
    this.plugin.refreshVariablesView(scope);
    return container;
  }

  async evaluateInline(source: string, ctx: MarkdownPostProcessorContext): Promise<HTMLElement> {
    const span = document.createElement("span");
    span.classList.add("calc-inline");

    const statement = source.trim();
    if (!statement) return span;

    const filePath = ctx.sourcePath || "untitled";
    const scope = this.getScope(filePath);

    try {
      const result = this.evaluateLine(statement, scope);
      if (result.kind === "assignment") {
        const lhs = document.createElement("span");
        lhs.classList.add("lhs");
        lhs.textContent = result.name;
        const rhs = document.createElement("span");
        rhs.classList.add("rhs");
        rhs.textContent = `= ${result.display}`;
        span.append(lhs, rhs);
      } else if (result.kind === "conversion") {
        const rhs = document.createElement("span");
        rhs.classList.add("rhs");
        rhs.textContent = `= ${result.display}`;
        span.appendChild(rhs);
      } else if (result.kind === "expression") {
        const rhs = document.createElement("span");
        rhs.classList.add("rhs");
        rhs.textContent = `= ${result.display}`;
        span.appendChild(rhs);
      } else {
        span.textContent = statement;
      }
    } catch (e: any) {
      span.classList.add("calc-inline-error");
      span.textContent = `Error: ${e?.message ?? String(e)}`;
    }

    this.plugin.refreshVariablesView(scope);
    return span;
  }

  private evalExpression(expr: string, scope: NoteScope): any {
    const mscope: Record<string, any> = {};
    if (this.plugin.settings.globalVarsEnabled) {
      for (const [k, v] of this.globalVars.entries()) mscope[k] = v.value;
    }
    for (const [k, v] of scope.vars.entries()) mscope[k] = v.value;
    return math.evaluate(expr, mscope);
  }

  private evaluateLine(line: string, scope: NoteScope): LineResult {
    if (line.startsWith("//") || line.startsWith("#")) {
      return { kind: "comment", text: line };
    }
    if (isAssignment(line)) {
      const { name, expr } = splitAssignment(line);
      const value = this.evalExpression(expr, scope);
      const display = formatUnit(value, this.plugin.settings.sigFigs);
      scope.vars.set(name, { value, display });
      return { kind: "assignment", name, display };
    }
    if (isConvert(line)) {
      const { expr, target } = splitConvert(line);
      const v = this.evalExpression(expr, scope);
      let converted = v;
      if (typeof (v as any)?.to === "function") converted = (v as any).to(target);
      const display = formatUnit(converted, this.plugin.settings.sigFigs);
      return { kind: "conversion", expr, target, display };
    }
    const value = this.evalExpression(line, scope);
    const display = formatUnit(value, this.plugin.settings.sigFigs);
    return { kind: "expression", display };
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
