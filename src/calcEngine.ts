import { MarkdownPostProcessorContext } from "obsidian";
import { math, formatUnit, formatUnitLatex, escapeLatex } from "./utils/format";
import type { NoteScope, VarEntry } from "./utils/types";
import type EngineeringToolkitPlugin from "./main";

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
    const useLatex = this.plugin.settings.latexFormatting;

    const lines = source.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const row = document.createElement("div");
      row.classList.add("calc-line");
      try {
        if (line.startsWith("//") || line.startsWith("#")) {
          const comment = document.createElement("span");
          comment.classList.add("calc-comment");
          comment.textContent = line;
          row.appendChild(comment);
          row.dataset.plain = line;
        } else if (isAssignment(line)) {
          const { name, expr } = splitAssignment(line);
          const value = this.evalExpression(expr, scope);
          const display = formatUnit(value, this.plugin.settings.sigFigs);
          scope.vars.set(name, { value, display });
          row.dataset.plain = `${name} = ${display}`;
          if (useLatex) {
            const latex = buildAssignmentLatex(name, expr, value, this.plugin.settings.sigFigs);
            appendLatex(row, latex);
          } else {
            const lhs = document.createElement("span");
            lhs.classList.add("lhs");
            lhs.textContent = name;
            row.appendChild(lhs);
            const rhs = document.createElement("span");
            rhs.classList.add("rhs");
            rhs.textContent = `= ${display}`;
            row.appendChild(rhs);
          }
        } else if (isConvert(line)) {
          const { expr, target } = splitConvert(line);
          const v = this.evalExpression(expr, scope);
          let converted = v;
          if (typeof (v as any)?.to === "function") converted = (v as any).to(target);
          const display = formatUnit(converted, this.plugin.settings.sigFigs);
          row.dataset.plain = `${expr} → ${target} = ${display}`;
          if (useLatex) {
            const latex = buildConversionLatex(expr, target, converted, this.plugin.settings.sigFigs);
            appendLatex(row, latex);
          } else {
            const rhs = document.createElement("span");
            rhs.classList.add("rhs");
            rhs.textContent = `${expr} → ${target} = ${display}`;
            row.appendChild(rhs);
          }
        } else {
          const value = this.evalExpression(line, scope);
          const display = formatUnit(value, this.plugin.settings.sigFigs);
          row.dataset.plain = `${line} = ${display}`;
          if (useLatex) {
            const latex = buildExpressionLatex(line, value, this.plugin.settings.sigFigs);
            appendLatex(row, latex);
          } else {
            const rhs = document.createElement("span");
            rhs.classList.add("rhs");
            rhs.textContent = display;
            row.appendChild(rhs);
          }
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
