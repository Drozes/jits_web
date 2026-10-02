# Chip

Chip is the tappable filter and segment pill: a plate-tier box with a strong hairline and a 10px DM Sans caps label; the selected chip steps up one surface tier (`plate-bright`) with an `ink` label, and never uses red.

**Status: Shipped (WP2, bead jits-3eeg.3).** The selected chip takes the one selected-state treatment, `selectionSurface(active)` from `components/ui/elo-system/selection.tsx`: a `plate-bright` fill, the `hairline-strong` border and an `ink` label. The pre-WP2 Signal Red border and 6px red square (conformance finding ST-2, decision D-7) are gone; `__tests__/components/ui/color-semantics-guard.test.ts` fails if a red selected state returns. On this compact control the label's step from `ink-2` to `ink` stands in for the check glyph that radios, checkboxes and list options carry (`SelectCheck`). The card shows the shipped chip first and the pre-WP2 chip below for reference.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `active` | boolean | `accessibilityState.selected`. |
| `children` | text | Uppercase. |
| `PressableProps` | | `accessibilityRole="button"`; `hitSlop` 10 top and bottom, 4 left and right. |

| State | Fill | Border | Label |
|---|---|---|---|
| inactive | `plate` | `hairline-strong` | `ink-2` |
| selected | `plate-bright` | `hairline-strong` | `ink` |
| selected (before WP2) | `plate` | `signal-red` | `ink`, plus a 6px `signal-red` square 7px before it |
| pressed | unchanged | unchanged | 0.7 opacity (`active:opacity-70`) |

Padding 10.5px x 7px (`px-3 py-2`). Rows of chips sit 8px apart (`GenderFilterRow`, the Fighters/Gyms switch on Rankings). Chip plus a chip row is the kit's segmented control; the shadcn `Tabs` is unused.

## Tokens used

`plate`, `plate-bright` (selected fill), `hairline-strong`, `ink`, `ink-2`, `radius-tag` 2px, `opacity-pressed` 0.7. No `signal-red` since WP2. Type `heading` 700 10px, tracking 1.12px.

## Motion

None today: a raw `Pressable` with an opacity dip, no press scale. WP3 moves rows and chips like this onto `StatePressable` with a pressed surface tier (BT-6 family).

## Source

`apps/mobile/components/ui/elo-system/chip.tsx`. 10 JSX uses in 8 files (Rankings `app/(app)/(tabs)/leaderboard/index.tsx`, `components/leaderboard/gender-filter-row.tsx`, Profile stats, Film Room filters, recent activity, feedback, submission breakdown).

## Web twin and parity

`apps/web/components/ui/elo-system/chip.tsx`; it still carries the pre-WP2 red active treatment (WP2 changed the mobile app only) and follows in a web parity pass.

## Do and don't

- Do use chips for filters and two-to-four-way switches.
- Do show selection with the surface tier and the `ink` label.
- Don't use red for selection (border, fill or dot).
- Don't use a chip for a primary action.
