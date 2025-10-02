import { Notice, Plugin, WorkspaceLeaf, MarkdownView, Editor, SuggestModal, TFile, normalizePath } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import { DEFAULT_SETTINGS, ToolkitSettingTab } from "./settings";
import type { ToolkitSettings, NoteScope, GlobalVarEntry, ToolkitData } from "./utils/types";
import { CalcEngine } from "./calcEngine";
import { VariablesView, VIEW_TYPE_VARS } from "./variablesView";
import { createExperimentNote } from "./labJournal";
import { UnitPickerModal } from "./unitPicker";
import { PythonExporter } from "./exporter";
import { ScopeCompletionManager } from "./autocomplete";
import type { Completion } from "@codemirror/autocomplete";

export default class EngineeringToolkitPlugin extends Plugin {
  settings: ToolkitSettings;
  calc: CalcEngine;
  private varsLeaf: WorkspaceLeaf | null = null;
  private currentScope: NoteScope | null = null;
  private loadedGlobalVars: Record<string, GlobalVarEntry> = {};
  public modelViewerAvailable = false;
  private completionManager!: ScopeCompletionManager;
  private evalQueue = new Map<string, PendingEvaluation>();
  private bypassThrottleUntil = 0;
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
      embedSuffix: "]]",
    },
    {
      key: "drawio",
      name: "Diagrams.net drawing",
      description: "Creates a Diagrams.net file placeholder for the Draw.io plugin.",
      pluginId: "drawio-obsidian",
      fileExtension: ".drawio",
      defaultFolder: "Diagrams",
      embedPrefix: "![[",
      embedSuffix: "]]",
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
      embedSuffix: "]]",
    },
  ];
  private exporter!: PythonExporter;

  async onload() {
    console.log("Loading Engineering Toolkit");
    await this.loadSettings();
    this.calc = new CalcEngine(this);
    this.calc.loadGlobalVars(this.loadedGlobalVars);
    this.exporter = new PythonExporter(this);
    this.completionManager = new ScopeCompletionManager(this);
    this.registerEditorExtension(this.completionManager.extension);
    this.refreshModelViewerAvailability(true);
    this.updateAutocompleteSetting();

    this.addSettingTab(new ToolkitSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_VARS, (leaf) => new VariablesView(leaf, this));
    this.addCommand({
      id: "open-variables-view",
      name: "Open Variables Panel",
      callback: async () => { await this.openVariablesView(); }
    });

    this.addCommand({
      id: "export-calculations-python",
      name: "Export calculations to Python",
      callback: async () => { await this.exporter.exportActiveNoteOrSelection(); }
    });

    this.registerMarkdownCodeBlockProcessor("calc", async (source, el, ctx) => {
      const key = this.getEvaluationKey(source, el, ctx);
      const evaluate = async () => {
        const out = await this.calc.evaluateBlock(source, ctx);
        el.empty();
        el.appendChild(out);
        const scope = this.calc.getScope(ctx.sourcePath || "untitled");
        this.currentScope = scope;
        this.refreshVariablesView(scope);
      };

      if (this.shouldBypassThrottle()) {
        await this.runEvaluationNow(key, evaluate);
      } else {
        await this.scheduleEvaluation(key, evaluate);
      }
    });

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        textNodes.push(node as Text);
      }

      const inlinePattern = /(^|[^\S\r\n])=\s+([^=\n]+?)(?=(?:\s{2,}|\n|[.,;:!?](?![0-9A-Za-z])|$))/g;
      const filePath = ctx.sourcePath || "untitled";
      let matched = false;

      for (const textNode of textNodes) {
        const parent = textNode.parentElement;
        if (!parent) continue;
        if (parent.closest("code, pre, .calc-output, .calc-inline")) continue;

        const content = textNode.nodeValue;
        if (!content) continue;

        inlinePattern.lastIndex = 0;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        let hasReplacement = false;
        const frag = document.createDocumentFragment();

        while ((match = inlinePattern.exec(content)) !== null) {
          hasReplacement = true;
          const leading = match[1] ?? "";
          const start = match.index;
          const before = content.slice(lastIndex, start) + leading;
          if (before) frag.appendChild(document.createTextNode(before));

          const expr = match[2].trim();
          const span = await this.calc.evaluateInline(expr, ctx);
          frag.appendChild(span);

          lastIndex = inlinePattern.lastIndex;
        }

        if (!hasReplacement) continue;

        const tail = content.slice(lastIndex);
        if (tail) frag.appendChild(document.createTextNode(tail));

        textNode.replaceWith(frag);
        matched = true;
      }

      if (matched) {
        this.currentScope = this.calc.getScope(filePath);
        this.refreshVariablesView(this.currentScope);
      }
    });

    this.addCommand({
      id: "recalculate-note",
      name: "Recalculate current note",
      callback: async () => {
        this.bypassThrottleUntil = Date.now() + Math.max(2 * this.settings.evaluationThrottleMs, 500);
        await this.recalculateActiveNote();
      }
    });

    this.addCommand({
      id: "reset-current-scope",
      name: "Reset current note scope",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("Open a note before resetting the scope.");
          return;
        }
        this.calc.clearScope(file.path);
        this.currentScope = null;
        this.refreshVariablesView(null);
        new Notice("Cleared stored variables for this note.");
      }
    });

    this.addCommand({
      id: "toggle-auto-recalc",
      name: "Toggle auto recalc",
      callback: async () => {
        this.settings.autoRecalc = !this.settings.autoRecalc;
        await this.saveSettings();
        const mode = this.settings.autoRecalc ? "enabled" : "disabled";
        const extra = this.settings.autoRecalc
          ? "Calculations will refresh automatically."
          : "Existing results will persist until you manually recalculate.";
        new Notice(`Auto recalc ${mode}. ${extra}`);
      }
    });

    this.addCommand({
      id: "reset-current-scope",
      name: "Reset current note scope",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return;
        this.calc.clearScope(file.path);
        this.currentScope = null;
        this.refreshVariablesView(null);
      }
    });

    this.addCommand({
      id: "new-experiment-note",
      name: "New Experiment Note",
      callback: async () => {
        if (!this.settings.labJournalEnabled) {
          new Notice("Lab journal helpers are disabled in settings.");
          return;
        }
        await createExperimentNote(this);
      }
    });

    this.addCommand({
      id: "insert-unit-conversion",
      name: "Insert unit conversion",
      editorCallback: async (editor: Editor) => {
        const source = await this.prompt("Enter value and unit to convert (e.g., 5 m)");
        if (!source) return;
        const target = await this.prompt("Enter target unit (e.g., ft)");
        if (!target) return;

        const cursor = editor.getCursor();
        const line = `${source.trim()} -> ${target.trim()}`;
        editor.replaceRange(`${line}\n`, cursor);
        editor.setCursor({ line: cursor.line + 1, ch: 0 });
      }
    });

    this.addCommand({
      id: "open-unit-picker",
      name: "Insert Unit from Picker",
      callback: () => {
        const modal = new UnitPickerModal(this);
        modal.open();
      }
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

    this.addCommand({
      id: "insert-model-viewer-embed",
      name: "Insert Model Viewer embed",
      callback: async () => { await this.handleInsertModelViewerCommand(); }
    });

    this.registerEvent(this.app.workspace.on("file-open", async (f) => {
      if (!f) return;
      this.refreshVariablesView(null);
    }));

    await this.applyFeatureToggles();
  }

  async openVariablesView() {
    if (!this.settings.variablesPanelEnabled) {
      new Notice("Variables panel is disabled in settings.");
      return;
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

  getGlobalVariables() {
    return this.calc?.getGlobalVariables() ?? new Map();
  }

  handleScopeChanged(_filePath: string | null) {
    if (!this.completionManager) return;
    if (!this.settings.autocompleteEnabled) return;
    this.completionManager.notifyChanged();
  }

  updateAutocompleteSetting() {
    if (!this.completionManager) return;
    this.completionManager.updateEnabledState();
    if (this.settings.autocompleteEnabled) this.completionManager.notifyChanged();
  }

  getScopeCompletions(filePath: string | null): Completion[] {
    const completions: Completion[] = [];
    const seen = new Set<string>();
    const add = (label: string, detail: string, type: Completion["type"]) => {
      if (seen.has(label)) return;
      seen.add(label);
      completions.push({ label, detail, type });
    };

    if (filePath) {
      const scope = this.calc.peekScope(filePath);
      if (scope) {
        for (const name of scope.vars.keys()) add(name, "Local variable", "variable");
      }
    }

    if (this.settings.globalVarsEnabled) {
      for (const [name] of this.calc.listGlobalVars()) add(name, "Global variable", "variable");
    }

    for (const unit of this.calc.listKnownUnits()) add(unit, "Unit", "constant");

    return completions;
  }

  private getEvaluationKey(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const file = ctx.sourcePath || "untitled";
    const section = ctx.getSectionInfo?.(el);
    if (section) return `${file}::${section.lineStart}-${section.lineEnd}`;
    return `${file}::${hashString(source)}`;
  }

  private shouldBypassThrottle() {
    return Date.now() < this.bypassThrottleUntil;
  }

  private async runEvaluationNow(key: string, evaluate: () => Promise<void>): Promise<void> {
    const pending = this.evalQueue.get(key);
    if (!pending) return evaluate();

    window.clearTimeout(pending.timerId);
    this.evalQueue.delete(key);
    try {
      await evaluate();
      pending.resolve();
    } catch (error) {
      pending.reject(error);
      throw error;
    }
  }

  private scheduleEvaluation(key: string, evaluate: () => Promise<void>): Promise<void> {
    const existing = this.evalQueue.get(key);
    if (existing) {
      existing.evaluate = evaluate;
      window.clearTimeout(existing.timerId);
      existing.timerId = window.setTimeout(() => this.flushEvaluation(key), this.settings.evaluationThrottleMs);
      return existing.promise;
    }

    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    const timerId = window.setTimeout(() => this.flushEvaluation(key), this.settings.evaluationThrottleMs);
    this.evalQueue.set(key, { evaluate, promise, resolve, reject, timerId });
    return promise;
  }

  private async flushEvaluation(key: string) {
    const pending = this.evalQueue.get(key);
    if (!pending) return;
    this.evalQueue.delete(key);
    try {
      await pending.evaluate();
      pending.resolve();
    } catch (error) {
      pending.reject(error);
    }
  }

  private async insertDiagramFlow(preselectedKey?: string) {
    if (!this.settings.diagramHelpersEnabled) {
      new Notice("Diagram helpers are disabled in settings.");
      return;
    }
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
    const trimmedBase = baseName?.trim();
    if (!trimmedBase) return;

    const folderInput = await this.prompt(`Target folder (default: ${integration.defaultFolder}):`);
    const targetFolder = folderInput?.trim() || integration.defaultFolder;

    const templatePath = await this.prompt("Template path (optional, leave blank to use default placeholder):");
    let filePath: string;
    try {
      filePath = await this.createDiagramFile(
        integration,
        trimmedBase,
        targetFolder,
        templatePath?.trim() || null,
      );
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
          if (value.description) el.createEl("small", { text: value.description });
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
    templatePath: string | null,
  ): Promise<string> {
    const vault = this.app.vault;
    const folder = normalizePath(targetFolder || ".");
    if (folder !== "." && !vault.getAbstractFileByPath(folder)) {
      await vault.createFolder(folder).catch(() => {});
    }

    const extension = integration.fileExtension.startsWith(".")
      ? integration.fileExtension
      : `.${integration.fileExtension}`;
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
    return ids.some(id => manager.enabledPlugins?.has(id) || manager.getPlugin?.(id));
  }

  private async handleInsertModelViewerCommand() {
    if (!this.settings.modelEmbedsEnabled) {
      new Notice("Model embeds are disabled in settings.");
      return;
    }
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
    const needsLeadingNewline = editor.getCursor("from").ch > 0;
    const prefix = needsLeadingNewline ? "\n" : "";
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
    if (!file) {
      new Notice("No active file to recalculate.");
      return;
    }

    const originalAutoRecalc = this.settings.autoRecalc;
    try {
      const content = await this.app.vault.read(file);
      const blockRegex = /```calc(?:[^\n]*)\n([\s\S]*?)```/g;
      const blocks: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = blockRegex.exec(content)) !== null) {
        blocks.push(match[1]);
      }

      if (!blocks.length) {
        this.calc.clearScope(file.path);
        this.currentScope = null;
        this.refreshVariablesView(null);
        new Notice("No calc blocks found in this note.");
        return;
      }

      this.calc.clearScope(file.path);
      if (!originalAutoRecalc) this.settings.autoRecalc = true;

      const ctx = {
        sourcePath: file.path,
        docId: file.path,
        frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter ?? null,
        getSectionInfo: () => null,
        addChild: () => {}
      } as unknown as MarkdownPostProcessorContext;

      const errors: string[] = [];
      for (const block of blocks) {
        const result = await this.calc.evaluateBlock(block, ctx);
        const errorNodes = result.querySelectorAll<HTMLElement>(".calc-error");
        errorNodes.forEach(node => {
          const text = node.textContent?.trim();
          if (text) errors.push(text);
        });
      }

      this.currentScope = this.calc.getScope(file.path);
      this.refreshVariablesView(this.currentScope);

      if (errors.length) {
        const [firstError] = errors;
        new Notice(`Recalculated with ${errors.length} error${errors.length === 1 ? "" : "s"}. ${firstError}`);
      } else {
        new Notice("Calc blocks recalculated successfully.");
      }
    } catch (error: any) {
      console.error("Failed to recalculate note", error);
      new Notice(`Failed to recalculate: ${error?.message ?? error}`);
    } finally {
      this.settings.autoRecalc = originalAutoRecalc;
    }
  }

  async onunload() {
    console.log("Unloading Engineering Toolkit");
    for (const pending of this.evalQueue.values()) window.clearTimeout(pending.timerId);
    this.evalQueue.clear();
    this.app.workspace.getLeavesOfType(VIEW_TYPE_VARS).forEach(l => l.detach());
  }

  insertUnitIntoActiveEditor(unit: string): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    view.editor.replaceSelection(unit);
    return true;
  }

  async loadSettings() {
    const raw = (await this.loadData()) as Partial<ToolkitData> | undefined;
    if (raw && "settings" in raw) {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, raw.settings ?? {});
      this.loadedGlobalVars = raw.globalVars ?? {};
    } else {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, raw ?? {});
      const legacy = raw as any;
      this.loadedGlobalVars = legacy?.globalVars ?? {};
    }

    this.settings.modelViewerDefaults = Object.assign(
      {},
      DEFAULT_SETTINGS.modelViewerDefaults,
      this.settings.modelViewerDefaults ?? {},
    );
    if (typeof this.settings.variablesPanelEnabled !== "boolean") {
      this.settings.variablesPanelEnabled = DEFAULT_SETTINGS.variablesPanelEnabled;
    }
    if (typeof this.settings.labJournalEnabled !== "boolean") {
      this.settings.labJournalEnabled = DEFAULT_SETTINGS.labJournalEnabled;
    }
    if (typeof this.settings.diagramHelpersEnabled !== "boolean") {
      this.settings.diagramHelpersEnabled = DEFAULT_SETTINGS.diagramHelpersEnabled;
    }
    if (typeof this.settings.modelEmbedsEnabled !== "boolean") {
      this.settings.modelEmbedsEnabled = DEFAULT_SETTINGS.modelEmbedsEnabled;
    }
    if (typeof this.settings.autocompleteEnabled !== "boolean") {
      this.settings.autocompleteEnabled = DEFAULT_SETTINGS.autocompleteEnabled;
    }
    if (!Number.isFinite(this.settings.evaluationThrottleMs)) {
      this.settings.evaluationThrottleMs = DEFAULT_SETTINGS.evaluationThrottleMs;
    }
    if (!this.settings.labIndexPath) {
      this.settings.labIndexPath = DEFAULT_SETTINGS.labIndexPath;
    }
    if (!this.settings.labNoteTemplate) {
      this.settings.labNoteTemplate = DEFAULT_SETTINGS.labNoteTemplate;
    }
    if (!this.settings.labNoteTemplatePresetId) {
      this.settings.labNoteTemplatePresetId = DEFAULT_SETTINGS.labNoteTemplatePresetId;
    }
    if (typeof this.settings.latexFormatting !== "boolean") {
      this.settings.latexFormatting = DEFAULT_SETTINGS.latexFormatting;
    }
  }
  async saveSettings() {
    await this.saveToolkitData();
  }

  async applyFeatureToggles() {
    if (!this.settings.variablesPanelEnabled) {
      this.app.workspace.getLeavesOfType(VIEW_TYPE_VARS).forEach(leaf => leaf.detach());
      this.varsLeaf = null;
    }
  }

  async saveToolkitData() {
    const data: ToolkitData = {
      settings: this.settings,
      globalVars: this.calc ? this.calc.serializeGlobalVars() : this.loadedGlobalVars
    };
    this.loadedGlobalVars = data.globalVars;
    await this.saveData(data);
  }

  getCalcEngine(): CalcEngine { return this.calc; }

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

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

interface PendingEvaluation {
  evaluate: () => Promise<void>;
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
  timerId: number;
}
