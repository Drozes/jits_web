# ELO RATED — App Icon Design Brief

App: **ELO RATED**, a Brazilian Jiu-Jitsu (BJJ) competitor matchmaking + ELO-rating app.
Voice: bold, geometric, high-contrast, confident, brutalist. "WE ARE / ELO RATED / ARE YOU?"

## Brand palette (use these exact hex values)
- **Signal Red** `#E63946` — the dominant, unmistakable brand accent (CTAs / intensity)
- **Brand Red (deep)** `#bf1212` — alt deeper red (current Android icon bg)
- **Void** `#0D0F14` — near-black primary background (95% of the app is dark)
- **Panel** `#13151B`, **Plate** `#1A1D24`, **Plate Bright** `#242832` — dark elevation steps
- **Terminal White** `#E8EDF2` — primary text / light marks
- **Pure White** `#FFFFFF` — wordmark highlight
- **Data Gray** `#6B7280`, **Gray Bright** `#9CA3AF` — metadata, secondary
- **Gain Green** `#22C55E` — wins / rating up (use sparingly)
- **Gold** `#f59e0b` — "peak / breakthrough" accent (the current logo's gold step). Optional.

## The current mark (context, not a constraint)
`public/logo.svg` is a bold letter **E** whose three bars ascend in length — it reads simultaneously as the letter E AND a rising ELO rating chart, with a **gold peak** step extending highest = "the breakthrough moment." You may evolve this idea or depart from it entirely.

## HARD RULES (brutalist brand — do not violate)
1. **No drop shadows. No `<filter>`. No blur.** Hierarchy via flat color only.
2. **No gradients.** Flat fills only. (One very subtle 2-tone is the absolute max, avoid if possible.)
3. **Sharp / geometric.** The icon canvas is a FULL-BLEED 1024×1024 square (iOS masks the corners itself — do NOT round the outer canvas). Inner shapes may use small radii but keep the brand crisp.
4. **One dominant idea.** Must read instantly at **48×48 px**. Few elements, heavy weight, high contrast. No fine detail, no thin lines.
5. **Android safe zone:** keep the critical mark within the central ~80% (inner ~820px circle of the 1024 canvas); outer ~100px may be cropped to a circle.

## SVG technical spec (MANDATORY — these render via rsvg-convert, NOT a browser)
- Standalone file: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">`
- **First element = a full-bleed background `<rect x="0" y="0" width="1024" height="1024">`** filled with a brand color (usually Void `#0D0F14` or a red).
- **DO NOT use `<text>` with brand fonts** (Bebas Neue / DM Sans etc. are NOT installed; they will silently fall back to an ugly default). **Build ALL letters/numbers as `<path>`, `<polygon>`, or `<rect>` geometry.** Bold, condensed, all-caps geometry reads as the brand.
- No external images, no `<image>`, no web fonts, no CSS `@import`.
- Flat `fill` attributes only. `stroke` is fine for crisp geometric lines (use heavy widths, 20px+).
- Must be valid, self-contained XML that renders correctly on its own.

## Deliverable
Exactly **3 distinct** icon concepts as 3 SVG files. Make the 3 genuinely different from each other within your assigned direction (not 3 tweaks of one idea). After writing each file, verify it is valid by reading it back.
