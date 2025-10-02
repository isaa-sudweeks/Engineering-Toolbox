export type UnitString = string;
export type VarName = string;

export interface VarEntry {
  value: any;
  magnitude: string;
  unit: string;
  display: string;
  sourceLine?: string;
  source?: string;
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

export interface ModelViewerDefaults {
  altText: string;
  cameraControls: boolean;
  autoRotate: boolean;
  backgroundColor: string;
  environmentImage: string;
  exposure: string;
}

export interface GlobalVarEntry extends VarEntry {
  source: string;
}

export interface ToolkitSettings {
  autoRecalc: boolean;
  defaultUnitSystem: "SI" | "US";
  sigFigs: number;
  labNotesFolder: string;
  labIndexPath: string;
  labNoteTemplate: string;
  labNoteTemplatePresetId: string;
  globalVarsEnabled: boolean;
  variablesPanelEnabled: boolean;
  labJournalEnabled: boolean;
  diagramHelpersEnabled: boolean;
  modelEmbedsEnabled: boolean;
  autocompleteEnabled: boolean;
  evaluationThrottleMs: number;
  latexFormatting: boolean;
  modelViewerDefaults: ModelViewerDefaults;
  exportFormat: "script" | "notebook";
  exportOutputFolder: string;
  exportVariableStyle: "preserve" | "snake_case" | "camelCase";
}

export interface ToolkitData {
  settings: ToolkitSettings;
  globalVars: Record<VarName, GlobalVarEntry>;
}
