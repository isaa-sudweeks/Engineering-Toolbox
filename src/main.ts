import { Plugin, MarkdownPostProcessorContext, WorkspaceLeaf, MarkdownView } from "obsidian";
import { DEFAULT_SETTINGS, ToolkitSettingTab } from "./settings";
import type { ToolkitSettings, NoteScope } from "./utils/types";
import { CalcEngine } from "./calcEngine";
import { VariablesView, VIEW_TYPE_VARS } from "./variablesView";
import { createExperimentNote } from "./labJournal";

export default class EngineeringToolkitPlugin extends Plugin {
  settings: ToolkitSettings;
  private calc: CalcEngine;
  private varsLeaf: WorkspaceLeaf | null = null;
  private currentScope: NoteScope | null = null;

  async onload() {
    console.log("Loading Engineering Toolkit");
    await this.loadSettings();
    this.calc = new CalcEngine(this);

    this.addSettingTab(new ToolkitSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_VARS, (leaf) => new VariablesView(leaf, this));
    this.addCommand({
      id: "open-variables-view",
      name: "Open Variables Panel",
      callback: async () => { await this.openVariablesView(); }
    });

    this.registerMarkdownCodeBlockProcessor("calc", async (source, el, ctx) => {
      const out = await this.calc.evaluateBlock(source, ctx);
      el.appendChild(out);
      this.currentScope = (this.calc as any)["getScope"](ctx.sourcePath);
      this.refreshVariablesView(this.currentScope!);
    });

    this.addCommand({
      id: "recalculate-note",
      name: "Recalculate current note",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) await this.app.workspace.getLeaf(false).openFile(file);
      }
    });

    this.addCommand({
      id: "new-experiment-note",
      name: "New Experiment Note",
      callback: async () => { await createExperimentNote(this); }
    });

    this.registerEvent(this.app.workspace.on("file-open", async (f) => {
      if (!f) return;
      this.refreshVariablesView(null);
    }));
  }

  async openVariablesView() {
    if (!this.varsLeaf || this.varsLeaf?.getViewState().type !== VIEW_TYPE_VARS) {
      this.varsLeaf = this.app.workspace.getRightLeaf(false);
      await this.varsLeaf.setViewState({ type: VIEW_TYPE_VARS, active: true });
    }
    this.app.workspace.revealLeaf(this.varsLeaf);
    this.refreshVariablesView(this.currentScope);
  }

  refreshVariablesView(scope: NoteScope | null) {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VARS);
    for (const leaf of leaves) {
      (leaf.view as VariablesView).renderScope(scope || undefined);
    }
  }

  getGlobalVariables() {
    return this.calc?.getGlobalVariables() ?? new Map();
  }

  async updateVariableAssignment(name: string, magnitude: string, unit: string, originalLine?: string): Promise<boolean> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    const editor = view.editor;
    const lines = editor.getValue().split(/\r?\n/);

    const tryUpdateLine = (lineIndex: number): boolean => {
      const line = lines[lineIndex];
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) return false;
      const beforeEq = line.slice(0, eqIndex + 1);
      const afterEq = line.slice(eqIndex + 1);
      const commentInfo = extractComment(afterEq);
      const trimmedMagnitude = magnitude.trim();
      if (!trimmedMagnitude) return false;
      const trimmedUnit = unit.trim();
      const valuePart = trimmedUnit ? `${trimmedMagnitude} ${trimmedUnit}` : trimmedMagnitude;
      const newExpr = `${commentInfo.leading}${valuePart}`;
      const newLine = `${beforeEq}${newExpr}${commentInfo.comment}`;
      editor.replaceRange(newLine, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: line.length });
      return true;
    };

    const findLineInCalcBlocks = (predicate: (line: string) => boolean): number => {
      let activeFence: string | null = null;
      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
          if (activeFence === null) {
            const fenceLang = trimmed.slice(3).trim().toLowerCase();
            activeFence = fenceLang || "";
          } else {
            activeFence = null;
          }
          continue;
        }
        if (activeFence === "calc" && predicate(rawLine)) {
          return i;
        }
      }
      return -1;
    };

    const normalizedOriginal = originalLine?.trim();
    let targetIndex = -1;
    if (normalizedOriginal) {
      targetIndex = findLineInCalcBlocks(line => line.trim() === normalizedOriginal);
    }

    if (targetIndex === -1) {
      const nameRegex = new RegExp(`^\\s*${escapeRegExp(name)}\\s*=`, "i");
      targetIndex = findLineInCalcBlocks(line => nameRegex.test(line));
    }

    if (targetIndex === -1) return false;

    const updated = tryUpdateLine(targetIndex);
    if (!updated) return false;

    await this.recalculateActiveNote();
    return true;
  }

  async recalculateActiveNote() {
    const file = this.app.workspace.getActiveFile();
    if (file) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  async onunload() {
    console.log("Unloading Engineering Toolkit");
    this.app.workspace.getLeavesOfType(VIEW_TYPE_VARS).forEach(l => l.detach());
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  async prompt(message: string): Promise<string | null> {
    return new Promise(resolve => {
      const modal = new (class extends (window as any).Modal {
        value = "";
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl("h3", { text: message });
          const input = contentEl.createEl("input", { type: "text" });
          input.focus();
          input.onkeydown = (e: KeyboardEvent) => {
            if (e.key === "Enter") { this.value = input.value; this.close(); }
          };
          const btn = contentEl.createEl("button", { text: "OK" });
          btn.onclick = () => { this.value = input.value; this.close(); };
        }
        onClose() { resolve(this.value || null); }
      })(this.app);
      modal.open();
    });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractComment(rhs: string): { leading: string; comment: string } {
  let body = rhs;
  let comment = "";
  const commentMarkers = ["//", "#"]; // preserve whichever comes first
  let idx = -1;
  for (const marker of commentMarkers) {
    const markerIndex = body.indexOf(marker);
    if (markerIndex !== -1 && (idx === -1 || markerIndex < idx)) {
      idx = markerIndex;
    }
  }
  if (idx !== -1) {
    comment = body.slice(idx);
    body = body.slice(0, idx);
  }
  const leading = body.match(/^\s*/)?.[0] ?? "";
  return { leading, comment };
}
