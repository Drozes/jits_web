# Accessibility

Contrast, motion sensitivity, labels and text size. The floors: text 4.5:1 on its ground (3:1 at 24px and up, or bold 19px and up); any border, rule, icon or mark that carries meaning 3:1. Ratios below are WCAG 2 contrast computed from the exact token values in both themes; alpha colors are composited over the ground they sit on. Failing source pairs stay exact and are flagged, never re-tinted.

## Text on surfaces

Every text token passes 4.5:1 on every surface in both themes. `plate-bright` is the worst case in both, by design: it sets the floor the code's comments quote (for example `ink-3` 4.60:1 dark, 4.64:1 light).

### Dark theme, text (floor 4.5:1)

| Text token | on `void` | on `panel` | on `plate` | on `plate-bright` |
|---|---|---|---|---|
| `ink` | 16.27 | 15.49 | 13.52 | 12.18 |
| `ink-2` | 7.55 | 7.19 | 6.27 | 5.65 |
| `ink-3` | 6.14 | 5.85 | 5.10 | 4.60 |
| `signal-red-text` | 6.28 | 5.98 | 5.22 | 4.70 |
| `negative` | 6.28 | 5.98 | 5.22 | 4.70 |
| `neutral` | 6.14 | 5.85 | 5.10 | 4.60 |
| `gain-green` | 8.41 | 8.01 | 6.99 | 6.30 |
| `attention` | 8.93 | 8.50 | 7.41 | 6.68 |

### Light theme, text (floor 4.5:1)

| Text token | on `void` | on `panel` | on `plate` | on `plate-bright` |
|---|---|---|---|---|
| `ink` | 18.32 | 16.04 | 14.75 | 13.27 |
| `ink-2` | 7.22 | 6.32 | 5.82 | 5.23 |
| `ink-3` | 6.40 | 5.60 | 5.15 | 4.64 |
| `signal-red-text` | 6.37 | 5.58 | 5.13 | 4.62 |
| `negative` | 6.37 | 5.58 | 5.13 | 4.62 |
| `neutral` | 6.40 | 5.60 | 5.15 | 4.64 |
| `gain-green` | 6.41 | 5.61 | 5.16 | 4.64 |
| `attention` | 6.78 | 5.93 | 5.46 | 4.91 |

### Labels on the red fill

| Pair | Ratio | Status |
|---|---|---|
| `on-signal` on `signal-red` | 4.60 | Pass (both themes; the same values) |
| `on-signal` on `signal-red-lift` | 5.67 | Pass |
| `ink` (dark, `#E8EDF2`) on `signal-red` | 3.54 | FAIL: the pre-repair pairing. Never put white on the red. The legacy shadcn `Button` default variant did, until WP4 deleted it |

## Fills, rules and marks

### Dark theme, fills, rules and marks (floor 3:1)

| Mark token | on `void` | on `panel` | on `plate` | on `plate-bright` |
|---|---|---|---|---|
| `signal-red` | 4.60 | 4.38 | 3.82 | 3.44 |
| `signal-red-lift` | 5.67 | 5.40 | 4.71 | 4.25 |
| `heat-orange` | 6.89 | 6.56 | 5.72 | 5.16 |
| `heat-red` | 6.28 | 5.98 | 5.22 | 4.70 |
| `hairline-strong` | 2.24 FAIL | 2.21 FAIL | 2.08 FAIL | 1.97 FAIL |
| `hairline` | 1.72 FAIL | 1.73 FAIL | 1.68 FAIL | 1.63 FAIL |
| `attention-rule` | 4.83 | 4.71 | 4.31 | 4.01 |

### Light theme, fills, rules and marks (floor 3:1)

| Mark token | on `void` | on `panel` | on `plate` | on `plate-bright` |
|---|---|---|---|---|
| `signal-red` | 3.98 | 3.49 | 3.21 | 2.89 FAIL |
| `signal-red-lift` | 3.23 | 2.83 FAIL | 2.60 FAIL | 2.34 FAIL |
| `heat-orange` | 2.66 FAIL | 2.33 FAIL | 2.14 FAIL | 1.93 FAIL |
| `heat-red` | 2.92 FAIL | 2.55 FAIL | 2.35 FAIL | 2.11 FAIL |
| `hairline-strong` | 2.22 FAIL | 2.19 FAIL | 2.16 FAIL | 2.13 FAIL |
| `hairline` | 1.63 FAIL | 1.62 FAIL | 1.61 FAIL | 1.60 FAIL |
| `attention-rule` | 2.87 FAIL | 2.71 FAIL | 2.62 FAIL | 2.50 FAIL |

### Flagged source pairs (kept exact)

1. **`signal-red` on light `plate-bright`: 2.89:1.** A red rule or fill on a pressed or selected light surface drops below 3:1. Light `void`, `panel` and `plate` pass (3.21 to 3.98:1).
2. **`signal-red-lift` on light `panel`, `plate`, `plate-bright`: 2.34 to 2.83:1.** The pressed CTA fill against light surfaces, a documented exception in web `tokens.css:284-290`; the label on it still reads 5.67:1.
3. **`heat-orange` and `heat-red` on every light surface: 1.93 to 2.92:1.** Both are fixed across themes. The countable embers carry a count (meaning), so in light mode they rely on VoiceOver's count and the opacity floor; WP7's heat sub-palette is the place to give light mode its own heat values.
4. **`attention-rule` on every light surface: 2.50 to 2.87:1.** The pending StatusPlate's dashed amber edge; the status also carries a word ("pending" state copy), so it is not color-only.
5. **`hairline` and `hairline-strong`: below 3:1 everywhere (1.60 to 2.24:1).** Fine for decorative separation. Not fine as the only signal of a state: a selected option must also step to `plate-bright` and show an `ink` check glyph, and an input's edge is not its only affordance.
6. **Gain and loss are told apart by hue alone at the color level.** `gain-green` against `negative` is 1.34:1 (dark) and 1.01:1 (light). The system already compensates: deltas carry an arrow and a sign ("▲ +14", U+2212 minus), outcome tags carry W / L / D letters, and LIVE carries the word. Keep it that way: never show a gain or loss by color alone.

