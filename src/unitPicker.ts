import { Modal, Notice } from "obsidian";
import type EngineeringToolkitPlugin from "./main";
import type { ToolkitSettings } from "./utils/types";

export type UnitSystem = ToolkitSettings["defaultUnitSystem"];

export interface UnitDefinition {
  system: UnitSystem;
  category: string;
  name: string;
  symbol: string;
  description?: string;
}

export const UNIT_LIBRARY: UnitDefinition[] = [
  { system: "SI", category: "Length", name: "meter", symbol: "m" },
  { system: "SI", category: "Length", name: "kilometer", symbol: "km" },
  { system: "SI", category: "Length", name: "millimeter", symbol: "mm" },
  { system: "SI", category: "Mass", name: "kilogram", symbol: "kg" },
  { system: "SI", category: "Mass", name: "gram", symbol: "g" },
  { system: "SI", category: "Time", name: "second", symbol: "s" },
  { system: "SI", category: "Time", name: "minute", symbol: "min" },
  { system: "SI", category: "Temperature", name: "kelvin", symbol: "K" },
  { system: "SI", category: "Temperature", name: "degree Celsius", symbol: "°C" },
  { system: "SI", category: "Force", name: "newton", symbol: "N" },
  { system: "SI", category: "Pressure", name: "pascal", symbol: "Pa" },
  { system: "SI", category: "Energy", name: "joule", symbol: "J" },
  { system: "SI", category: "Power", name: "watt", symbol: "W" },
  { system: "SI", category: "Volume", name: "liter", symbol: "L" },
  { system: "SI", category: "Area", name: "square meter", symbol: "m²" },
  { system: "US", category: "Length", name: "inch", symbol: "in" },
  { system: "US", category: "Length", name: "foot", symbol: "ft" },
  { system: "US", category: "Length", name: "mile", symbol: "mi" },
  { system: "US", category: "Mass", name: "pound", symbol: "lb" },
  { system: "US", category: "Mass", name: "ounce", symbol: "oz" },
  { system: "US", category: "Time", name: "second", symbol: "s" },
  { system: "US", category: "Time", name: "minute", symbol: "min" },
  { system: "US", category: "Temperature", name: "degree Fahrenheit", symbol: "°F" },
  { system: "US", category: "Force", name: "pound-force", symbol: "lbf" },
  { system: "US", category: "Pressure", name: "pounds per square inch", symbol: "psi" },
  { system: "US", category: "Energy", name: "BTU", symbol: "BTU" },
  { system: "US", category: "Power", name: "horsepower", symbol: "hp" },
  { system: "US", category: "Volume", name: "gallon", symbol: "gal" },
  { system: "US", category: "Area", name: "square foot", symbol: "ft²" }
];

function groupUnitsByCategory(units: UnitDefinition[]): Map<string, UnitDefinition[]> {
  const groups = new Map<string, UnitDefinition[]>();
  for (const unit of units) {
    if (!groups.has(unit.category)) groups.set(unit.category, []);
    groups.get(unit.category)!.push(unit);
  }
  return groups;
}

export class UnitPickerModal extends Modal {
  private plugin: EngineeringToolkitPlugin;
  private system: UnitSystem;
  private onChoose?: (unit: UnitDefinition) => void;

  constructor(plugin: EngineeringToolkitPlugin, onChoose?: (unit: UnitDefinition) => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onChoose = onChoose;
    this.system = this.plugin.settings.defaultUnitSystem;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Select a unit" });

    const systemWrapper = contentEl.createDiv({ cls: "unit-picker-system" });
    systemWrapper.createSpan({ text: "System:" });
    const systemSelect = systemWrapper.createEl("select");
    for (const sys of ["SI", "US"] as UnitSystem[]) {
      const option = systemSelect.createEl("option", { text: sys, value: sys });
      if (sys === this.system) option.selected = true;
    }
    systemSelect.onchange = () => {
      this.system = systemSelect.value as UnitSystem;
      this.renderUnitList(contentEl);
    };

    contentEl.createDiv({ cls: "unit-picker-divider" });
    this.renderUnitList(contentEl);
  }

  private renderUnitList(contentEl: HTMLElement) {
    let list = contentEl.querySelector<HTMLElement>(".unit-picker-list");
    if (!list) list = contentEl.createDiv({ cls: "unit-picker-list" });
    list.empty();

    const units = UNIT_LIBRARY.filter(u => u.system === this.system);
    const grouped = groupUnitsByCategory(units);

    grouped.forEach((categoryUnits, category) => {
      const header = list!.createEl("h4", { text: category });
      header.addClass("unit-picker-category");
      const groupEl = list!.createDiv({ cls: "unit-picker-buttons" });
      for (const unit of categoryUnits) {
        const btn = groupEl.createEl("button", { text: `${unit.name} (${unit.symbol})` });
        btn.onclick = () => {
          if (!this.plugin.insertUnitIntoActiveEditor(unit.symbol)) {
            new Notice("No active editor to insert unit");
            return;
          }
          this.onChoose?.(unit);
          this.close();
        };
      }
    });
  }
}

export function createInlineUnitPicker(container: HTMLElement, plugin: EngineeringToolkitPlugin) {
  const wrapper = container.createDiv({ cls: "unit-picker-inline" });
  wrapper.createEl("h3", { text: "Unit Picker" });

  const controls = wrapper.createDiv({ cls: "unit-picker-controls" });
  const systemLabel = controls.createSpan({ text: "System:" });
  systemLabel.addClass("unit-picker-label");

  const systemSelect = controls.createEl("select");
  ( ["SI", "US"] as UnitSystem[]).forEach(sys => {
    const opt = systemSelect.createEl("option", { text: sys, value: sys });
    if (sys === plugin.settings.defaultUnitSystem) opt.selected = true;
  });

  const unitSelect = controls.createEl("select", { cls: "unit-picker-unit-select" });

  const updateUnitOptions = () => {
    const system = systemSelect.value as UnitSystem;
    unitSelect.empty();
    const grouped = groupUnitsByCategory(UNIT_LIBRARY.filter(u => u.system === system));
    grouped.forEach((categoryUnits, category) => {
      const group = unitSelect.createEl("optgroup", { label: category });
      for (const unit of categoryUnits) {
        group.createEl("option", { text: `${unit.name} (${unit.symbol})`, value: unit.symbol });
      }
    });
  };

  systemSelect.onchange = () => updateUnitOptions();
  updateUnitOptions();

  const actions = wrapper.createDiv({ cls: "unit-picker-actions" });
  const insertButton = actions.createEl("button", { text: "Insert unit" });
  insertButton.onclick = () => {
    const unitSymbol = unitSelect.value;
    if (!unitSymbol) return;
    if (!plugin.insertUnitIntoActiveEditor(unitSymbol)) {
      new Notice("No active editor to insert unit");
    }
  };

  return wrapper;
}
