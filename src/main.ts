import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, ToolkitSettingTab } from "./settings";
import type { ToolkitSettings, NoteScope } from "./utils/types";
import { CalcEngine } from "./calcEngine";
import { VariablesView, VIEW_TYPE_VARS } from "./variablesView";
import { createExperimentNote } from "./labJournal";
import { ScopeCompletionManager } from "./autocomplete";
import type { Completion } from "@codemirror/autocomplete";

export default class EngineeringToolkitPlugin extends Plugin {
  settings: ToolkitSettings;
  private calc: CalcEngine;
  private varsLeaf: WorkspaceLeaf | null = null;
  private currentScope: NoteScope | null = null;
  private completionManager: ScopeCompletionManager;

  async onload() {
    console.log("Loading Engineering Toolkit");
    await this.loadSettings();
    this.calc = new CalcEngine(this);
    this.completionManager = new ScopeCompletionManager(this);
    this.registerEditorExtension(this.completionManager.extension);
    this.updateAutocompleteSetting();

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
      this.currentScope = this.calc.getScope(ctx.sourcePath || "untitled");
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

  handleScopeChanged(_filePath: string) {
    this.completionManager?.notifyChanged();
  }

  updateAutocompleteSetting() {
    this.completionManager?.updateEnabledState();
    if (this.settings.autocompleteEnabled) this.completionManager?.notifyChanged();
  }

  getScopeCompletions(filePath: string | null): Completion[] {
    if (!this.calc) return [];
    const seen = new Set<string>();
    const options: Completion[] = [];
    const add = (label: string, detail: string, type: Completion["type"]) => {
      if (seen.has(label)) return;
      seen.add(label);
      options.push({ label, detail, type });
    };

    if (filePath) {
      const scope = this.calc.peekScope(filePath);
      if (scope) {
        for (const name of scope.vars.keys()) add(name, "Local variable", "variable");
      }
    }

    if (this.settings.globalVarsEnabled) {
      for (const name of this.calc.listGlobalVars().keys()) add(name, "Global variable", "variable");
    }

    for (const unit of this.calc.listKnownUnits()) add(unit, "Unit", "constant");

    return options;
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
