# design/system: repo mirror of the ELO RATED Design System

This folder is the repo copy of the live Design System artifact **"ELO RATED Design System"**:
https://claude.ai/artifact/NkvxzxKo3R7acP5j6aRTTe (mirrored at version `1790951317-29fa`, 2026-10-02).

`project/` is a byte-for-byte mirror of the artifact's `project/` tree: the brand book (`project/README.md`), the further sections (`Color.md`, `Typography.md`, `Layout.md`, `Motion.md`, `Accessibility.md`, `Components.md`, `Conformance.md`, `Legacy.md`), `tokens.json`, the nine font files, the 20 component cards plus the cover (`components/<Name>/README.md` and `preview.html`), the asset files (`assets/Logos`, `assets/Icons`; the artifact stores the images as uploads, recorded by id in `design-system.json`) and the index `design-system.json`. The root `DESIGN.md` carries the same brand book and sections as one document.

## Who reads what

- **The artifact is the viewing surface.** People browse it; Claude Design and agents read it with the Artifact tool, starting with `project/README.md` and using the files as it says. It also generates `project/tokens.css` (CSS custom properties named after the tokens, for example `var(--signal-red)`, `var(--radius-plate)`) and the `api/` cards; those generated files are not mirrored here.
- **This folder is the source you edit** and review in pull requests.

## Values come from code

Every value is traceable to jits_web code at the commit recorded in `project/tokens.json` `meta.ref`. Colors come from `apps/mobile/lib/tokens.ts` (the source of truth; web `apps/web/app/design-system/tokens.css` mirrors it), the match-flow and on-media palettes from `apps/mobile/lib/theme/palette.ts`, motion from `apps/mobile/lib/motion/tokens.ts`. **Code wins:** when this kit and the code disagree, the code is right and the kit is updated. Lengths are device px at NativeWind rem = 14px.

## How to update

1. Change the code first if a value changes, then edit the matching files here (tokens.json, the section, the affected card). Keep a usage note on every token, keep text contrast at 4.5:1 in both themes, and use no em dashes.
2. Republish only the changed files to the SAME artifact with the Artifact tool: `url` = https://claude.ai/artifact/NkvxzxKo3R7acP5j6aRTTe, `root` = `design/system`, `files` = the changed `project/...` paths. Read each file you will replace from the artifact first (teammates may have edited it in the page) and merge. New images go up as asset uploads first; `project/design-system.json` (the index) is written last, re-read right before, keeping every key you are not changing, per the Design System type's rules.
3. Never rebuild the system or publish without `url`: that makes a new, disconnected artifact.
4. Update the root `DESIGN.md` in the same change so it still matches `project/README.md` and the sections.
