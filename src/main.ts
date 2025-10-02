import { Plugin, MarkdownPostProcessorContext, WorkspaceLeaf, Notice, MarkdownView, SuggestModal, TFile, normalizePath } from "obsidian";
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

  private diagramIntegrations: DiagramIntegration[] = [
    {
      key: "excalidraw",
      name: "Excalidraw sketch",
      description: "Creates a new Excalidraw canvas and embeds it in the note.",
      pluginId: "obsidian-excalidraw-plugin",
      fileExtension: ".excalidraw.md",
      defaultFolder: "Excalidraw",
      defaultFrontmatter: "---\nexcalidraw-plugin: parsed\n---\n",
      embedPrefix: "![[",
      embedSuffix: "]]"
    },
    {
      key: "drawio",
      name: "Diagrams.net drawing",
      description: "Creates a Diagrams.net file placeholder for the Draw.io plugin.",
      pluginId: "drawio-obsidian",
      fileExtension: ".drawio",
      defaultFolder: "Diagrams",
      embedPrefix: "![[",
      embedSuffix: "]]"
    },
    {
      key: "circuit",
      name: "Circuit sketch",
      description: "Prepares a Circuit Sketcher canvas and embeds it in the current note.",
      pluginId: "obsidian-circuit-sketcher",
      fileExtension: ".circuit.md",
      defaultFolder: "Circuits",
      defaultFrontmatter: "---\nplugin: circuit-sketcher\n---\n",
      embedPrefix: "![[",
      embedSuffix: "]]"
    }
  ];

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

    this.addCommand({
      id: "insert-diagram-placeholder",
      name: "Insert engineering diagram",
      callback: async () => { await this.insertDiagramFlow(); }
    });

    for (const integration of this.diagramIntegrations) {
      this.addCommand({
        id: `insert-diagram-${integration.key}`,
        name: `Insert ${integration.name}`,
        callback: async () => { await this.insertDiagramFlow(integration.key); }
      });
    }

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

  private async insertDiagramFlow(preselectedKey?: string) {
    const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    if (!editor) {
      new Notice("Open a Markdown note before inserting a diagram placeholder.");
      return;
    }

    const integration = preselectedKey
      ? this.diagramIntegrations.find(d => d.key === preselectedKey)
      : await this.selectDiagramIntegration();

    if (!integration) return;

    if (!this.isPluginAvailable(integration.pluginId)) {
      new Notice(`${integration.name} requires the companion plugin (${integration.pluginId}) to be enabled.`);
      return;
    }

    const baseName = await this.prompt(`Enter file name for the ${integration.name}:`);
    if (!baseName) return;

    const folderInput = await this.prompt(`Target folder (default: ${integration.defaultFolder}):`);
    const targetFolder = folderInput?.trim() || integration.defaultFolder;

    const templatePath = await this.prompt("Template path (optional, leave blank to use default placeholder):");
    let filePath: string;
    try {
      filePath = await this.createDiagramFile(integration, baseName.trim(), targetFolder, templatePath?.trim() || null);
    } catch (error: any) {
      new Notice(error?.message || "Failed to prepare diagram file.");
      return;
    }

    const embed = `${integration.embedPrefix || "![["}${filePath}${integration.embedSuffix || "]]"}`;
    editor.replaceSelection(embed);
  }

  private async selectDiagramIntegration(): Promise<DiagramIntegration | null> {
    if (this.diagramIntegrations.length === 1) return this.diagramIntegrations[0];
    return new Promise(resolve => {
      const modal = new (class extends SuggestModal<DiagramIntegration> {
        private resolved = false;
        constructor(private readonly plugin: EngineeringToolkitPlugin) {
          super(plugin.app);
        }
        getSuggestions(query: string): DiagramIntegration[] {
          const lower = query.toLowerCase();
          return this.plugin.diagramIntegrations.filter(d =>
            !query || d.name.toLowerCase().includes(lower) || d.key.toLowerCase().includes(lower)
          );
        }
        renderSuggestion(value: DiagramIntegration, el: HTMLElement) {
          el.createEl("div", { text: value.name });
          if (value.description) {
            el.createEl("small", { text: value.description });
          }
        }
        onChooseSuggestion(item: DiagramIntegration) {
          this.resolved = true;
          resolve(item);
        }
        onClose() {
          if (!this.resolved) resolve(null);
        }
      })(this);
      modal.setPlaceholder("Select diagram type");
      modal.open();
    });
  }

  private isPluginAvailable(id: string): boolean {
    const pluginsApi = (this.app as any).plugins;
    if (!pluginsApi) return false;
    if (pluginsApi.enabledPlugins instanceof Set) {
      return pluginsApi.enabledPlugins.has(id);
    }
    return Boolean(pluginsApi.plugins?.[id]);
  }

  private async createDiagramFile(
    integration: DiagramIntegration,
    baseName: string,
    targetFolder: string,
    templatePath: string | null
  ): Promise<string> {
    const vault = this.app.vault;
    const folder = normalizePath(targetFolder || ".");
    if (folder !== "." && !vault.getAbstractFileByPath(folder)) {
      await vault.createFolder(folder).catch(() => {});
    }

    const extension = integration.fileExtension.startsWith(".") ? integration.fileExtension : `.${integration.fileExtension}`;
    const sanitizedName = baseName.replace(/[\\/:*?"<>|]/g, "-");
    const path = normalizePath(folder === "." ? `${sanitizedName}${extension}` : `${folder}/${sanitizedName}${extension}`);

    if (vault.getAbstractFileByPath(path)) {
      throw new Error("A diagram with that name already exists.");
    }

    let contents = integration.defaultFrontmatter ?? "";
    if (templatePath) {
      const normalizedTemplate = normalizePath(templatePath);
      const templateFile = vault.getAbstractFileByPath(normalizedTemplate);
      if (!(templateFile instanceof TFile)) {
        throw new Error("Template file was not found.");
      }
      contents = await vault.read(templateFile);
    }

    await vault.create(path, contents);
    return path;
  }
}

interface DiagramIntegration {
  key: string;
  name: string;
  description?: string;
  pluginId: string;
  fileExtension: string;
  defaultFolder: string;
  defaultFrontmatter?: string;
  embedPrefix?: string;
  embedSuffix?: string;
}
