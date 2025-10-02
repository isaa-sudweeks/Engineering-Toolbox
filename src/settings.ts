import { App, PluginSettingTab, Setting } from "obsidian";
import type EngineeringToolkitPlugin from "./main";
import type { ToolkitSettings } from "./utils/types";

export const DEFAULT_SETTINGS: ToolkitSettings = {
  autoRecalc: true,
  defaultUnitSystem: "SI",
  sigFigs: 4,
  labNotesFolder: "Lab Journal",
  globalVarsEnabled: false,
  modelViewerDefaults: {
    altText: "3D model",
    cameraControls: true,
    autoRotate: false,
    backgroundColor: "#ffffff",
    environmentImage: "",
    exposure: "1"
  }
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
    this.plugin.refreshModelViewerAvailability();
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
        .onChange(async v => { this.plugin.settings.globalVarsEnabled = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Model Viewer")
      .setHeading();

    new Setting(containerEl)
      .setName("Dependency status")
      .setDesc(this.plugin.modelViewerAvailable
        ? "Model Viewer plugin detected. Inserted embeds will render in preview."
        : "Model Viewer plugin not detected. Install and enable the community Model Viewer plugin to render embeds.");

    new Setting(containerEl)
      .setName("Default alt text")
      .setDesc("Alt text applied to inserted <model-viewer> elements.")
      .addText(t => t
        .setPlaceholder("3D model")
        .setValue(this.plugin.settings.modelViewerDefaults.altText)
        .onChange(async v => {
          this.plugin.settings.modelViewerDefaults.altText = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Camera controls")
      .setDesc("Enable orbit controls by default.")
      .addToggle(t => t
        .setValue(this.plugin.settings.modelViewerDefaults.cameraControls)
        .onChange(async v => {
          this.plugin.settings.modelViewerDefaults.cameraControls = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Auto rotate")
      .setDesc("Automatically rotate models when inserted embeds load.")
      .addToggle(t => t
        .setValue(this.plugin.settings.modelViewerDefaults.autoRotate)
        .onChange(async v => {
          this.plugin.settings.modelViewerDefaults.autoRotate = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Background color")
      .setDesc("CSS color applied to the viewer background (leave blank for default).")
      .addText(t => t
        .setPlaceholder("#ffffff")
        .setValue(this.plugin.settings.modelViewerDefaults.backgroundColor)
        .onChange(async v => {
          this.plugin.settings.modelViewerDefaults.backgroundColor = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Environment image")
      .setDesc("Default environment-image attribute value (optional).")
      .addText(t => t
        .setPlaceholder("URL or vault path")
        .setValue(this.plugin.settings.modelViewerDefaults.environmentImage)
        .onChange(async v => {
          this.plugin.settings.modelViewerDefaults.environmentImage = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Exposure")
      .setDesc("Default exposure attribute (leave blank to omit).")
      .addText(t => t
        .setPlaceholder("1")
        .setValue(this.plugin.settings.modelViewerDefaults.exposure)
        .onChange(async v => {
          this.plugin.settings.modelViewerDefaults.exposure = v;
          await this.plugin.saveSettings();
        }));
  }
}
