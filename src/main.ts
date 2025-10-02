import { Plugin, MarkdownPostProcessorContext, WorkspaceLeaf } from "obsidian";
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
  private evalQueue = new Map<string, PendingEvaluation>();
  private bypassThrottleUntil = 0;

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
      const key = this.getEvaluationKey(source, el, ctx);
      const evaluate = async () => {
        const out = await this.calc.evaluateBlock(source, ctx);
        el.empty();
        el.appendChild(out);
        this.currentScope = this.calc.getScope(ctx.sourcePath ?? "untitled");
      };

      if (this.shouldBypassThrottle()) {
        return this.runEvaluationNow(key, evaluate);
      }
      return this.scheduleEvaluation(key, evaluate);
    });

    this.addCommand({
      id: "recalculate-note",
      name: "Recalculate current note",
      callback: async () => {
        this.bypassThrottleUntil = Date.now() + Math.max(2 * this.settings.evaluationThrottleMs, 500);
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

  private getEvaluationKey(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const file = ctx.sourcePath ?? "untitled";
    const section = ctx.getSectionInfo(el);
    if (section) return `${file}::${section.lineStart}-${section.lineEnd}`;
    return `${file}::${source}`;
  }

  private shouldBypassThrottle() {
    return Date.now() < this.bypassThrottleUntil;
  }

  private runEvaluationNow(key: string, evaluate: () => Promise<void>): Promise<void> {
    const pending = this.evalQueue.get(key);
    if (!pending) return evaluate();

    window.clearTimeout(pending.timerId);
    this.evalQueue.delete(key);
    return evaluate().then(() => pending.resolve()).catch((err) => {
      pending.reject(err);
      throw err;
    });
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
    } catch (err) {
      pending.reject(err);
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

interface PendingEvaluation {
  evaluate: () => Promise<void>;
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
  timerId: number;
}
