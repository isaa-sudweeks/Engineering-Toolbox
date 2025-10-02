import { MarkdownPostProcessorContext } from "obsidian";
<<<<<<< HEAD
import {
  math,
  formatUnitLatex,
  escapeLatex,
  normalizeUnitToSystem,
  formatValueParts,
} from "./utils/format";
import type { UnitSystem } from "./utils/format";
import type { NoteScope, VarEntry, GlobalVarEntry } from "./utils/types";
=======
import { math, formatUnit } from "./utils/format";
import type { GlobalVarEntry, NoteScope, VarEntry } from "./utils/types";
>>>>>>> origin/codex/add-api-for-managing-global-constants
import type EngineeringToolkitPlugin from "./main";

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
    if (this.plugin.settings.autoRecalc) this.clearScope(filePath);
    const scope = this.getScope(filePath);
    const useLatex = this.plugin.settings.latexFormatting;
    const system = this.plugin.settings.defaultUnitSystem;

    const lines = source.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const row = document.createElement("div");
      row.classList.add("calc-line");
      try {
        const result = this.evaluateLine(line, scope, system, raw.trim());
        row.dataset.plain = result.plain;
        if (result.kind === "comment") {
          const comment = document.createElement("span");
          comment.classList.add("calc-comment");
          comment.textContent = result.text;
          row.appendChild(comment);
        } else if (result.kind === "assignment") {
          if (useLatex) {
            const latex = buildAssignmentLatex(
              result.name,
              result.expr,
              result.displayValue,
              this.plugin.settings.sigFigs,
            );
            appendLatex(row, latex);
          } else {
            const lhs = document.createElement("span");
            lhs.classList.add("lhs");
            lhs.textContent = result.name;
            const rhs = document.createElement("span");
            rhs.classList.add("rhs");
            rhs.textContent = `= ${result.display}`;
            row.append(lhs, rhs);
          }
        } else if (result.kind === "conversion") {
          if (useLatex) {
            const latex = buildConversionLatex(
              result.expr,
              result.target,
              result.displayValue,
              this.plugin.settings.sigFigs,
            );
            appendLatex(row, latex);
          } else {
            const rhs = document.createElement("span");
            rhs.classList.add("rhs");
            rhs.textContent = `${result.expr} → ${result.target} = ${result.display}`;
            row.appendChild(rhs);
          }
        } else {
          if (useLatex) {
            const latex = buildExpressionLatex(
              result.expr,
              result.displayValue,
              this.plugin.settings.sigFigs,
            );
            appendLatex(row, latex);
          } else {
            const rhs = document.createElement("span");
            rhs.classList.add("rhs");
            rhs.textContent = result.display;
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

  getGlobalVariables(): Map<string, VarEntry> {
    return this.globalVars;
  }

  loadGlobalVars(entries: Record<string, GlobalVarEntry> = {}) {
    this.globalVars.clear();
    const system = this.plugin.settings.defaultUnitSystem;
    for (const [name, persisted] of Object.entries(entries)) {
      if (!persisted) continue;
      const source = persisted.source ?? "";
      let value = persisted.value;
      let formatted = this.formatForDisplay(value, system);
      if (source) {
        try {
          const ctx = this.buildGlobalEvalScope(name);
          value = math.evaluate(source, ctx);
          formatted = this.formatForDisplay(value, system);
        } catch {
          // fall back to persisted fields when evaluation fails
          formatted = {
            display: persisted.display ?? formatted.display,
            magnitude: (persisted as any).magnitude ?? formatted.magnitude,
            unit: (persisted as any).unit ?? formatted.unit,
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
    const entry: VarEntry = {
      value,
      display: formatted.display,
      magnitude: formatted.magnitude,
      unit: formatted.unit,
      source: trimmedSource,
    };
    this.globalVars.set(trimmedName, entry);
    await this.plugin.saveToolkitData();
    return this.toGlobalEntry(entry);
  }

  async deleteGlobalVar(name: string): Promise<void> {
    const trimmedName = name.trim();
    if (!this.globalVars.has(trimmedName)) return;
    this.globalVars.delete(trimmedName);
    await this.plugin.saveToolkitData();
  }

  private evalExpression(expr: string, scope: NoteScope): any {
    const mscope: Record<string, any> = {};
    if (this.plugin.settings.globalVarsEnabled) {
      for (const [k, v] of this.globalVars.entries()) mscope[k] = v.value;
    }
    for (const [k, v] of scope.vars.entries()) mscope[k] = v.value;
    return math.evaluate(expr, mscope);
  }

<<<<<<< HEAD
  private evaluateLine(line: string, scope: NoteScope, system: UnitSystem, sourceLine?: string): LineResult {
    if (line.startsWith("//") || line.startsWith("#")) {
      return { kind: "comment", text: line, plain: line };
    }
    if (isAssignment(line)) {
      const { name, expr } = splitAssignment(line);
      const value = this.evalExpression(expr, scope);
      const displayValue = normalizeUnitToSystem(value, system);
      const formatted = formatValueParts(
        displayValue,
        this.plugin.settings.sigFigs,
        system,
        { skipSystemConversion: true },
      );
      scope.vars.set(name, {
        value,
        magnitude: formatted.magnitude,
        unit: formatted.unit,
        display: formatted.display,
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
      const v = this.evalExpression(expr, scope);
      let converted = v;
      if (typeof (v as any)?.to === "function") converted = (v as any).to(target);
      const formatted = formatValueParts(
        converted,
        this.plugin.settings.sigFigs,
        system,
        { skipSystemConversion: true },
      );
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
    const displayValue = normalizeUnitToSystem(value, system);
    const formatted = formatValueParts(
      displayValue,
      this.plugin.settings.sigFigs,
      system,
      { skipSystemConversion: true },
    );
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
=======
  loadGlobalVars(entries: Record<string, GlobalVarEntry> = {}) {
    this.globalVars.clear();
    for (const [name, entry] of Object.entries(entries)) {
      if (!entry || typeof entry !== "object") continue;
      const source = entry.source ?? "";
      let value = entry.value;
      let display = entry.display ?? "";
      if (source) {
        try {
          const ctx = this.buildGlobalEvalScope(name);
          value = math.evaluate(source, ctx);
          display = formatUnit(value, this.plugin.settings.sigFigs);
        } catch (e) {
          // fall back to persisted value/display if evaluation fails
        }
      }
      if (!display && value !== undefined) {
        try { display = formatUnit(value, this.plugin.settings.sigFigs); } catch (e) {}
      }
      this.globalVars.set(name, { value, display, source });
    }
  }

  private formatForDisplay(value: any, system: UnitSystem) {
    const displayValue = normalizeUnitToSystem(value, system);
    const formatted = formatValueParts(displayValue, this.plugin.settings.sigFigs, system, { skipSystemConversion: true });
    return formatted;
  }

  private buildGlobalEvalScope(skip?: string): Record<string, any> {
    const scope: Record<string, any> = {};
    for (const [k, v] of this.globalVars.entries()) {
      if (skip && k === skip) continue;
      scope[k] = v.value;
    }
    return scope;
  }

  private toGlobalEntry(entry: VarEntry): GlobalVarEntry {
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

  getGlobalVarsSnapshot(): Array<[string, GlobalVarEntry]> {
    return Array.from(this.globalVars.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  serializeGlobalVars(): Record<string, GlobalVarEntry> {
    const out: Record<string, GlobalVarEntry> = {};
    for (const [name, entry] of this.globalVars.entries()) {
      out[name] = { ...entry, source: entry.source ?? "" };
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
    const display = formatUnit(value, this.plugin.settings.sigFigs);
    const entry: GlobalVarEntry = { value, display, source: trimmedSource };
    this.globalVars.set(trimmedName, entry);
    await this.plugin.saveToolkitData();
    return entry;
  }

  async deleteGlobalVar(name: string): Promise<void> {
    const trimmedName = name.trim();
    if (!this.globalVars.has(trimmedName)) return;
    this.globalVars.delete(trimmedName);
    await this.plugin.saveToolkitData();
  }

  private buildGlobalEvalScope(skip?: string): Record<string, any> {
    const scope: Record<string, any> = {};
    for (const [k, v] of this.globalVars.entries()) {
      if (skip && k === skip) continue;
      scope[k] = v.value;
    }
    return scope;
  }

  private isValidIdentifier(name: string) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
>>>>>>> origin/codex/add-api-for-managing-global-constants
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
