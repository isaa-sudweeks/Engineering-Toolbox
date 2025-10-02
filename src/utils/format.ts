import { create, all, Unit } from "mathjs";
const math = create(all, {});

export function formatUnit(u: any, precision = 4): string {
  try {
    if (typeof u === "number") return trimZeros(u.toFixed(precision));
    if ((u as Unit)?.toNumber) {
      const unitName = (u as Unit).formatUnits();
      const val = (u as Unit).toNumber(unitName);
      return `${trimZeros(val.toFixed(precision))} ${unitName}`.trim();
    }
    if (u?.format) return u.format({ notation: "fixed", precision });
    return String(u);
  } catch {
    return String(u);
  }
}

export function trimZeros(x: string): string {
  return x.replace(/(\.\d*?[1-9])0+$/,"$1").replace(/\.0+$/,"");
}

export { math };
