# Conformance

How far the shipped mobile app is from this system, and the plan to close the gap. Source: a read-only audit of `apps/mobile` at jits_web 69e2e7f (481 non-test files) against the brand, motion, typography and accessibility rules. **63 distinct findings: 8 high, 25 medium, 30 low.** Each work package is a bead under the kit epic jits-3eeg and changes pixels on the "Current app" boards of the ELO RATED Native Screens canvas, so each ends with a `/canvas-sync` pass after release.

## What already conforms

- The haptics vocabulary is clean: the only direct `expo-haptics` calls are the sanctioned four (the offline-queue Light impact and the three splash lock beats).
- No `LayoutAnimation`; every Reanimated animation maps to a registry row and reads `useReduceMotion`; ambient loops pause in the background.
- No drop shadows or elevation in product UI (the toast zeroes them; the splash halo is the one sanctioned exception).
- `setInterval` is used for data polling and countdown text only, never for animation.

## Findings by category

| Category | High | Medium | Low |
|---|---|---|---|
| Hardcoded colors and literals | 0 | 1 | 9 |
| Color semantics (red, green, amber, heat) | 2 | 6 | 3 |
| Typography | 2 | 5 | 5 |
| Radius, shadow, spacing | 1 | 1 | 3 |
| Motion Rule | 0 | 5 | 4 |
| Press feedback and disabled states | 2 | 3 | 1 |
| Accessibility | 1 | 1 | 3 |
| Legacy shadcn, dead code, stale docs | 0 | 3 | 2 |
| **Total** | **8** | **25** | **30** |

## Top fixes

1. Every gorhom bottom sheet renders a 15px corner radius; the ceiling is `radius-sheet` 8px (high).
2. Signal Red on data: submission and weekly-activity bars and the #1 rank numeral are drawn in `signal-red` (high).
3. Gain Green used as generic success: ready, confirmed, upload done, recording, FINISH tag, a switch track, about 12 sites (high).
4. The primary CTA family has no press scale: `CtaButton` (30 sites), `ViewerButton` (12), `PracticeButton` (10) and 8 hand-rolled red CTAs (high).
5. Legacy `Dialog` and `Sheet` titles render in the system font on user-facing surfaces (Compare Stats, Share Profile) (high).
6. The legacy `Button` sets system-font text on legacy tokens, on the user-facing update banner (high).
7. The error boundary's "Try again" and "Sign out" have no `accessibilityRole` (high).
8. The live match's hold-to-end fill and time-up drain bar animate `width` on the JS thread (medium).
9. The offline banner is a full-width Signal Red bar in a system font (offline is not a loss) (medium).
10. Hero ELO numbers and records are missing `tabular-nums` (medium).
11. Modal and sheet transitions are unregistered and not gated on Reduce Motion (medium).
12. Decorative Signal Red: 17 red spinner and refresh tints, the Switch track, red selection fills, red notification icons (medium).
13. The splash odometer is a `requestAnimationFrame` + `setState` loop and the splash glow loops forever (medium).
14. Amber has no token: three hex copies plus Tailwind amber classes (medium).
15. Text inputs and switches with no accessible name (medium).

## Work packages

| Bead | Package | Covers | What changes |
|---|---|---|---|
| jits-3eeg.2 | WP1 Sheet and modal chrome | SH-1 to SH-5, MO-5, A1-1 backdrops | One shared sheet background and handle with `radius-sheet` top corners; brand type in sheet and dialog titles; one `on-media-scrim` backdrop; a "Sheet / modal present" registry row and a Reduce-Motion-aware modal animation helper |
| jits-3eeg.3 | WP2 Color semantics sweep | CO-1, CO-2, CO-6, CO-7, ST-1 to ST-3, ST-6, MF-5, MF-8, PR-1, PR-2, PR-6, RK-1, SC-6, FR-1, FR-2 | Red only on CTAs and negatives, green only on gains, wins and live; neutral spinners; one selected state (`plate-bright` + `hairline-strong` + check); neutral Switch track; a grep guard test |
| jits-3eeg.4 | WP3 One Button, one press feedback | BT-1 to BT-7, SC-3 | A unified `Button` on `PressableScale` (primary, secondary, ghost, destructive, glass), one disabled style (`opacity-disabled`); auth, practice and viewer buttons migrated; `StatePressable` on 25 rows and toggles without feedback |
| jits-3eeg.5 | WP4 Retire the legacy shadcn layer | LG-1 to LG-3, SC-1, SC-2, ST-8, TY-5, MF-9 | Delete unused primitives; restyle Badge, the offline banner, the update banner and modal; remove the legacy token keys, `brandOrange` included (Arena heat reads `heatOrange` since WP7) |
| jits-3eeg.6 | WP5 Type scale and numeric typography | TY-1 to TY-4, TY-6, PR-3, PR-4, MF-3, MF-6, MF-7, FR-7, ST-4, ST-5, AR-1, AR-6, A1-3 | Named size and tracking steps (the Typography styles), a scale-driven mono label, `tabular-nums` on every number, tracking on every caps label, the 10px floor |
| jits-3eeg.7 | WP6 Motion Rule hygiene | MF-2, SP-1 to SP-4, MO-4, MO-6, MF-11, FR-3, FR-4 | Hold-to-end and time-up on Reanimated `scaleX`; the splash odometer via `RollingNumber`; the splash glow plays once; `useReduceMotion()` everywhere; literal durations named; shimmer restored in Film Room and the highlight viewer |
| jits-3eeg.8 | WP7 Tokens, on-media, labels, doc truth | CO-3, CO-4, CO-5, AR-4, SP-5, SC-4, SC-5, FR-6, MF-10, A1-2, A1-4, D-1 to D-7 | An amber `attention` token in `tokens.ts`; the heat sub-palette; one on-media source behind `ON_MEDIA` and `BROADCAST`; labels on 7 inputs and switches; the docs brought in line with this kit |

Order: WP3 lands before WP4, because WP4 deletes what WP3 replaces. The open decisions in the README (amber scope, Bebas numerals, the selected state, circular elements) settle before WP2 and WP5 finalize.

## Finding IDs

Finding IDs (SH, BT, HO, AR, RK, PR, MF, FR, ST, SC, SP, LG, CO, TY, MO, RA, A1, D) are stable and quoted in the beads and in this kit's other sections. The full per-file list lives with the kit's recon (R3).
