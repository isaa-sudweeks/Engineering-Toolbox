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

export function buildLabNoteContent(
  title: string,
  dateStr: string,
  safeTitle: string,
): string {
  const experimentId = `${dateStr}-${safeTitle.replace(/\s+/g, "-")}`;
  return `---
experiment_id: ${experimentId}
date: ${dateStr}
tags: lab
---

# ${title}

**Date:** ${dateStr}
**Researchers:**

## Objective
-

## Procedure
1.

## Data & Calculations
\`\`\`calc
# Define inputs
mass = 5 kg
accel = 9.81 m/s^2
force = mass * accel

# Convert example
force -> lbf
\`\`\`

## Results
-

## Conclusion
-
`;
}
