# DeltaChip

DeltaChip is the ELO change shown after a rating lands: a JetBrains Mono Bold tabular "▲ +14" or "▼ −9" in the outcome color that pops in once the roll finishes.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `delta` | number | Formatted by `formatDeltaChip`: "▲ +14", "▼ −9" (U+2212 minus), "0". Sign and arrow, never color alone. |
| `color` | color | `gain-green` up, `negative` down, `attention` on a draw. |
| `shown` | boolean | Pop in when this flips true (the roll landed). |
| `animate` | boolean | This mount plays the pop; false shows it in place. |
| `style` | text style | The verdict passes `fontSize` 26. |

States: hidden (before the roll lands, when animating), popped, static. `spokenDelta` gives VoiceOver "up 14", "down 9", "no change".

Overlap: `DeltaNumber` (elo-system, "▲ 14" at 12/16/28px) and fight-ui `formatSignedDelta` are two more delta formatters. The kit's one delta spec is this format: arrow, sign, U+2212 minus, mono tabular.

## Tokens used

`gain-green`, `negative`, `attention`; type `mono` 700, tabular-nums. The hidden-state outline in the preview is a diagram (`hairline-strong`), not part of the component.

## Motion

Registry row **ELO delta chip** (Moment): after the roll lands it pops in from scale 0.6 (`DELTA_CHIP_FROM_SCALE`) on `spring.press` (damping 18, stiffness 300) with a `duration.instant` (100ms) fade. No haptic of its own (the landing's `ratingGain` belongs to the roll). Reduce Motion, or a moment already played: shown in place. The preview shows the settled frame.

## Source

`apps/mobile/components/ui/elo-system/delta-chip.tsx` (`DeltaChip`, `formatDeltaChip`, `spokenDelta`). Used by the verdict `RatingMoment`. Related: `delta-number.tsx`, `components/match-flow/fight/fight-ui.tsx` (`formatSignedDelta`, `deltaColor`, `StakesStrip` at 16px).

## Web twin and parity

None: mobile only. Web shows deltas with `DeltaNumber`.

## Do and don't

- Do always show the arrow and the sign with the color.
- Do use amber (`attention`) for a draw's change, green or the negative red otherwise.
- Don't show a chip for a zero change.
- Don't use the CTA red (`signal-red`) for a loss; `negative` is the text-tuned red.
