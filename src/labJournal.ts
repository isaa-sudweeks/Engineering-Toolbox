import { Notice, TFile } from "obsidian";
import type EngineeringToolkitPlugin from "./main";
import { DEFAULT_LAB_NOTE_TEMPLATE } from "./labJournalTemplates";

export async function createExperimentNote(plugin: EngineeringToolkitPlugin) {
  const app = plugin.app;
  const title = await plugin.prompt("Enter experiment title:");
  if (!title) return;

  const momentInstance = (app as any).moment?.();
  const now = momentInstance ?? null;
  const dateStr = now?.format?.("YYYY-MM-DD") ?? new Date().toISOString().slice(0, 10);
  const timeStr = now?.format?.("HH:mm") ?? new Date().toISOString().slice(11, 16);
  const isoDateTime = now?.toISOString?.() ?? new Date().toISOString();

  const folder = plugin.settings.labNotesFolder || "Lab Journal";
  const rawSafeTitle = title.trim().replace(/[\\/:*?"<>|]/g, "-");
  const safeTitle = rawSafeTitle.length > 0 ? rawSafeTitle : "Experiment";
  const fileName = `${dateStr} ${safeTitle}.md`;
  const path = `${folder}/${fileName}`;
  const experimentSlug = safeTitle.trim().replace(/\s+/g, "-");
  const experimentId = `${dateStr}-${experimentSlug}`;

  const templateSource = plugin.settings.labNoteTemplate ?? "";
  const template = templateSource.trim().length > 0 ? templateSource : DEFAULT_LAB_NOTE_TEMPLATE;

  const [year, month = "", day = ""] = dateStr.split("-");

  const substitutions: Record<string, string> = {
    title,
    date: dateStr,
    iso_date: dateStr,
    time: timeStr,
    datetime: isoDateTime,
    iso_datetime: isoDateTime,
    experiment_id: experimentId,
    folder,
    filename: fileName,
    year: year ?? "",
    month,
    day
  };

  const content = template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => substitutions[key] ?? "");

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