## On media

On-media chrome sits over camera, video or photos, so its ground is unknown. Worst cases, composited over a white frame (and a black frame):

| Text | on `on-media-badge` (0.88 black) | on `on-media-scrim` (0.55 black) | on `on-media-tag` (0.45 black) |
|---|---|---|---|
| `on-media-text` | 14.06 (17.83) | 4.04 FAIL (17.83) | 2.85 FAIL (17.83) |
| `on-media-text2` | 7.87 (9.06) | 2.91 FAIL (9.06) | 2.20 FAIL (9.06) |
| `on-media-text3` | 5.17 (5.46) | 2.34 FAIL (5.46) | 1.86 FAIL (5.46) |
| `on-media-tag-text` | 12.23 (14.84) | 3.95 FAIL (14.84) | 2.88 FAIL (14.84) |
| `on-media-red` | 4.90 (6.22) | 1.41 FAIL (6.22) | 1.01 FAIL (6.22) |
| `on-media-win` | 7.27 (9.22) | 2.09 FAIL (9.22) | 1.47 FAIL (9.22) |
| `on-media-amber` | 7.71 (9.78) | 2.22 FAIL (9.78) | 1.56 FAIL (9.78) |

| Text on the light chip | over a white frame | over a black frame |
|---|---|---|
| `on-media-ink` on `on-media-chip` | 16.16 | 14.71 |
| `on-media-ink3` on `on-media-chip` | 5.64 | 5.14 |
| `on-media-ink-red` on `on-media-chip` | 5.62 | 5.12 |

Rule (the on-media contrast rule, WP7): on-media text sits only on `on-media-badge` or, for the dark inks, the light `on-media-chip`. The scrim, tag and glass fills are grounds for marks and controls; text on them is safe only over dark footage. `on-media-text3` belongs on the badge only (R3 CO-5, A1-4). `__tests__/lib/on-media-tokens.test.ts` recomputes the badge and chip columns above from the tokens and fails if one drops below 4.5:1. Text on a tag fill still ships on the HUD tag, the film tags and the opening-still tag (`hud-tag.tsx`, `match-hero.tsx`, `verdict-hero.tsx`, `poster-card.tsx`, `moment-stepper.tsx`, `angle-switcher.tsx`, `countdown.tsx`); those move to the badge fill in a follow-up (they change pixels on the live and Film Room boards). The camera card's REC tag already sits on the badge.

## Reduce Motion

- Read the OS setting with `useReduceMotion()` from `@/lib/motion` (`lib/motion/use-reduce-motion.ts`); it is correct on the first frame. The launch splash reads it the same way (WP6); `lib/match-flow/use-reduce-motion.ts` is only a re-export for old imports.
- Every animation has a still end state that keeps the meaning: the final number, the cooled afterglow edge, one static ember, the filled ON AIR tally, plain skeleton bars (full table in Motion).
- PressableScale dips to `opacity-reduced-press` (0.85) instead of scaling.
- Haptics stay on under Reduce Motion. Never a haptic on a loss, a draw, or ambient motion.
- Modals and sheets appear and leave in place: RN `Modal` takes `animationType` from `useModalAnimation()` (`"none"` under Reduce Motion) and gorhom sheets take `animationConfigs` from `useSheetChrome()` (`ReduceMotion.Always`). See "Sheet / modal present" in Motion.

## Labels and roles

- Every pressable that acts has `accessibilityRole="button"` and a label. Missing today: the error boundary's "Try again" and "Sign out" (`components/error-boundary.tsx:88,98`, R3 A1-1).
- A `Pressable` with a single `Text` child takes its name from the text; icon-only controls need an explicit label ("Go back" on the AppHeader back button).
- Text inputs and switches need `accessibilityLabel` set to the visible label; React Native does not link a sibling `Text`. The ui `Switch` requires a `label` prop (it becomes the accessible name), and `EloTextInput` takes its enclosing `EloField` label by default (WP7, R3 A1-2).
- Tabs expose `accessibilityState.selected` and an `accessibilityValue` for badges ("2 challenges", "3 NEW"; `elo-tab-bar.tsx:66-75`); the countable embers keep the count readable.
- Moments speak their result once: VoiceOver reads only the final ELO and delta after the odometer roll; the Accept sweep sets the value "Accepted" while the label stays.
- Busy buttons set `accessibilityState.busy` (FightButton); make it the canonical busy pattern.

## Text size and Dynamic Type

- 10px is the floor (`palette.ts:28`: `text3` is for "labels only, mono 10px and up"). Thirteen sites still render 8 or 9px (R3 A1-3, WP5); only the CountPill digit is sanctioned at 9px.
- Fixed-height chrome caps Dynamic Type: `maxFontSizeMultiplier={1.3}` on CountPill, OutlineAction (`MAX_SCALE`), the header status chip and the header rating (`HEADER_ELO_MAX_FONT_SCALE`); the BrandHeader wordmark is capped at 1. Everything else scales.
- The smallest tappable text is "Not now" (10px `ink-3` underlined mono, `practice-offer-card.tsx:50-57`); check it at large Dynamic Type sizes (R3 A1-5).

## Touch targets

44px minimum (`size-hit`). Compact controls reach it with `hitSlop` (OutlineAction: 28px tall plus 8px above and below), never with fake margins.
