import { Notice, TFile } from "obsidian";
import type EngineeringToolkitPlugin from "./main";

export async function createExperimentNote(plugin: EngineeringToolkitPlugin) {
  const app = plugin.app;
  const title = await plugin.prompt("Enter experiment title:");
  if (!title) return;
  const dateStr = (app as any).moment().format("YYYY-MM-DD");
  const folder = plugin.settings.labNotesFolder || "Lab Journal";
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-");
  const fileName = `${dateStr} ${safeTitle}.md";
  const path = `${folder}/${fileName}`;

  const content = `---
experiment_id: ${dateStr}-${safeTitle.replace(/\s+/g,"-")}
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
\\`\\`\\`calc
# Define inputs
mass = 5 kg
accel = 9.81 m/s^2
force = mass * accel

# Convert example
force -> lbf
\\`\\`\\`

## Results
- 

## Conclusion
- 
`;

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
