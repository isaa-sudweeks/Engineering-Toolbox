import { Notice, TFile } from "obsidian";
import type EngineeringToolkitPlugin from "./main";
import {
  buildLabNoteContent,
  getLabNoteFileName,
  getLabNotePath,
  normalizeLabNotesFolder,
  sanitizeLabNoteTitle,
} from "./labJournalUtils";

export async function createExperimentNote(plugin: EngineeringToolkitPlugin) {
  const app = plugin.app;
  const title = await plugin.prompt("Enter experiment title:");
  if (!title) return;
  const dateStr = (app as any).moment().format("YYYY-MM-DD");
  const folderSetting = plugin.settings.labNotesFolder || "Lab Journal";
  const folder = normalizeLabNotesFolder(folderSetting);
  const safeTitle = sanitizeLabNoteTitle(title);
  const fileName = getLabNoteFileName(dateStr, safeTitle);
  const path = getLabNotePath(folder, fileName);

  if (app.vault.getAbstractFileByPath(path)) {
    new Notice("An experiment note with this title already exists.");
    return;
  }

  const content = buildLabNoteContent(title, dateStr, safeTitle);

  if (!app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder).catch(() => {});
  }

  try {
    await app.vault.create(path, content);
    const f = app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) await app.workspace.getLeaf(true).openFile(f);
  } catch (e) {
    new Notice("Failed to create experiment note (maybe exists?)");
  }
}
