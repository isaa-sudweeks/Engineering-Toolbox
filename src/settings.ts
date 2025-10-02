import { App, PluginSettingTab, Setting } from "obsidian";
import type EngineeringToolkitPlugin from "./main";
import type { ToolkitSettings } from "./utils/types";

export const DEFAULT_SETTINGS: ToolkitSettings = {
  autoRecalc: true,
  defaultUnitSystem: "SI",
  sigFigs: 4,
  labNotesFolder: "Lab Journal",
  labIndexPath: "Lab Journal/index.md",
  globalVarsEnabled: false
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
      .setName("Lab index")
      .setDesc("Path to an index note or folder for experiment listings")
      .addText(t => t.setPlaceholder("Lab Journal/index.md")
        .setValue(this.plugin.settings.labIndexPath)
        .onChange(async v => {
          this.plugin.settings.labIndexPath = v?.trim() || "";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Global variables")
      .setDesc("Make variables available across notes (experimental)")
      .addToggle(t => t.setValue(this.plugin.settings.globalVarsEnabled)
        .onChange(async v => { this.plugin.settings.globalVarsEnabled = v; await this.plugin.saveSettings(); }));
  }
}
