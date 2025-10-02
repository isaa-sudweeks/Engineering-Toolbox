import { Plugin, MarkdownPostProcessorContext, WorkspaceLeaf, MarkdownView, Notice, EventRef } from "obsidian";
import { DEFAULT_SETTINGS, ToolkitSettingTab } from "./settings";
import type { ToolkitSettings, NoteScope } from "./utils/types";
import { CalcEngine } from "./calcEngine";
import { VariablesView, VIEW_TYPE_VARS } from "./variablesView";
import { createExperimentNote } from "./labJournal";
import type { Command } from "obsidian";

export default class EngineeringToolkitPlugin extends Plugin {
  settings: ToolkitSettings;
  private calc: CalcEngine;
  private varsLeaf: WorkspaceLeaf | null = null;
  private currentScope: NoteScope | null = null;
  private activeCommands = new Set<string>();
  private variablesViewRegistered = false;
  private fileOpenEventRef: EventRef | null = null;

  async onload() {
    console.log("Loading Engineering Toolkit");
    await this.loadSettings();
    this.calc = new CalcEngine(this);

    this.addSettingTab(new ToolkitSettingTab(this.app, this));

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

    await this.applyFeatureToggles();
  }

  async openVariablesView() {
    if (!this.settings.variablesPanelEnabled) {
      new Notice("Variables panel is disabled in settings.");
      return;
    }
    if (!this.variablesViewRegistered) {
      this.registerView(VIEW_TYPE_VARS, (leaf) => new VariablesView(leaf, this));
      this.variablesViewRegistered = true;
    }
    if (!this.varsLeaf || this.varsLeaf?.getViewState().type !== VIEW_TYPE_VARS) {
      this.varsLeaf = this.app.workspace.getRightLeaf(false);
      await this.varsLeaf.setViewState({ type: VIEW_TYPE_VARS, active: true });
    }
    this.app.workspace.revealLeaf(this.varsLeaf);
    this.refreshVariablesView(this.currentScope);
  }

  refreshVariablesView(scope: NoteScope | null) {
    if (!this.settings.variablesPanelEnabled) return;
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VARS);
    for (const leaf of leaves) {
      (leaf.view as VariablesView).renderScope(scope || undefined);
    }
  }

  async onunload() {
    console.log("Unloading Engineering Toolkit");
    this.detachVariablesView();
    this.removeFileOpenEvent();
    this.clearRegisteredCommands();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  async applyFeatureToggles() {
    this.ensureVariablesModule();
    this.ensureLabJournalModule();
    this.ensureDiagramHelpersModule();
    this.ensureModelEmbedModule();
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

  private ensureCommand(id: string, commandFactory: () => Omit<Command, "id">, enabled: boolean) {
    const fullId = `${this.manifest.id}:${id}`;
    if (enabled) {
      if (this.activeCommands.has(id)) return;
      const command = commandFactory();
      this.addCommand({ ...command, id });
      this.activeCommands.add(id);
      return;
    }

    if (!this.activeCommands.has(id)) return;
    this.app.commands.removeCommand(fullId);
    this.activeCommands.delete(id);
  }

  private ensureVariablesModule() {
    const enabled = this.settings.variablesPanelEnabled;
    this.ensureCommand("open-variables-view", () => ({
      name: "Open Variables Panel",
      callback: async () => { await this.openVariablesView(); }
    }), enabled);

    if (enabled) {
      if (!this.variablesViewRegistered) {
        this.registerView(VIEW_TYPE_VARS, (leaf) => new VariablesView(leaf, this));
        this.variablesViewRegistered = true;
      }
      if (!this.fileOpenEventRef) {
        this.fileOpenEventRef = this.app.workspace.on("file-open", () => {
          this.refreshVariablesView(null);
        });
      }
    } else {
      this.removeFileOpenEvent();
      this.detachVariablesView();
    }
  }

  private ensureLabJournalModule() {
    this.ensureCommand("new-experiment-note", () => ({
      name: "New Experiment Note",
      callback: async () => { await createExperimentNote(this); }
    }), this.settings.labJournalEnabled);
  }

  private ensureDiagramHelpersModule() {
    this.ensureCommand("insert-diagram-helper", () => ({
      name: "Insert Diagram Helper",
      callback: () => {
        this.insertSnippet("```diagram\n# Diagram\n\n```\n");
      }
    }), this.settings.diagramHelpersEnabled);
  }

  private ensureModelEmbedModule() {
    this.ensureCommand("insert-model-embed", () => ({
      name: "Insert Model Embed Placeholder",
      callback: () => {
        this.insertSnippet("```model\nsource: path/to/model.step\n```\n");
      }
    }), this.settings.modelEmbedsEnabled);
  }

  private insertSnippet(snippet: string) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Open a markdown file to insert helper content.");
      return;
    }
    view.editor.replaceSelection(snippet);
  }

  private detachVariablesView() {
    if (!this.variablesViewRegistered) {
      this.varsLeaf = null;
      return;
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_VARS);
    (this.app.workspace as any).unregisterView?.(VIEW_TYPE_VARS);
    this.variablesViewRegistered = false;
    this.varsLeaf = null;
  }

  private removeFileOpenEvent() {
    if (!this.fileOpenEventRef) return;
    this.app.workspace.offref(this.fileOpenEventRef);
    this.fileOpenEventRef = null;
  }

  private clearRegisteredCommands() {
    for (const id of Array.from(this.activeCommands)) {
      const fullId = `${this.manifest.id}:${id}`;
      this.app.commands.removeCommand(fullId);
      this.activeCommands.delete(id);
    }
  }
}
