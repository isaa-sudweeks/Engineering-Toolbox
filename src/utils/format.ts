import { create, all, Unit } from "mathjs";

const math = create(all, {});

export type UnitSystem = "SI" | "US";

export interface FormatUnitOptions {
  skipSystemConversion?: boolean;
}

const UNIT_SYSTEM_DEFAULTS: Record<UnitSystem, Record<string, string>> = {
  SI: {
    "0,1,0,0,0,0,0,0,0": "m",
    "0,2,0,0,0,0,0,0,0": "m^2",
    "0,3,0,0,0,0,0,0,0": "L",
    "0,3,-1,0,0,0,0,0,0": "m^3/s",
    "0,0,1,0,0,0,0,0,0": "s",
    "0,1,-1,0,0,0,0,0,0": "m/s",
    "0,1,-2,0,0,0,0,0,0": "m/s^2",
    "1,0,0,0,0,0,0,0,0": "kg",
    "1,1,-2,0,0,0,0,0,0": "N",
    "1,-1,-2,0,0,0,0,0,0": "Pa",
    "1,2,-2,0,0,0,0,0,0": "J",
    "1,2,-3,0,0,0,0,0,0": "W",
    "1,-3,0,0,0,0,0,0,0": "kg/m^3",
    "0,0,-1,0,0,0,0,0,0": "Hz",
    "0,0,0,0,1,0,0,0,0": "degC",
    "0,0,0,0,0,0,0,1,0": "rad"
  },
  US: {
    "0,1,0,0,0,0,0,0,0": "ft",
    "0,2,0,0,0,0,0,0,0": "ft^2",
    "0,3,0,0,0,0,0,0,0": "gal",
    "0,3,-1,0,0,0,0,0,0": "ft^3/min",
    "0,0,1,0,0,0,0,0,0": "s",
    "0,1,-1,0,0,0,0,0,0": "ft/s",
    "0,1,-2,0,0,0,0,0,0": "ft/s^2",
    "1,0,0,0,0,0,0,0,0": "lb",
    "1,1,-2,0,0,0,0,0,0": "lbf",
    "1,-1,-2,0,0,0,0,0,0": "psi",
    "1,2,-2,0,0,0,0,0,0": "ft*lbf",
    "1,2,-3,0,0,0,0,0,0": "hp",
    "1,-3,0,0,0,0,0,0,0": "lb/ft^3",
    "0,0,-1,0,0,0,0,0,0": "Hz",
    "0,0,0,0,1,0,0,0,0": "degF",
    "0,0,0,0,0,0,0,1,0": "deg"
  }
};

const UNIT_SYMBOLS: Record<string, string> = {
  degC: "°C",
  degF: "°F",
  degR: "°R",
  deg: "°"
};

export function normalizeUnitToSystem(value: any, system: UnitSystem): any {
  if (!isUnit(value)) return value;
  const key = getDimensionKey(value);
  const preferred = UNIT_SYSTEM_DEFAULTS[system][key];
  if (!preferred) return value;
  try {
    return value.to(preferred);
  } catch {
    return value;
  }
}

export function formatUnit(
  u: any,
  precision = 4,
  system: UnitSystem = "SI",
  options: FormatUnitOptions = {}
): string {
  try {
    if (typeof u === "number") return trimZeros(u.toFixed(precision));
    if (isUnit(u)) {
      const normalized = options.skipSystemConversion ? u : normalizeUnitToSystem(u, system);
      const unitName = normalized.formatUnits();
      const numeric = normalized.toNumber(unitName || "");
      const displayUnit = UNIT_SYMBOLS[unitName] ?? unitName;
      const valueText = trimZeros(numeric.toFixed(precision));
      return displayUnit ? `${valueText} ${displayUnit}`.trim() : valueText;
    }
    if (u?.format) return u.format({ notation: "fixed", precision });
    return String(u);
  } catch {
    return String(u);
  }
}

function isUnit(value: any): value is Unit {
  return !!value && typeof value === "object" && Array.isArray((value as Unit).dimensions);
}

function getDimensionKey(unit: Unit): string {
  return unit.dimensions?.join(",") ?? "";
}

export function trimZeros(x: string): string {
  return x.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export { math };
