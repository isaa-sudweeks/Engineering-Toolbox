export interface LabNoteTemplatePreset {
  id: string;
  name: string;
  description?: string;
  template: string;
}

export const LAB_NOTE_TEMPLATE_PRESETS: LabNoteTemplatePreset[] = [
  {
    id: "detailed",
    name: "Detailed (default)",
    template: `---
experiment_id: {{experiment_id}}
date: {{date}}
tags: lab
---

# {{title}}

**Date:** {{date}}
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
`
  },
  {
    id: "minimal",
    name: "Minimal",
    template: `---
date: {{date}}
tags: lab
---

# {{title}}

## Notes
-`
  }
];

export const DEFAULT_LAB_NOTE_TEMPLATE_ID = "detailed";
export const CUSTOM_LAB_NOTE_TEMPLATE_ID = "custom";

export const DEFAULT_LAB_NOTE_TEMPLATE = LAB_NOTE_TEMPLATE_PRESETS.find(
  (preset) => preset.id === DEFAULT_LAB_NOTE_TEMPLATE_ID
)!.template;
