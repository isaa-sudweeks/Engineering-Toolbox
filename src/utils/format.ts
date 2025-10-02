import { create, all, Unit } from "mathjs";

const math = create(all, {});

export type UnitSystem = "SI" | "US";

export interface FormatUnitOptions {
  skipSystemConversion?: boolean;
}

export interface FormattedValueParts {
  magnitude: string;
  unit: string;
  display: string;
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
    "0,0,0,0,0,0,0,1,0": "rad",
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
    "0,0,0,0,0,0,0,1,0": "deg",
  },
};

const UNIT_SYMBOLS: Record<string, string> = {
  degC: "°C",
  degF: "°F",
  degR: "°R",
  deg: "°",
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

export function formatValueParts(
  value: any,
  precision = 4,
  system: UnitSystem = "SI",
  options: FormatUnitOptions = {},
): FormattedValueParts {
  try {
    if (typeof value === "number") {
      const magnitude = trimZeros(value.toFixed(precision));
      return { magnitude, unit: "", display: magnitude };
    }
    if (isUnit(value)) {
      const normalized = options.skipSystemConversion ? value : normalizeUnitToSystem(value, system);
      const rawUnitName = normalized.formatUnits();
      const displayUnit = rawUnitName ? UNIT_SYMBOLS[rawUnitName] ?? rawUnitName : "";
      let numeric: number;
      if (rawUnitName) {
        numeric = normalized.toNumber(rawUnitName);
      } else {
        numeric = normalized.toNumber();
      }
      const magnitude = trimZeros(numeric.toFixed(precision));
      const display = displayUnit ? `${magnitude} ${displayUnit}`.trim() : magnitude;
      return { magnitude, unit: displayUnit, display };
    }
    if (value?.format) {
      const display = value.format({ notation: "fixed", precision });
      return { magnitude: display, unit: "", display };
    }
    const display = String(value);
    return { magnitude: display, unit: "", display };
  } catch {
    const display = String(value);
    return { magnitude: display, unit: "", display };
  }
}

export function formatUnit(
  value: any,
  precision = 4,
  system: UnitSystem = "SI",
  options: FormatUnitOptions = {},
): string {
  return formatValueParts(value, precision, system, options).display;
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

export function formatUnitLatex(u: any, precision = 4): string {
  try {
    if (typeof u === "number") return trimZeros(u.toFixed(precision));
    if ((u as Unit)?.toNumber) {
      const unitName = (u as Unit).formatUnits();
      const val = (u as Unit).toNumber(unitName);
      const numeric = trimZeros(val.toFixed(precision));
      const latexUnits = unitName ? `\\,${unitsToLatex(unitName)}` : "";
      return `${numeric}${latexUnits}`.trim();
    }
    if (typeof u?.toTex === "function") return u.toTex({ notation: "fixed", precision });
    if (u?.format) return escapeLatex(u.format({ notation: "fixed", precision }));
    return escapeLatex(String(u));
  } catch {
    return escapeLatex(String(u));
  }
}

function unitsToLatex(units: string): string {
  return units
    .split(/\s+/)
    .filter(Boolean)
    .map(token => {
      if (token === "/") return "/";
      if (token === "*") return "\\cdot";
      const match = token.match(/^([A-Za-zµΩ°%]+)(\^(-?\d+))?$/);
      if (match) {
        const base = `\\mathrm{${escapeLatex(match[1])}}`;
        return match[3] ? `${base}^{${match[3]}}` : base;
      }
      return `\\mathrm{${escapeLatex(token)}}`;
    })
    .join("\\,");
}

export function escapeLatex(value: string): string {
  return value.replace(/([\\{}_^%$#&])/g, "\\$1");
}

export { math };
