export type UnitString = string;
export type VarName = string;

export interface VarEntry {
  value: any;
  display: string;
}

export interface NoteScope {
  vars: Map<VarName, VarEntry>;
  formulas: Map<VarName, string>;
  dependencies: Map<VarName, Set<VarName>>;
  dependents: Map<VarName, Set<VarName>>;
  lineCache: Map<string, LineCacheEntry>;
}

export interface LineCacheEntry {
  expr: string;
  value: any;
  display: string;
  dependencies: Set<VarName>;
  type: "expression" | "convert";
  targetUnit?: string;
}

export interface ToolkitSettings {
  autoRecalc: boolean;
  defaultUnitSystem: "SI" | "US";
  sigFigs: number;
  labNotesFolder: string;
  globalVarsEnabled: boolean;
}
