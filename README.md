# Engineering Toolkit (Obsidian)

Inline engineering calculations with units, variable tracking, unit conversions, and lab journal helpers.

## Install (dev)
1. `npm i`
2. `npm run dev` (or `npm run build`)
3. Copy `main.js`, `manifest.json`, `styles.css` (and `versions.json`) into your vault’s `.obsidian/plugins/engineering-toolkit/` folder (create it).
4. Enable the plugin in Obsidian → Settings → Community Plugins.

## Syntax

Fenced code block:
```calc
# Assign variables (units supported)
mass = 5 kg
accel = 9.81 m/s^2

# Use variables
force = mass * accel

# Convert
force -> lbf
72 km/h to m/s
```

Open the **Variables Panel** via Command Palette to view current note's variables.

## Commands
- **Open Variables Panel**
- **Recalculate current note**
- **New Experiment Note** (creates a scaffolded lab note under configured folder)
- **Insert engineering diagram** (choose a diagram plugin integration and insert an embed)
- **Insert Excalidraw sketch / Diagrams.net drawing / Circuit sketch** (quick commands for specific diagram types)

### Diagram integrations

The diagram helpers rely on the companion community plugins being installed and enabled:

- **Excalidraw** via `obsidian-excalidraw-plugin`
- **Diagrams.net (Draw.io)** via `drawio-obsidian`
- **Circuit Sketcher** via `obsidian-circuit-sketcher`

When you run the command, the plugin will prompt for:

1. **Diagram type** (if not using a specific quick command)
2. **File name**
3. **Target folder** (defaults per integration; folders are created automatically if needed)
4. **Template path** (optional; if omitted, a minimal placeholder file is created)

If the related plugin is not available, the command exits with a notice so you can install/enable it before retrying.

## Settings
- Auto recalc
- Default unit system (display preference)
- Significant figures
- Lab notes folder
- Global variables (experimental)
