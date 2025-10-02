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
  describe("sanitizeLabNoteTitle", () => {
    it("removes invalid characters, trims whitespace, and collapses gaps", () => {
      const title = '  Voltage   drop  "analysis" : AC/DC?  ';
      const safeTitle = sanitizeLabNoteTitle(title);

      assert.equal(safeTitle, "Voltage drop -analysis- - AC-DC");
    });

    it("collapses consecutive separators", () => {
      const safeTitle = sanitizeLabNoteTitle("---experimental   /// setup---");

      assert.equal(safeTitle, "experimental - setup");
    });

    it("falls back to a default title when the sanitized value is empty", () => {
      const safeTitle = sanitizeLabNoteTitle("/////");
      assert.equal(safeTitle, "Untitled");
    });
  });

  describe("getLabNoteFileName", () => {
    it("produces a Markdown filename using the date and sanitized title", () => {
      const dateStr = "2024-09-14";
      const safeTitle = sanitizeLabNoteTitle('Voltage drop "analysis": AC/DC?');
      const fileName = getLabNoteFileName(dateStr, safeTitle);

      assert.equal(fileName, "2024-09-14 Voltage drop -analysis- AC-DC.md");
      assert.ok(!fileName.endsWith('"'), "filename should not contain stray quotes");
    });
  });

  describe("normalizeLabNotesFolder", () => {
    it("trims trailing slashes and converts backslashes", () => {
      const folder = normalizeLabNotesFolder("\\\\Projects\\\\Lab Journal///");

      assert.equal(folder, "/Projects/Lab Journal");
    });

    it("uses a default folder when an empty value is provided", () => {
      const folder = normalizeLabNotesFolder("   ");

      assert.equal(folder, "Lab Journal");
    });
  });

  describe("getLabNotePath", () => {
    it("joins the folder and filename with a slash", () => {
      const path = getLabNotePath("Lab Journal", "2024-09-14 Voltage drop analysis.md");

      assert.equal(path, "Lab Journal/2024-09-14 Voltage drop analysis.md");
    });
  });

  describe("buildLabNoteContent", () => {
    it("embeds substitution variables inside the note content", () => {
      const context = sampleContext();
      const content = buildLabNoteContent("Experiment: {{title}} on {{date}} ({{experiment_id}})", context);

      assert.match(content, /Experiment: Voltage drop analysis on 2024-09-14/);
      assert.match(content, /2024-09-14-Voltage-drop-analysis/);
    });

    it("replaces unknown variables with empty strings", () => {
      const context = sampleContext();
      const content = buildLabNoteContent("Unknown: '{{missing}}'", context);

      assert.equal(content, "Unknown: ''");
    });

    it("falls back to the default template when the provided template is empty", () => {
      const context = sampleContext();
      const content = buildLabNoteContent("", context);

      assert.match(content, /experiment_id: 2024-09-14-Voltage-drop-analysis/);
      assert.match(content, /# Voltage drop analysis/);
    });
  });
});
