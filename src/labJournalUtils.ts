import { DEFAULT_LAB_NOTE_TEMPLATE } from "./labJournalTemplates";

const INVALID_FILENAME_CHARACTERS = /[\\/:*?"<>|]/g;

export function sanitizeLabNoteTitle(rawTitle: string): string {
  const trimmed = rawTitle.trim();
  const replaced = trimmed.replace(INVALID_FILENAME_CHARACTERS, "-");
  const collapsedWhitespace = replaced.replace(/\s+/g, " ");
  const collapsedDashes = collapsedWhitespace.replace(/-+/g, "-");
  const cleaned = collapsedDashes.replace(/^-+|-+$/g, "");
  return cleaned || "Untitled";
}

export function getLabNoteFileName(dateStr: string, safeTitle: string): string {
  return `${dateStr} ${safeTitle}.md`;
}

export function normalizeLabNotesFolder(folder: string): string {
  const fallback = folder.trim() || "Lab Journal";
  const normalizedSeparators = fallback.replace(/\\+/g, "/");
  return normalizedSeparators.replace(/\/+$/g, "");
}

export function getLabNotePath(folder: string, fileName: string): string {
  return `${folder}/${fileName}`;
}

export interface LabNoteTemplateContext {
  title: string;
  date: string;
  time: string;
  datetime: string;
  experimentId: string;
  folder: string;
  filename: string;
  year: string;
  month: string;
  day: string;
}

export function buildLabNoteContent(templateSource: string, context: LabNoteTemplateContext): string {
  const template = templateSource?.trim().length ? templateSource : DEFAULT_LAB_NOTE_TEMPLATE;
  const substitutions: Record<string, string> = {
    title: context.title,
    date: context.date,
    iso_date: context.date,
    time: context.time,
    datetime: context.datetime,
    iso_datetime: context.datetime,
    experiment_id: context.experimentId,
    folder: context.folder,
    filename: context.filename,
    year: context.year,
    month: context.month,
    day: context.day,
  };

  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => substitutions[key] ?? "");
}
