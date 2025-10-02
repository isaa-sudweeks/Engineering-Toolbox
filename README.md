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

## Unit system samples

The examples below can be pasted into a `calc` block to verify the default unit display.

### SI preference

Set **Default unit system** to **SI** and evaluate:

```calc
mass = 2 lb
mass

force = 10 lbf
force

flow = 15 gal/min
flow
```

Expected outputs (rounded to 4 sig figs) are:

- `mass = 0.9072 kg`
- `force = 44.4822 N`
- `flow = 0.0009 m^3/s`

### US preference

Set **Default unit system** to **US** and evaluate:

```calc
mass = 5 kg
mass

force = 100 N
force

flow = 0.001 m^3/s
flow
```

Expected outputs (rounded to 4 sig figs) are:

- `mass = 11.0231 lb`
- `force = 22.4809 lbf`
- `flow = 2.1189 ft^3/min`

## Commands
- **Open Variables Panel**
- **Recalculate current note**
- **New Experiment Note** (creates a scaffolded lab note under configured folder)

## Settings
- Auto recalc
- Default unit system (display preference)
- Significant figures
- Lab notes folder
- Global variables (experimental)
