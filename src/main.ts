import { Notice, Plugin, MarkdownPostProcessorContext, WorkspaceLeaf } from "obsidian";
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

          this.currentScope = (this.calc as any)["getScope"](file.path);
          this.refreshVariablesView(this.currentScope);

          if (errors.length) {
            const [firstError] = errors;
            new Notice(`Recalculated with ${errors.length} error${errors.length === 1 ? "" : "s"}. ${firstError}`);
          } else {
            new Notice("Calc blocks recalculated successfully.");
          }
        } catch (e: any) {
          console.error("Failed to recalculate note", e);
          new Notice(`Failed to recalculate: ${e?.message ?? e}`);
        } finally {
          this.settings.autoRecalc = originalAutoRecalc;
        }
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
