export type UnitString = string;
export type VarName = string;

export interface VarEntry {
  value: any;
  magnitude: string;
  unit: string;
  display: string;
  sourceLine?: string;
}

export interface NoteScope {
  vars: Map<VarName, VarEntry>;
}

export interface ToolkitSettings {
  autoRecalc: boolean;
  defaultUnitSystem: "SI" | "US";
  sigFigs: number;
  labNotesFolder: string;
  globalVarsEnabled: boolean;
  latexFormatting: boolean;
}
