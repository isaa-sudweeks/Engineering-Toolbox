export type UnitString = string;
export type VarName = string;

export interface VarEntry {
  value: any;
  display: string;
}

export interface NoteScope {
  vars: Map<VarName, VarEntry>;
}

export interface ModelViewerDefaults {
  altText: string;
  cameraControls: boolean;
  autoRotate: boolean;
  backgroundColor: string;
  environmentImage: string;
  exposure: string;
}

export interface ToolkitSettings {
  autoRecalc: boolean;
  defaultUnitSystem: "SI" | "US";
  sigFigs: number;
  labNotesFolder: string;
  globalVarsEnabled: boolean;
  modelViewerDefaults: ModelViewerDefaults;
}
