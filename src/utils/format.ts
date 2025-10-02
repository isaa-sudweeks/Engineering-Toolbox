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
