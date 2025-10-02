import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type { NoteScope } from "./utils/types";
import type EngineeringToolkitPlugin from "./main";
import { createInlineUnitPicker } from "./unitPicker";

export const VIEW_TYPE_VARS = "engineering-toolkit-variables";

export class VariablesView extends ItemView {
  plugin: EngineeringToolkitPlugin;
  root: HTMLElement;

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
    const unitContainer = this.root.createDiv({ cls: "unit-picker-container" });
    createInlineUnitPicker(unitContainer, this.plugin);

    const header = this.root.createEl("div", { cls: "variables-panel" });
    header.createEl("h3", { text: "Variables (current note)" });
    header.createEl("div", { cls: "help", text: "Edit values in note; list auto-updates on recalculation." });
  }

  renderScope(scope?: NoteScope) {
    if (!this.root) return;
    let panel = this.root.querySelector(".variables-panel") as HTMLElement;
    if (!panel) panel = this.root.createEl("div", { cls: "variables-panel" });
    panel.querySelectorAll(".var-item").forEach(el => el.detach());
    if (!scope) return;
    for (const [name, entry] of scope.vars.entries()) {
      const row = panel.createEl("div", { cls: "var-item" });
      row.createEl("span", { cls: "var-name", text: name });
      row.createEl("span", { text: "=" });
      row.createEl("span", { cls: "var-value", text: entry.display });
      const b = row.createEl("button", { cls: "var-edit", text: "Copy" });
      b.addEventListener("click", async () => {
        await navigator.clipboard.writeText(`${name} = ${entry.display}`);
        new Notice("Copied variable to clipboard");
      });
    }
  }
}
