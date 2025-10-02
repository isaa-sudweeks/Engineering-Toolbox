import { autocompletion, closeCompletion, Completion, CompletionContext, CompletionResult, completionStatus, startCompletion } from "@codemirror/autocomplete";
import { StateEffect, StateField, Extension } from "@codemirror/state";
import { editorInfoField } from "obsidian";
import type EngineeringToolkitPlugin from "./main";

const scopeRefreshEffect = StateEffect.define<number>();

const scopeRefreshField = StateField.define<number>({
  create: () => 0,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(scopeRefreshEffect)) return effect.value;
    }
    return value;
  }
});

export class ScopeCompletionManager {
  private plugin: EngineeringToolkitPlugin;
  readonly extension: Extension;

  constructor(plugin: EngineeringToolkitPlugin) {
    this.plugin = plugin;
    this.extension = [
      scopeRefreshField,
      autocompletion({
        override: [ctx => this.provideCompletions(ctx)],
        activateOnTyping: true
      })
    ];
  }

  notifyChanged() {
    const stamp = Date.now();
    this.plugin.app.workspace.iterateAllLeaves(leaf => {
      const cm = (leaf.view as any)?.editor?.cm;
      if (!cm) return;
      cm.dispatch({ effects: scopeRefreshEffect.of(stamp) });
      if (completionStatus(cm.state)) startCompletion(cm);
    });
  }

  updateEnabledState() {
    const enabled = this.plugin.settings.autocompleteEnabled;
    this.plugin.app.workspace.iterateAllLeaves(leaf => {
      const cm = (leaf.view as any)?.editor?.cm;
      if (!cm) return;
      if (!enabled) {
        closeCompletion(cm);
      } else if (completionStatus(cm.state)) {
        startCompletion(cm);
      }
    });
  }

  private provideCompletions(context: CompletionContext): CompletionResult | null {
    // Mark dependency so refresh effect retriggers completion source.
    context.state.field(scopeRefreshField);

    if (!this.plugin.settings.autocompleteEnabled) return null;
    if (!this.isInCalcBlock(context)) return null;

    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    if (!word && !context.explicit) return null;

    const fileInfo = context.state.field(editorInfoField, false);
    const filePath = fileInfo?.file?.path ?? null;
    const options = this.plugin.getScopeCompletions(filePath);
    if (!options.length) return null;

    if (!word) {
      return { from: context.pos, options };
    }

    const query = word.text.toLowerCase();
    const filtered = options.filter(opt => opt.label.toLowerCase().startsWith(query));
    return {
      from: word.from,
      options: filtered.length ? filtered : options
    };
  }

  private isInCalcBlock(context: CompletionContext): boolean {
    const doc = context.state.doc;
    const targetLine = doc.lineAt(context.pos).number;
    let inCalc = false;
    for (let lineNum = 1; lineNum <= targetLine; lineNum++) {
      const text = doc.line(lineNum).text.trim();
      if (!text.startsWith("```") && !text.startsWith("~~~")) continue;
      const fence = text.slice(3).trim().toLowerCase();
      if (!inCalc) {
        inCalc = fence === "calc";
      } else {
        inCalc = false;
      }
    }
    return inCalc;
  }
}

export type ScopeCompletionOption = Completion;
