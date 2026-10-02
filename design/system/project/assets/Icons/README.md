# Icons

ELO RATED uses the lucide icon set everywhere, plus one custom construction: the Arena Swords drawn as two separate blade halves so the Arena tab can carry heat.

## The icon set

- Library: `lucide-react-native` on mobile (1.16.0 installed), `lucide-react` on web. No icon files are kept in the repo; icons are imported by name.
- Grid and stroke: 24 x 24 viewBox, `fill="none"`, stroke width 2, round line caps and round line joins. Do not change the stroke width or mix in filled icons.
- Size: tab bar icons are 18 px. Elsewhere follow the component's own size.
- Ink: icons take the text color of where they sit. In the tab bar the active tab is `ink` and inactive tabs are `ink-3` (`apps/mobile/components/layout/elo-tab-bar.tsx`). Icons are never decorative color.

## Inks in these files

An `<img>` cannot inherit `currentColor`, so these SVG files bake the stroke as `#E8EDF2` Terminal White, the dark theme `ink`. They are meant to be viewed on a dark ground (`void` `#0D0F14`, `panel` `#13151B` or `plate` `#1E222B`). In code the stroke is the current text color: `ink` `#E8EDF2` active or `ink-3` `#8D929D` inactive in the dark theme, and `ink` `#0D0F14` or `ink-3` `#575C68` in the light theme.

## Files

| File | What it is | Size |
|---|---|---|
| `arena-swords.svg` | The full lucide `Swords` glyph (v1.16.0): both blades together, exactly what the Arena tab shows at rest. | 24 x 24 viewBox, stroke 2 |
| `arena-swords-blade-a.svg` | Blade A: the sword from the top-left tip down to its hilt at the bottom right (polyline `14.5 17.5 3 6 3 3 6 3 17.5 14.5` plus three hilt lines). | 24 x 24 viewBox, stroke 2 |
| `arena-swords-blade-b.svg` | Blade B: the sword from the top-right tip down to its hilt at the bottom left (polyline `14.5 6.5 18 3 21 3 21 6 17.5 9.5` plus three hilt lines). | 24 x 24 viewBox, stroke 2 |

Canonical source: `SWORDS_BLADE_A` and `SWORDS_BLADE_B` in `apps/mobile/components/layout/arena-tab-icon.tsx` (jits_web commit 69e2e7f). The path data is copied verbatim from there; the two halves stacked are identical to lucide's own `Swords` node list (a test, `__tests__/components/layout/arena-tab-icon.test.tsx`, holds them to it).

## When to use

- Use `arena-swords.svg` wherever a static design shows the Arena tab or the Arena at rest.
- Use the two halves only when a design needs to show the blades moving apart: the blade clash (when the athlete goes live, and when the pending challenge count rises) spreads them a hair and snaps them back with a small `signal-red` spark at the crossing.
- The Arena heat lives on top of the glyph, not in these files: live embers (three 2 px dots, two `heat-orange` and one `signal-red`) and countable embers (one 2.5 px `heat-red` `#EC6A74` dot per pending challenge, 1 to 3, never below 0.35 opacity). See the Motion section for timings.
- For every other icon, use lucide by name; do not redraw or export variants.
