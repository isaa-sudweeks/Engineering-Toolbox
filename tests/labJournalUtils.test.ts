import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLabNoteContent,
  getLabNoteFileName,
  getLabNotePath,
  normalizeLabNotesFolder,
  sanitizeLabNoteTitle,
  LabNoteTemplateContext,
} from "../src/labJournalUtils";

const sampleContext = (overrides: Partial<LabNoteTemplateContext> = {}): LabNoteTemplateContext => ({
  title: "Voltage drop analysis",
  date: "2024-09-14",
  time: "09:30",
  datetime: "2024-09-14T09:30:00.000Z",
  experimentId: "2024-09-14-Voltage-drop-analysis",
  folder: "Lab Journal",
  filename: "2024-09-14 Voltage drop analysis.md",
  year: "2024",
  month: "09",
  day: "14",
  ...overrides,
});

describe("labJournalUtils", () => {
  it("sanitizes titles and produces consistent filenames", () => {
    const title = 'Voltage drop "analysis": AC/DC?';
    const dateStr = "2024-09-14";
    const safeTitle = sanitizeLabNoteTitle(title);
    const fileName = getLabNoteFileName(dateStr, safeTitle);

    assert.equal(safeTitle, "Voltage drop -analysis- AC-DC");
    assert.equal(fileName, "2024-09-14 Voltage drop -analysis- AC-DC.md");
    assert.ok(!fileName.endsWith('"'), "filename should not contain stray quotes");
  });

  it("falls back to a default title when the sanitized value is empty", () => {
    const safeTitle = sanitizeLabNoteTitle("/////");
    assert.equal(safeTitle, "Untitled");
  });

  it("normalizes folder paths and builds note paths", () => {
    const folder = normalizeLabNotesFolder("Lab Journal///");
    const path = getLabNotePath(folder, "2024-09-14 Untitled.md");

    assert.equal(folder, "Lab Journal");
    assert.equal(path, "Lab Journal/2024-09-14 Untitled.md");
  });

  it("embeds substitution variables inside the note content", () => {
    const context = sampleContext();
    const content = buildLabNoteContent("Experiment: {{title}} on {{date}} ({{experiment_id}})", context);

    assert.match(content, /Experiment: Voltage drop analysis on 2024-09-14/);
    assert.match(content, /2024-09-14-Voltage-drop-analysis/);
  });

  it("falls back to the default template when the provided template is empty", () => {
    const context = sampleContext();
    const content = buildLabNoteContent("", context);

    assert.match(content, /experiment_id: 2024-09-14-Voltage-drop-analysis/);
    assert.match(content, /# Voltage drop analysis/);
  });
});
