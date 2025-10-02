import { App, DropdownComponent, PluginSettingTab, Setting, TextAreaComponent } from "obsidian";
import type EngineeringToolkitPlugin from "./main";
import type { ToolkitSettings } from "./utils/types";
import {
  CUSTOM_LAB_NOTE_TEMPLATE_ID,
  DEFAULT_LAB_NOTE_TEMPLATE,
  DEFAULT_LAB_NOTE_TEMPLATE_ID,
  LAB_NOTE_TEMPLATE_PRESETS
} from "./labJournalTemplates";

export const DEFAULT_SETTINGS: ToolkitSettings = {
  autoRecalc: true,
  defaultUnitSystem: "SI",
  sigFigs: 4,
  labNotesFolder: "Lab Journal",
  labNoteTemplate: DEFAULT_LAB_NOTE_TEMPLATE,
  labNoteTemplatePresetId: DEFAULT_LAB_NOTE_TEMPLATE_ID,
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
        .onChange(async v => {
          this.plugin.settings.labNotesFolder = v || "Lab Journal";
          await this.plugin.saveSettings();
        }));

    containerEl.createEl("h3", { text: "Lab journal templates" });

    let presetDropdown: DropdownComponent | undefined;
    let templateArea: TextAreaComponent | undefined;
    let isUpdatingTemplate = false;

    new Setting(containerEl)
      .setName("Template preset")
      .setDesc("Start from a pre-defined layout")
      .addDropdown(drop => {
        presetDropdown = drop;
        LAB_NOTE_TEMPLATE_PRESETS.forEach(preset => drop.addOption(preset.id, preset.name));
        drop.addOption(CUSTOM_LAB_NOTE_TEMPLATE_ID, "Custom");
        const matchedPreset = LAB_NOTE_TEMPLATE_PRESETS.find(p => p.id === this.plugin.settings.labNoteTemplatePresetId);
        const templateMatchesPreset = matchedPreset?.template === this.plugin.settings.labNoteTemplate;
        const initialPresetId = templateMatchesPreset && matchedPreset
          ? matchedPreset.id
          : CUSTOM_LAB_NOTE_TEMPLATE_ID;
        drop.setValue(initialPresetId)
          .onChange(async (value) => {
            if (value === CUSTOM_LAB_NOTE_TEMPLATE_ID) {
              this.plugin.settings.labNoteTemplatePresetId = value;
              await this.plugin.saveSettings();
              return;
            }
            const preset = LAB_NOTE_TEMPLATE_PRESETS.find(p => p.id === value);
            if (!preset) return;
            isUpdatingTemplate = true;
            try {
              this.plugin.settings.labNoteTemplatePresetId = preset.id;
              this.plugin.settings.labNoteTemplate = preset.template;
              templateArea?.setValue(preset.template);
              await this.plugin.saveSettings();
            } finally {
              isUpdatingTemplate = false;
            }
          });
      });

    new Setting(containerEl)
      .setName("Lab note template")
      .setDesc("Supports {{title}}, {{date}}, {{time}}, {{datetime}}, {{experiment_id}}, {{folder}}, and {{filename}} variables.")
      .addTextArea(text => {
        templateArea = text;
        text.setValue(this.plugin.settings.labNoteTemplate || DEFAULT_LAB_NOTE_TEMPLATE);
        text.inputEl.rows = 14;
        text.onChange(async (value) => {
          if (isUpdatingTemplate) return;
          this.plugin.settings.labNoteTemplate = value;
          this.plugin.settings.labNoteTemplatePresetId = CUSTOM_LAB_NOTE_TEMPLATE_ID;
          presetDropdown?.setValue(CUSTOM_LAB_NOTE_TEMPLATE_ID);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Global variables")
      .setDesc("Make variables available across notes (experimental)")
      .addToggle(t => t.setValue(this.plugin.settings.globalVarsEnabled)
        .onChange(async v => { this.plugin.settings.globalVarsEnabled = v; await this.plugin.saveSettings(); }));
  }
}
