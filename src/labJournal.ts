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

  const momentInstance = (app as any).moment?.();
  const now = momentInstance ?? null;
  const dateStr = now?.format?.("YYYY-MM-DD") ?? new Date().toISOString().slice(0, 10);
  const timeStr = now?.format?.("HH:mm") ?? new Date().toISOString().slice(11, 16);
  const isoDateTime = now?.toISOString?.() ?? new Date().toISOString();

  const folder = normalizeLabNotesFolder(plugin.settings.labNotesFolder || "Lab Journal");
  const safeTitle = sanitizeLabNoteTitle(title);
  const fileName = getLabNoteFileName(dateStr, safeTitle);
  const path = getLabNotePath(folder, fileName);

  const experimentSlug = safeTitle.replace(/\s+/g, "-");
  const experimentId = `${dateStr}-${experimentSlug}`;
  const [year = "", month = "", day = ""] = dateStr.split("-");

  const templateSource = plugin.settings.labNoteTemplate ?? "";
  const content = buildLabNoteContent(templateSource, {
    title,
    date: dateStr,
    time: timeStr,
    datetime: isoDateTime,
    experimentId,
    folder,
    filename: fileName,
    year,
    month,
    day,
  });

  if (!app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder).catch(() => {});
  }

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    new Notice("Experiment note already exists. Opening existing note.");
    await app.workspace.getLeaf(true).openFile(existing);
    await updateLabIndex(plugin, title, path, dateStr);
    return;
  }

  try {
    await app.vault.create(path, content);
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await app.workspace.getLeaf(true).openFile(file);
      await updateLabIndex(plugin, title, path, dateStr);
    }
  } catch (error) {
    console.error("Failed to create experiment note", error);
    new Notice("Failed to create experiment note");
  }
}

async function updateLabIndex(plugin: EngineeringToolkitPlugin, title: string, path: string, dateStr: string) {
  const app = plugin.app;
  const indexSetting = plugin.settings.labIndexPath?.trim();
  if (!indexSetting) return;

  const normalizedPath = indexSetting.endsWith(".md")
    ? indexSetting
    : `${indexSetting.replace(/\/$/, "") || "Lab Journal"}/index.md`;

  const indexFolder = normalizedPath.split("/").slice(0, -1).join("/");
  if (indexFolder && !app.vault.getAbstractFileByPath(indexFolder)) {
    await app.vault.createFolder(indexFolder).catch(() => {});
  }

  try {
    const indexFile = app.vault.getAbstractFileByPath(normalizedPath);
    const linkTarget = path.replace(/\.md$/, "");
    const entryLine = `- ${dateStr} [[${linkTarget}|${title}]]`;

    if (indexFile instanceof TFile) {
      const current = await app.vault.read(indexFile);
      if (current.includes(linkTarget)) return;
      const updated = `${current.trimEnd()}\n${entryLine}\n`;
      await app.vault.modify(indexFile, updated);
    } else {
      const initial = `# Lab Journal Index\n\n${entryLine}\n`;
      await app.vault.create(normalizedPath, initial);
    }
  } catch (err) {
    console.error("Failed to update lab index", err);
    new Notice("Failed to update lab index");
  }
}
