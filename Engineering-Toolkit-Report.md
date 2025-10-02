# Engineering Toolkit Plugin Proposal

## Background and Gap Analysis
Engineering students often need to incorporate calculations, unit conversions, diagrams, and technical notes into their study workflow. Obsidian’s core features and community plugins provide some support, but significant gaps remain. For example, Obsidian supports LaTeX for math, but it lacks MathCAD-like functionality for *interactive* formula evaluation and unit-consistent calculations. Community plugins like **Obsidian Unit Converter** enable inline unit conversions within notes, and **Obsidian Solve** adds basic arithmetic, date math, and even unit interpretation. However, these tools are isolated solutions; there is no unified plugin offering a *structured engineering worksheet* experience. Similarly, while **Circuit Sketcher** allows drawing simple circuit diagrams on a canvas and a **Model Viewer** plugin can embed 3D models (e.g. CAD files) inside notes, integrating these into a cohesive note-taking workflow is still cumbersome. Lab journaling must currently be pieced together with general-purpose templates or vault setups, as no dedicated electronic lab notebook plugin exists. These gaps suggest an opportunity for a comprehensive **Engineering Toolkit** plugin that consolidates formula calculations (with units), quick conversions, and other engineering-specific note-taking features into one practical workflow.

## Plugin Purpose and Features
**Plugin Name:** *Obsidian Engineering Toolkit* (working title)

**Purpose:** Provide a suite of tools within Obsidian to support common engineering student workflows—namely, writing and evaluating formulas with units, performing unit conversions, sketching quick diagrams, and organizing lab notes—without leaving the markdown environment. The plugin aims to bridge the gap between plain text notes and the rich, calculation-capable documentation found in software like MathCAD or Jupyter, all integrated into Obsidian’s UI.

**Key Features:**
- **Inline Calculations with Units:** Evaluate mathematical expressions directly in a note, with proper unit handling and conversion. Example: `= 5 kg * 9.81 m/s^2` → `= 49.05 N`.
- **Variable Definitions and References:** Define variables/consts and reuse them across a note (or vault, optionally). Example: `mass = 5 kg`, `accel = 9.81 m/s^2`, `force = mass * accel`.
- **Unit Conversion Shortcuts:** Inline conversion syntax (e.g., `= 72 km/h to m/s`) with a broad unit set.
- **Automatic Formula Formatting:** Render readable formulas + numeric results (LaTeX/HTML), highlighting units and sig figs.
- **Circuit & Diagram Integration:** Commands to insert/edit diagram placeholders via external plugins (Circuit Sketcher, Excalidraw, Diagrams.net). Also helpers for 3D models via Model Viewer.
- **Lab Journal Aids:** “New Experiment Note” command: template with frontmatter and sections (Objective, Procedure, Data, Results, Conclusion). Optional index.
- **UI Elements:** Variables & Units sidebar, quick Unit Picker, configurable sig figs and unit system.
- **Customization:** Toggle auto-calc, choose SI/US, set sig figs, enable/disable features, per-note/global variable scope.

## User Workflow
1. **Setup:** Enable plugin, set SI/US, sig figs, lab folder, and auto-calc.
2. **Write Formulas:** Use ```calc fenced blocks or inline `=` to define/evaluate expressions with units; results render in Preview/Live Preview.
3. **Reuse Variables:** Reference previously defined variables (`work = force * 10 m`). Downstream results update when inputs change.
4. **Convert Units:** Append `->` or `to` conversions (`force -> lbf`, `72 km/h to m/s`).
5. **Diagrams/CAD:** Commands create/insert circuit canvases or 3D model embeds (leveraging existing plugins).
6. **Lab Notes:** “New Experiment Note” creates a structured note with a calc block ready for data crunching.
7. **Export:** Notes render calculations and diagrams; export/print includes results. Toggle visibility as needed.

## Core Logic and Architecture
- **Data Model:** In-memory per-note variable map `{name → {value, display}}` and optional global map for constants.
- **Expression Engine:** Math.js for parsing/evaluating expressions + unit arithmetic/conversion. Error handling surfaces syntax/undefined-variable issues.
- **Markdown Processing:** `registerMarkdownCodeBlockProcessor("calc")` for fenced blocks; optional post-processor for inline syntax.
- **Rendering:** Separate compute vs presentation; format numbers/units with configurable precision. Use MathJax/HTML for equations.
- **Commands:** Recalculate note, Insert conversion, New experiment note, Toggle auto-calc, Open Variables panel.
- **Settings:** JSON-backed settings (autoCalc, unit system, sig figs, lab folder, global vars).
- **Integrations:** Play nicely with Circuit Sketcher, Excalidraw, Model Viewer, Dataview/Templater (optional). Provide hooks but avoid hard deps.
- **Perf Considerations:** Re-eval block top-to-bottom; throttle on-change; future enhancement—dependency graph for selective recompute.

## Key Integration Points
- **Math.js:** Unit arithmetic, conversions, expression parsing.
- **Obsidian API:** Codeblock/post-processors, views, commands, settings, vault creation.
- **Community Plugins (optional):** Circuit/diagram editors, 3D model viewer, Dataview/Templater helpers.
- **Stretch:** Export to Python/Jupyter, CodeMirror autocompletion for units/vars.

## Example Snippets
See the provided scaffold for:
- `calc` block processor with assignments/expressions/conversions
- Unit formatting helper
- New Experiment Note command
- Variables sidebar view

## Conclusion
The Engineering Toolkit unifies unit-aware calculations, conversions, diagrams, and lab journaling inside Obsidian—bringing an engineering worksheet experience to Markdown while leveraging the Obsidian ecosystem.
