import { App, DropdownComponent, PluginSettingTab, Setting, TextAreaComponent, Notice } from "obsidian";
import type EngineeringToolkitPlugin from "./main";
import type { ToolkitSettings } from "./utils/types";
import {
  CUSTOM_LAB_NOTE_TEMPLATE_ID,
  DEFAULT_LAB_NOTE_TEMPLATE,
  DEFAULT_LAB_NOTE_TEMPLATE_ID,
  LAB_NOTE_TEMPLATE_PRESETS,
} from "./labJournalTemplates";

export const DEFAULT_SETTINGS: ToolkitSettings = {
  autoRecalc: true,
  defaultUnitSystem: "SI",
  sigFigs: 4,
  labNotesFolder: "Lab Journal",
  labIndexPath: "Lab Journal/index.md",
  labNoteTemplate: DEFAULT_LAB_NOTE_TEMPLATE,
  labNoteTemplatePresetId: DEFAULT_LAB_NOTE_TEMPLATE_ID,
  globalVarsEnabled: false,
  variablesPanelEnabled: true,
  labJournalEnabled: true,
  diagramHelpersEnabled: true,
  modelEmbedsEnabled: true,
  autocompleteEnabled: true,
  latexFormatting: true,
  modelViewerDefaults: {
    altText: "3D model",
    cameraControls: true,
    autoRotate: false,
    backgroundColor: "#ffffff",
    environmentImage: "",
    exposure: "1",
  },
  exportFormat: "script",
  exportOutputFolder: "Exports",
  exportVariableStyle: "snake_case",
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
      .addToggle(t =>
        t.setValue(this.plugin.settings.autoRecalc)
          .onChange(async v => { this.plugin.settings.autoRecalc = v; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Default unit system")
      .setDesc("Preferred display")
      .addDropdown(d =>
        d.addOptions({ SI: "SI", US: "US" })
          .setValue(this.plugin.settings.defaultUnitSystem)
          .onChange(async v => { this.plugin.settings.defaultUnitSystem = v as any; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Significant figures")
      .setDesc("Displayed precision for results")
      .addSlider(s =>
        s.setLimits(3, 8, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.sigFigs)
          .onChange(async v => { this.plugin.settings.sigFigs = v; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Lab notes folder")
      .setDesc("Folder for new experiment notes")
      .addText(t =>
        t.setPlaceholder("Lab Journal")
          .setValue(this.plugin.settings.labNotesFolder)
          .onChange(async v => {
            this.plugin.settings.labNotesFolder = v || "Lab Journal";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Lab index")
      .setDesc("Path to an index note or folder for experiment listings")
      .addText(t =>
        t.setPlaceholder("Lab Journal/index.md")
          .setValue(this.plugin.settings.labIndexPath)
          .onChange(async v => {
            this.plugin.settings.labIndexPath = v?.trim() || "";
            await this.plugin.saveSettings();
          })
      );

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
        const initialPresetId = templateMatchesPreset && matchedPreset ? matchedPreset.id : CUSTOM_LAB_NOTE_TEMPLATE_ID;

        drop.setValue(initialPresetId).onChange(async value => {
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
      .setDesc("Supports variables like {{title}}, {{date}}, {{time}}, {{datetime}}, {{experiment_id}}, {{folder}}, and {{filename}}.")
      .addTextArea(text => {
        templateArea = text;
        text.setValue(this.plugin.settings.labNoteTemplate || DEFAULT_LAB_NOTE_TEMPLATE);
        text.inputEl.rows = 14;
        text.onChange(async value => {
          if (isUpdatingTemplate) return;
          this.plugin.settings.labNoteTemplate = value;
          this.plugin.settings.labNoteTemplatePresetId = CUSTOM_LAB_NOTE_TEMPLATE_ID;
          presetDropdown?.setValue(CUSTOM_LAB_NOTE_TEMPLATE_ID);
          await this.plugin.saveSettings();
        });
      });

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
      if (!vars.length) globalsSection.createEl("p", { text: "No global constants defined yet." });

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
      .addToggle(t =>
        t.setValue(this.plugin.settings.globalVarsEnabled)
          .onChange(async v => {
            this.plugin.settings.globalVarsEnabled = v;
            await this.plugin.saveSettings();
            renderGlobals();
          })
      );

    globalsSection = containerEl.createEl("div", { cls: "global-vars-section" });
    renderGlobals();

    containerEl.createEl("h3", { text: "Optional modules" });

    new Setting(containerEl)
      .setName("Variables panel")
      .setDesc("Enable the right-side variables view and related refresh events")
      .addToggle(t =>
        t.setValue(this.plugin.settings.variablesPanelEnabled)
          .onChange(async v => {
            this.plugin.settings.variablesPanelEnabled = v;
            await this.plugin.saveSettings();
            await this.plugin.applyFeatureToggles();
          })
      );

    new Setting(containerEl)
      .setName("Lab journal helpers")
      .setDesc("Offer commands that scaffold experiment notes")
      .addToggle(t =>
        t.setValue(this.plugin.settings.labJournalEnabled)
          .onChange(async v => {
            this.plugin.settings.labJournalEnabled = v;
            await this.plugin.saveSettings();
            await this.plugin.applyFeatureToggles();
          })
      );

    new Setting(containerEl)
      .setName("Diagram helpers")
      .setDesc("Expose commands that prepare diagram placeholders")
      .addToggle(t =>
        t.setValue(this.plugin.settings.diagramHelpersEnabled)
          .onChange(async v => {
            this.plugin.settings.diagramHelpersEnabled = v;
            await this.plugin.saveSettings();
            await this.plugin.applyFeatureToggles();
          })
      );

    new Setting(containerEl)
      .setName("Model embeds")
      .setDesc("Allow inserting <model-viewer> helpers and related defaults")
      .addToggle(t =>
        t.setValue(this.plugin.settings.modelEmbedsEnabled)
          .onChange(async v => {
            this.plugin.settings.modelEmbedsEnabled = v;
            await this.plugin.saveSettings();
            await this.plugin.applyFeatureToggles();
          })
      );

    new Setting(containerEl)
      .setName("Calc block autocomplete")
      .setDesc("Suggest scope variables and units while editing calc blocks")
      .addToggle(t =>
        t.setValue(this.plugin.settings.autocompleteEnabled)
          .onChange(async v => {
            this.plugin.settings.autocompleteEnabled = v;
            await this.plugin.saveSettings();
            this.plugin.updateAutocompleteSetting();
          })
      );

    containerEl.createEl("h3", { text: "Export" });

    new Setting(containerEl)
      .setName("Export format")
      .setDesc("Choose between Python script or Jupyter notebook output")
      .addDropdown(d =>
        d.addOptions({ script: "Python script", notebook: "Jupyter notebook" })
          .setValue(this.plugin.settings.exportFormat)
          .onChange(async v => {
            this.plugin.settings.exportFormat = v as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Export folder")
      .setDesc("Vault folder where exports will be saved")
      .addText(t =>
        t.setPlaceholder("Exports")
          .setValue(this.plugin.settings.exportOutputFolder)
          .onChange(async v => {
            this.plugin.settings.exportOutputFolder = v || "";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Variable naming")
      .setDesc("Adjust how variable names are converted to Python identifiers")
      .addDropdown(d =>
        d.addOptions({
          preserve: "Preserve spacing",
          snake_case: "snake_case",
          camelCase: "camelCase",
        })
          .setValue(this.plugin.settings.exportVariableStyle)
          .onChange(async v => {
            this.plugin.settings.exportVariableStyle = v as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model Viewer")
      .setHeading();

    new Setting(containerEl)
      .setName("Dependency status")
      .setDesc(
        this.plugin.modelViewerAvailable
          ? "Model Viewer plugin detected. Inserted embeds will render in preview."
          : "Model Viewer plugin not detected. Install and enable it to render embeds."
      );

    new Setting(containerEl)
      .setName("Default alt text")
      .setDesc("Alt text applied to inserted <model-viewer> elements.")
      .addText(t =>
        t.setPlaceholder("3D model")
          .setValue(this.plugin.settings.modelViewerDefaults.altText)
          .onChange(async v => {
            this.plugin.settings.modelViewerDefaults.altText = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Camera controls")
      .setDesc("Enable orbit controls by default.")
      .addToggle(t =>
        t.setValue(this.plugin.settings.modelViewerDefaults.cameraControls)
          .onChange(async v => {
            this.plugin.settings.modelViewerDefaults.cameraControls = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto rotate")
      .setDesc("Automatically rotate models when inserted embeds load.")
      .addToggle(t =>
        t.setValue(this.plugin.settings.modelViewerDefaults.autoRotate)
          .onChange(async v => {
            this.plugin.settings.modelViewerDefaults.autoRotate = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Background color")
      .setDesc("CSS color applied to the viewer background (leave blank for default).")
      .addText(t =>
        t.setPlaceholder("#ffffff")
          .setValue(this.plugin.settings.modelViewerDefaults.backgroundColor)
          .onChange(async v => {
            this.plugin.settings.modelViewerDefaults.backgroundColor = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Environment image")
      .setDesc("Default environment-image attribute value (optional).")
      .addText(t =>
        t.setPlaceholder("URL or vault path")
          .setValue(this.plugin.settings.modelViewerDefaults.environmentImage)
          .onChange(async v => {
            this.plugin.settings.modelViewerDefaults.environmentImage = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Exposure")
      .setDesc("Default exposure attribute (leave blank to omit).")
      .addText(t =>
        t.setPlaceholder("1")
          .setValue(this.plugin.settings.modelViewerDefaults.exposure)
          .onChange(async v => {
            this.plugin.settings.modelViewerDefaults.exposure = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("LaTeX formatting")
      .setDesc("Render calculator results with MathJax (disable for plain text)")
      .addToggle(t =>
        t.setValue(this.plugin.settings.latexFormatting)
          .onChange(async v => { this.plugin.settings.latexFormatting = v; await this.plugin.saveSettings(); })
      );
  }
}
