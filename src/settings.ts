import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type EngineeringToolkitPlugin from "./main";
import type { ToolkitSettings } from "./utils/types";

export const DEFAULT_SETTINGS: ToolkitSettings = {
  autoRecalc: true,
  defaultUnitSystem: "SI",
  sigFigs: 4,
  labNotesFolder: "Lab Journal",
  globalVarsEnabled: false,
  latexFormatting: true
};

export class ToolkitSettingTab extends PluginSettingTab {
  plugin: EngineeringToolkitPlugin;

  constructor(app: App, plugin: EngineeringToolkitPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Engineering Toolkit Settings" });

    new Setting(containerEl)
      .setName("Auto recalc")
      .setDesc("Recalculate calc blocks on change/open")
      .addToggle(t => t.setValue(this.plugin.settings.autoRecalc)
        .onChange(async v => { this.plugin.settings.autoRecalc = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Default unit system")
      .setDesc("Preferred display")
      .addDropdown(d => d.addOptions({ "SI":"SI", "US":"US" })
        .setValue(this.plugin.settings.defaultUnitSystem)
        .onChange(async v => { this.plugin.settings.defaultUnitSystem = v as any; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Significant figures")
      .setDesc("Displayed precision for results")
      .addSlider(s => s.setLimits(3, 8, 1).setDynamicTooltip()
        .setValue(this.plugin.settings.sigFigs)
        .onChange(async v => { this.plugin.settings.sigFigs = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Lab notes folder")
      .setDesc("Folder for new experiment notes")
      .addText(t => t.setPlaceholder("Lab Journal")
        .setValue(this.plugin.settings.labNotesFolder)
        .onChange(async v => { this.plugin.settings.labNotesFolder = v || "Lab Journal"; await this.plugin.saveSettings(); }));

    let globalsSection: HTMLElement | null = null;
    const renderGlobals = () => {
      if (!globalsSection) return;
      globalsSection.empty();
      globalsSection.createEl("h3", { text: "Global constants" });
      globalsSection.createEl("p", { text: "Define constants that can be used in any calc block." });

      const engine = this.plugin.getCalcEngine();
      if (!this.plugin.settings.globalVarsEnabled) {
        globalsSection.createEl("p", { text: "Enable global variables to manage shared constants." });
        return;
      }
      if (!engine) {
        globalsSection.createEl("p", { text: "Calculator engine not available." });
        return;
      }

      const vars = engine.getGlobalVarsSnapshot();
      if (!vars.length) {
        globalsSection.createEl("p", { text: "No global constants defined yet." });
      }

      for (const [name, entry] of vars) {
        const row = globalsSection.createEl("div", { cls: "global-var-row" });
        row.createEl("span", { cls: "global-var-name", text: name });
        const expr = row.createEl("input", { type: "text", value: entry.source, cls: "global-var-input" });
        row.createEl("span", { cls: "global-var-display", text: entry.display });

        const saveBtn = row.createEl("button", { text: "Save", cls: "global-var-save" });
        saveBtn.onclick = async () => {
          try {
            await engine.upsertGlobalVar(name, expr.value);
            new Notice(`Updated ${name}`);
            renderGlobals();
          } catch (err: any) {
            new Notice(err?.message ?? String(err));
          }
        };

        const deleteBtn = row.createEl("button", { text: "Delete", cls: "global-var-delete" });
        deleteBtn.onclick = async () => {
          try {
            await engine.deleteGlobalVar(name);
            new Notice(`Deleted ${name}`);
            renderGlobals();
          } catch (err: any) {
            new Notice(err?.message ?? String(err));
          }
        };
      }

      const addRow = globalsSection.createEl("div", { cls: "global-var-row add" });
      const nameInput = addRow.createEl("input", { type: "text", placeholder: "Name", cls: "global-var-input" });
      const exprInput = addRow.createEl("input", { type: "text", placeholder: "Expression", cls: "global-var-input" });
      const addBtn = addRow.createEl("button", { text: "Add", cls: "global-var-add" });
      addBtn.onclick = async () => {
        try {
          const trimmedName = nameInput.value.trim();
          await engine.upsertGlobalVar(trimmedName, exprInput.value);
          new Notice(`Added ${trimmedName}`);
          nameInput.value = "";
          exprInput.value = "";
          renderGlobals();
        } catch (err: any) {
          new Notice(err?.message ?? String(err));
        }
      };
    };

    new Setting(containerEl)
      .setName("Global variables")
      .setDesc("Make variables available across notes (experimental)")
      .addToggle(t => t.setValue(this.plugin.settings.globalVarsEnabled)
        .onChange(async v => {
          this.plugin.settings.globalVarsEnabled = v;
          await this.plugin.saveSettings();
          renderGlobals();
        }));

    globalsSection = containerEl.createEl("div", { cls: "global-vars-section" });
    renderGlobals();

    new Setting(containerEl)
      .setName("LaTeX formatting")
      .setDesc("Render calculator results with MathJax (disable for plain text)")
      .addToggle(t => t.setValue(this.plugin.settings.latexFormatting)
        .onChange(async v => { this.plugin.settings.latexFormatting = v; await this.plugin.saveSettings(); }));
  }
}
