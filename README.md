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
- **Reset current note scope**
- **New Experiment Note** (creates a scaffolded lab note under configured folder)

## Settings
- Auto recalc (disable for manual mode; existing variables persist until you reset the scope)
- Default unit system (display preference)
- Significant figures
- Lab notes folder
- Global variables (experimental)

### Manual mode
When **Auto recalc** is turned off, the plugin leaves previously calculated variables in place so you can selectively re-run calculations without losing context.
Use the **Reset current note scope** command whenever you want to clear the stored variables for a note and start fresh.
