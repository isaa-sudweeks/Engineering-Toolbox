import { create, all, Unit } from "mathjs";
const math = create(all, {});

export interface FormattedValueParts {
  magnitude: string;
  unit: string;
  display: string;
}

export function formatValueParts(value: any, precision = 4): FormattedValueParts {
  try {
    if (typeof value === "number") {
      const magnitude = trimZeros(value.toFixed(precision));
      return { magnitude, unit: "", display: magnitude };
    }
    if ((value as Unit)?.toNumber) {
      const unitObj = value as Unit;
      const unitName = unitObj.formatUnits();
      let magnitudeValue: number;
      if (unitName) {
        magnitudeValue = unitObj.toNumber(unitName);
      } else {
        magnitudeValue = unitObj.toNumber();
      }
      const magnitude = trimZeros(magnitudeValue.toFixed(precision));
      const display = unitName ? `${magnitude} ${unitName}` : magnitude;
      return { magnitude, unit: unitName, display };
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

export function formatUnit(u: any, precision = 4): string {
  return formatValueParts(u, precision).display;
}

export function trimZeros(x: string): string {
  return x.replace(/(\.\d*?[1-9])0+$/,"$1").replace(/\.0+$/,"");
}

export { math };
