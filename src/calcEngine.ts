import { MarkdownPostProcessorContext } from "obsidian";
import { math, formatUnit, normalizeUnitToSystem } from "./utils/format";
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

    const system = this.plugin.settings.defaultUnitSystem;
    const lines = source.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const row = document.createElement("div");
      row.classList.add("calc-line");
      try {
        if (line.startsWith("//") || line.startsWith("#")) {
          row.innerHTML = `<span class="calc-comment">${escapeHtml(line)}</span>`;
        } else if (isAssignment(line)) {
          const { name, expr } = splitAssignment(line);
          const value = this.evalExpression(expr, scope);
          const displayValue = normalizeUnitToSystem(value, system);
          const display = formatUnit(displayValue, this.plugin.settings.sigFigs, system, { skipSystemConversion: true });
          scope.vars.set(name, { value, display });
          row.innerHTML = `<span class="lhs">${escapeHtml(name)}</span><span class="rhs">= ${display}</span>`;
        } else if (isConvert(line)) {
          const { expr, target } = splitConvert(line);
          const v = this.evalExpression(expr, scope);
          let converted = v;
          if (typeof (v as any)?.to === "function") converted = (v as any).to(target);
          const display = formatUnit(converted, this.plugin.settings.sigFigs, system, { skipSystemConversion: true });
          row.innerHTML = `<span class="rhs">${escapeHtml(expr)} → ${escapeHtml(target)} = ${display}</span>`;
        } else {
          const value = this.evalExpression(line, scope);
          const displayValue = normalizeUnitToSystem(value, system);
          const display = formatUnit(displayValue, this.plugin.settings.sigFigs, system, { skipSystemConversion: true });
          row.innerHTML = `<span class="rhs">${display}</span>`;
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
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!));
}
