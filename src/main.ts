import { Plugin, MarkdownPostProcessorContext, WorkspaceLeaf, MarkdownView, Notice } from "obsidian";
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
  public modelViewerAvailable = false;

  async onload() {
    console.log("Loading Engineering Toolkit");
    await this.loadSettings();
    this.calc = new CalcEngine(this);

    this.addSettingTab(new ToolkitSettingTab(this.app, this));

    this.refreshModelViewerAvailability(true);

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

    this.addCommand({
      id: "insert-model-viewer-embed",
      name: "Insert Model Viewer embed",
      callback: async () => { await this.handleInsertModelViewerCommand(); }
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

  async onunload() {
    console.log("Unloading Engineering Toolkit");
    this.app.workspace.getLeavesOfType(VIEW_TYPE_VARS).forEach(l => l.detach());
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.modelViewerDefaults = Object.assign(
      {},
      DEFAULT_SETTINGS.modelViewerDefaults,
      (data as Partial<ToolkitSettings> | null)?.modelViewerDefaults ?? {}
    );
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  refreshModelViewerAvailability(showNotice = false) {
    this.modelViewerAvailable = this.isModelViewerPluginAvailable();
    if (!this.modelViewerAvailable && showNotice) {
      new Notice("Model Viewer plugin not detected. Install and enable it to render inserted 3D models.");
    }
    return this.modelViewerAvailable;
  }

  private isModelViewerPluginAvailable(): boolean {
    const manager = (this.app as any).plugins;
    if (!manager) return false;
    const ids = ["model-viewer", "obsidian-model-viewer"];
    return ids.some((id) => manager.enabledPlugins?.has(id) || manager.getPlugin?.(id));
  }

  private async handleInsertModelViewerCommand() {
    if (!this.refreshModelViewerAvailability(true)) return;

    const src = (await this.prompt("Enter model file path or URL"))?.trim();
    if (!src) {
      new Notice("Model source is required to insert a viewer embed.");
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.editor) {
      new Notice("Open a Markdown note to insert a Model Viewer embed.");
      return;
    }

    const editor = view.editor;
    const markup = this.buildModelViewerMarkup(src);
    const prefix = editor.getCursor("from").ch > 0 ? "\n" : "";
    editor.replaceSelection(`${prefix}${markup}\n`);
  }

  private buildModelViewerMarkup(src: string): string {
    const defaults = this.settings.modelViewerDefaults;
    const attrParts: string[] = [`src="${src}"`];
    if (defaults.altText?.trim()) attrParts.push(`alt="${defaults.altText.trim()}"`);
    if (defaults.cameraControls) attrParts.push("camera-controls");
    if (defaults.autoRotate) attrParts.push("auto-rotate");
    if (defaults.environmentImage?.trim()) {
      attrParts.push(`environment-image="${defaults.environmentImage.trim()}"`);
    }
    if (defaults.exposure?.trim()) {
      attrParts.push(`exposure="${defaults.exposure.trim()}"`);
    }

    const styles: string[] = [];
    if (defaults.backgroundColor?.trim()) {
      styles.push(`background-color: ${defaults.backgroundColor.trim()};`);
    }

    const styleAttr = styles.length ? ` style="${styles.join(" ")}"` : "";
    return `<model-viewer ${attrParts.join(" ")}${styleAttr}></model-viewer>`;
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
