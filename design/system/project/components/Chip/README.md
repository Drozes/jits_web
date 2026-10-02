# Chip

Chip is the tappable filter and segment pill: a plate-tier box with a strong hairline and a 10px DM Sans caps label; in the target kit the selected chip steps up one surface tier (`plate-bright`) with an `ink` label, and no longer uses red.

**Status: Target (WP2) shown first, today below.** Today the active chip swaps to a Signal Red border and draws a 6px red square before its label. Conformance finding ST-2 lists this as decorative red (red is for CTAs and negatives only), and decision D-7 asks for one selected-state treatment. The kit decides by default: selected = surface tier plus hairline (`plate-bright` fill, `hairline-strong` border, `ink` label), never red. The owner confirms this under Open decisions; WP2 (bead jits-3eeg.3) ships it.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `active` | boolean | `accessibilityState.selected`. |
| `children` | text | Uppercase. |
| `PressableProps` | | `accessibilityRole="button"`; `hitSlop` 10 top and bottom, 4 left and right. |

| State | Fill | Border | Label |
|---|---|---|---|
| inactive | `plate` | `hairline-strong` | `ink-2` |
| selected (target) | `plate-bright` | `hairline-strong` | `ink` |
| selected (today) | `plate` | `signal-red` | `ink`, plus a 6px `signal-red` square 7px before it |
| pressed | unchanged | unchanged | 0.7 opacity (`active:opacity-70`) |

Padding 10.5px x 7px (`px-3 py-2`). Rows of chips sit 8px apart (`GenderFilterRow`, the Fighters/Gyms switch on Rankings). Chip plus a chip row is the kit's segmented control; the shadcn `Tabs` is unused.

## Tokens used

`plate`, `plate-bright` (selected fill), `hairline-strong`, `ink`, `ink-2`, `radius-tag` 2px, `opacity-pressed` 0.7; today also `signal-red`. Type `heading` 700 10px, tracking 1.12px.

## Motion

None today: a raw `Pressable` with an opacity dip, no press scale. WP3 moves rows and chips like this onto `StatePressable` with a pressed surface tier (BT-6 family).

## Source

`apps/mobile/components/ui/elo-system/chip.tsx`. 10 JSX uses in 8 files (Rankings `app/(app)/(tabs)/leaderboard/index.tsx`, `components/leaderboard/gender-filter-row.tsx`, Profile stats, Film Room filters, recent activity, feedback, submission breakdown).

## Web twin and parity

`apps/web/components/ui/elo-system/chip.tsx`; it carries the same red active treatment and moves with WP2.

## Do and don't

- Do use chips for filters and two-to-four-way switches.
- Do show selection with the surface tier and the `ink` label.
- Don't use red for selection (border, fill or dot).
- Don't use a chip for a primary action.
