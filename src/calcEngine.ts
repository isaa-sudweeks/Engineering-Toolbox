import { MarkdownPostProcessorContext } from "obsidian";
import { math, formatUnit } from "./utils/format";
import type { GlobalVarEntry, NoteScope, VarEntry } from "./utils/types";
import type EngineeringToolkitPlugin from "./main";

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
    if (!this.plugin.settings.autoRecalc) this.clearScope(filePath);
    const scope = this.getScope(filePath);

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
          const display = formatUnit(value, this.plugin.settings.sigFigs);
          scope.vars.set(name, { value, display });
          row.innerHTML = `<span class="lhs">${escapeHtml(name)}</span><span class="rhs">= ${display}</span>`;
        } else if (isConvert(line)) {
          const { expr, target } = splitConvert(line);
          const v = this.evalExpression(expr, scope);
          let converted = v;
          if (typeof (v as any)?.to === "function") converted = (v as any).to(target);
          const display = formatUnit(converted, this.plugin.settings.sigFigs);
          row.innerHTML = `<span class="rhs">${escapeHtml(expr)} → ${escapeHtml(target)} = ${display}</span>`;
        } else {
          const value = this.evalExpression(line, scope);
          const display = formatUnit(value, this.plugin.settings.sigFigs);
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
