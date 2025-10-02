import { Notice, Plugin, WorkspaceLeaf, MarkdownView, Editor } from "obsidian";
import { DEFAULT_SETTINGS, ToolkitSettingTab } from "./settings";
import type { ToolkitSettings, NoteScope } from "./utils/types";
import { CalcEngine } from "./calcEngine";
import { VariablesView, VIEW_TYPE_VARS } from "./variablesView";
import { createExperimentNote } from "./labJournal";
import { UnitPickerModal } from "./unitPicker";

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
      const scope = this.calc.getScope(ctx.sourcePath || "untitled");
      this.currentScope = scope;
      this.refreshVariablesView(scope);
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
      callback: async () => { await this.recalculateActiveNote(); }
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
      id: "new-experiment-note",
      name: "New Experiment Note",
      callback: async () => { await createExperimentNote(this); }
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

  private async recalculateActiveNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    this.calc.clearScope(file.path);
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  async onunload() {
    console.log("Unloading Engineering Toolkit");
    this.app.workspace.getLeavesOfType(VIEW_TYPE_VARS).forEach(l => l.detach());
  }

  insertUnitIntoActiveEditor(unit: string): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    view.editor.replaceSelection(unit);
    return true;
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
