import { App, PluginSettingTab, Setting } from "obsidian";
import type EngineeringToolkitPlugin from "./main";
import type { ToolkitSettings } from "./utils/types";

export const DEFAULT_SETTINGS: ToolkitSettings = {
  autoRecalc: true,
  defaultUnitSystem: "SI",
  sigFigs: 4,
  labNotesFolder: "Lab Journal",
  globalVarsEnabled: false,
  variablesPanelEnabled: true,
  labJournalEnabled: true,
  diagramHelpersEnabled: false,
  modelEmbedsEnabled: false
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

    new Setting(containerEl)
      .setName("Global variables")
      .setDesc("Make variables available across notes (experimental)")
      .addToggle(t => t.setValue(this.plugin.settings.globalVarsEnabled)
        .onChange(async v => {
          this.plugin.settings.globalVarsEnabled = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Variables panel")
      .setDesc("Enable the right-side variables view and related commands")
      .addToggle(t => t.setValue(this.plugin.settings.variablesPanelEnabled)
        .onChange(async v => {
          this.plugin.settings.variablesPanelEnabled = v;
          await this.plugin.saveSettings();
          await this.plugin.applyFeatureToggles();
        }));

    new Setting(containerEl)
      .setName("Lab journal helpers")
      .setDesc("Offer commands to scaffold experiment notes")
      .addToggle(t => t.setValue(this.plugin.settings.labJournalEnabled)
        .onChange(async v => {
          this.plugin.settings.labJournalEnabled = v;
          await this.plugin.saveSettings();
          await this.plugin.applyFeatureToggles();
        }));

    new Setting(containerEl)
      .setName("Diagram helpers")
      .setDesc("Expose commands that insert diagram placeholders")
      .addToggle(t => t.setValue(this.plugin.settings.diagramHelpersEnabled)
        .onChange(async v => {
          this.plugin.settings.diagramHelpersEnabled = v;
          await this.plugin.saveSettings();
          await this.plugin.applyFeatureToggles();
        }));

    new Setting(containerEl)
      .setName("Model embeds")
      .setDesc("Enable helpers for embedding 3D/technical models")
      .addToggle(t => t.setValue(this.plugin.settings.modelEmbedsEnabled)
        .onChange(async v => {
          this.plugin.settings.modelEmbedsEnabled = v;
          await this.plugin.saveSettings();
          await this.plugin.applyFeatureToggles();
        }));
  }
}
