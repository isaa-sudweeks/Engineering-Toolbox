import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLabNoteContent,
  getLabNoteFileName,
  getLabNotePath,
  normalizeLabNotesFolder,
  sanitizeLabNoteTitle,
} from "../src/labJournalUtils";

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

  it("embeds the experiment id slug inside the note content", () => {
    const content = buildLabNoteContent("My Title", "2024-09-14", "My Title");

    assert.match(content, /experiment_id: 2024-09-14-My-Title/);
    assert.match(content, /# My Title/);
  });
});
