# E·R lettermark app icon

The mobile app icon and native splash mark: a bold **E·R** lettermark (white, with a
Signal Red square interpunct) on Void. Adopted 2026-06-08, replacing the "Podium Tiers"
ladder icon (`../batch3/svg/theme4-ascend-b.svg`).

## Design
- Letters: **DM Sans Bold** (the brand heading font), glyph outlines, Terminal White `#E8EDF2`.
- Interpunct: Signal Red `#E63946` square, centered between the letters.
- Background: Void `#0D0F14` (matches the native splash + JS splash so the launch sequence has no color seam).

## Source files
- `icon.svg` — full-bleed app icon (opaque Void). → `apps/mobile/assets/icon.png`
- `adaptive-foreground.svg` — Android adaptive foreground, transparent, mark pulled into the
  ~60% safe zone so circular masks don't clip it. → `apps/mobile/assets/adaptive-icon.png`
  (Android paints the bg from `android.adaptiveIcon.backgroundColor = #0D0F14`).
- `splash.svg` — native splash mark, transparent, modest centered. → `apps/mobile/assets/splash-icon.png`
- `gen.js` — parametric generator: extracts real glyph outlines via `opentype.js` and lays
  out the E·R mark with the red dot, auto-fitting cap-height/width to the 1024 canvas.
- `finalize.js` — writes the three SVGs above with the approved parameters.

The **SVGs are the durable source** — they re-render at any size with `rsvg-convert` and need
no fonts installed. `gen.js`/`finalize.js` are only needed to change the typeface or layout.

## Regenerate
```sh
# 1. (re)write the SVGs — needs opentype.js in scope
npm i opentype.js            # in a scratch dir, or temporarily at repo root
node design/icon-options/er-lettermark/finalize.js

# 2. render PNGs into the app (needs rsvg-convert: `brew install librsvg`)
cd design/icon-options/er-lettermark
rsvg-convert -w 1024 -h 1024 icon.svg               -o ../../../apps/mobile/assets/icon.png
rsvg-convert -w 1024 -h 1024 adaptive-foreground.svg -o ../../../apps/mobile/assets/adaptive-icon.png
rsvg-convert -w 1024 -h 1024 splash.svg              -o ../../../apps/mobile/assets/splash-icon.png
rsvg-convert -w 48   -h 48   icon.svg               -o ../../../apps/mobile/assets/favicon.png
```

`icon.png` must stay opaque (no alpha) for the App Store; `icon.svg` includes the Void
background rect, so its render is opaque automatically.

## Shipping
The icon is baked at native build time (not OTA-updatable). A new EAS build / TestFlight
submission is required for the icon to change on device.
