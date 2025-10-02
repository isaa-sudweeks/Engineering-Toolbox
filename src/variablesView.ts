import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type { NoteScope, VarEntry } from "./utils/types";
import type EngineeringToolkitPlugin from "./main";

export const VIEW_TYPE_VARS = "engineering-toolkit-variables";

type VariableFilter = "all" | "local" | "global";
type VariableGroup = "local" | "global";

export class VariablesView extends ItemView {
  plugin: EngineeringToolkitPlugin;
  root: HTMLElement;
  private panelEl: HTMLElement | null = null;
  private groupsEl: HTMLElement | null = null;
  private filterSelect: HTMLSelectElement | null = null;
  private filter: VariableFilter = "all";
  private currentScope?: NoteScope;

  constructor(leaf: WorkspaceLeaf, plugin: EngineeringToolkitPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_VARS; }
  getDisplayText(): string { return "Variables"; }
  getIcon(): string { return "calculator"; }

  async onOpen() {
    this.root = this.containerEl.children[1] as HTMLElement;
    this.root.empty();

    this.panelEl = this.root.createEl("div", { cls: "variables-panel" });
    const headerRow = this.panelEl.createEl("div", { cls: "var-header" });
    headerRow.createEl("h3", { text: "Variables & Units" });

    this.filterSelect = headerRow.createEl("select", { cls: "var-filter" });
    const options: Array<{ value: VariableFilter; label: string }> = [
      { value: "all", label: "All" },
      { value: "local", label: "Local" },
      { value: "global", label: "Global" },
    ];
    for (const opt of options) {
      const optionEl = this.filterSelect.createEl("option", { value: opt.value, text: opt.label });
      if (opt.value === this.filter) optionEl.selected = true;
    }
    this.filterSelect.addEventListener("change", () => {
      this.filter = this.filterSelect!.value as VariableFilter;
      this.renderScope(this.currentScope);
    });

    this.panelEl.createEl("div", {
      cls: "help",
      text: "Adjust numeric values or units and updates will write back into the active note.",
    });

    this.groupsEl = this.panelEl.createEl("div", { cls: "var-groups" });
  }

  renderScope(scope?: NoteScope) {
    this.currentScope = scope;
    if (!this.panelEl || !this.groupsEl) return;
    if (this.filterSelect) this.filterSelect.value = this.filter;

    this.groupsEl.empty();

    const showLocal = this.filter === "all" || this.filter === "local";
    const showGlobal = this.filter === "all" || this.filter === "global";
    let renderedAny = false;

    if (showLocal) {
      const hasLocal = this.renderGroup(this.groupsEl, "Local variables", scope?.vars ?? new Map(), "local");
      renderedAny = renderedAny || hasLocal;
    }

    if (showGlobal) {
      const globalVars = this.plugin.getGlobalVariables();
      const hasGlobal = this.renderGroup(this.groupsEl, "Global variables", globalVars, "global");
      renderedAny = renderedAny || hasGlobal;
    }

    if (!renderedAny) {
      this.groupsEl.createEl("div", { cls: "var-empty", text: "No variables to display." });
    }
  }

  private renderGroup(container: HTMLElement, title: string, vars: Map<string, VarEntry>, group: VariableGroup): boolean {
    const section = container.createEl("div", { cls: "var-group" });
    section.createEl("h4", { text: title });

    const list = section.createEl("div", { cls: "var-list" });
    const entries = Array.from(vars.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));

    if (!entries.length) {
      const message = group === "local" ? "No variables defined in this note." : "No global variables defined.";
      list.createEl("div", { cls: "var-empty", text: message });
      return false;
    }

    for (const [name, entry] of entries) {
      this.renderVariableRow(list, name, entry, group);
    }
    return true;
  }

  private renderVariableRow(container: HTMLElement, name: string, entry: VarEntry, group: VariableGroup) {
    const row = container.createEl("div", { cls: "var-item" });
    row.createEl("span", { cls: "var-name", text: name });

    const inputs = row.createEl("div", { cls: "var-inputs" });
    const valueInput = inputs.createEl("input", { type: "text", cls: "var-magnitude", value: entry.magnitude });
    valueInput.placeholder = "Value";
    const unitInput = inputs.createEl("input", { type: "text", cls: "var-unit", value: entry.unit });
    unitInput.placeholder = "Unit";

    row.createEl("span", { cls: "var-display", text: entry.display });

    const actions = row.createEl("div", { cls: "var-actions" });
    const copyBtn = actions.createEl("button", { cls: "var-copy", text: "Copy" });
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(`${name} = ${entry.display}`);
      new Notice("Copied variable to clipboard");
    });

    if (group === "local") {
      const commit = async () => {
        const newMagnitude = valueInput.value.trim();
        const newUnit = unitInput.value.trim();
        if (!newMagnitude) {
          new Notice("Value cannot be empty.");
          valueInput.focus();
          return;
        }
        if (newMagnitude === entry.magnitude && newUnit === entry.unit) return;
        await this.applyEdit(name, newMagnitude, newUnit, entry);
      };
      valueInput.addEventListener("change", commit);
      unitInput.addEventListener("change", commit);
      const keyHandler = (evt: KeyboardEvent) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          commit();
        }
      };
      valueInput.addEventListener("keydown", keyHandler);
      unitInput.addEventListener("keydown", keyHandler);
    } else {
      valueInput.disabled = true;
      unitInput.disabled = true;
    }
  }

  private async applyEdit(name: string, magnitude: string, unit: string, entry: VarEntry) {
    try {
      const success = await this.plugin.updateVariableAssignment(name, magnitude, unit, entry.sourceLine);
      if (success) {
        new Notice(`Updated ${name}`);
      } else {
        new Notice(`Could not update ${name} in the note.`);
      }
    } catch (error) {
      console.error(error);
      new Notice(`Failed to update ${name}.`);
    }
  }
}
