import { Notice, TFile } from "obsidian";
import type EngineeringToolkitPlugin from "./main";

export async function createExperimentNote(plugin: EngineeringToolkitPlugin) {
  const app = plugin.app;
  const title = await plugin.prompt("Enter experiment title:");
  if (!title) return;
  const dateStr = (app as any).moment().format("YYYY-MM-DD");
  const folder = plugin.settings.labNotesFolder || "Lab Journal";
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-");
  const fileName = `${dateStr} ${safeTitle}.md`;
  const path = `${folder}/${fileName}`;

  const content = [
    "---",
    `experiment_id: ${dateStr}-${safeTitle.replace(/\s+/g, "-")}`,
    `date: ${dateStr}`,
    "tags: lab",
    "---",
    "",
    `# ${title}`,
    "",
    `**Date:** ${dateStr}`,
    "**Researchers:**",
    "",
    "## Objective",
    "-",
    "",
    "## Procedure",
    "1.",
    "",
    "## Data & Calculations",
    "```calc",
    "# Define inputs",
    "mass = 5 kg",
    "accel = 9.81 m/s^2",
    "force = mass * accel",
    "",
    "# Convert example",
    "force -> lbf",
    "```",
    "",
    "## Results",
    "-",
    "",
    "## Conclusion",
    "-",
  ].join("\n");

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
    const f = app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) {
      await app.workspace.getLeaf(true).openFile(f);
      await updateLabIndex(plugin, title, path, dateStr);
    }
  } catch (e) {
    console.error("Failed to create experiment note", e);
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
