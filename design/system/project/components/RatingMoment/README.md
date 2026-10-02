# RatingMoment

RatingMoment is the verdict's rating card played as one Moment: on a submission win three Signal Red tap marks fill, the rating rolls like an odometer, and the delta chip pops in when it lands; everyone else sees the settled card.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `play` | boolean | Decided once by the verdict (`usePlayOnce("verdict:<matchId>")` plus a recency guard); fixed at mount. |
| `outcome` | `win`, `loss`, `draw`, null | Chooses the delta color and who gets the tap. |
| `disputed` | boolean | A disputed result never plays and hides the "before". |
| `submission` | boolean | A submission result shows the tap marks (points or decision results skip them). |
| `before`, `after`, `delta` | numbers | "1512 → 1526" and "▲ +14". |

Card (`RatingBlock`): 64px tall, 16px side padding, `plate`, `hairline` border, 4px corners. Left: "RATING" mono 500 10px tracking 2.52px `ink-3`, 6px above the rating in mono 700 22/26 `ink`, tabular. Tap marks: three 3x14 bars, 1px corners, 3px apart, 10px after the number, `signal-red` when filled (a `track` fill underneath before they fill). Right: the DeltaChip at 26px in `gain-green`, `negative`, or `attention` on a draw.

States: submission win playing (marks fill, roll, chip pops), landed (settled), submission loss (marks filled and still), points result (no marks), draw (amber delta), disputed (no before, no play). VoiceOver reads only "Rating 1526, up 14". Ratings in the preview are sample data.

## Tokens used

`plate`, `hairline`, `ink`, `ink-3`, `signal-red` (tap marks), `gain-green`, `negative`, `attention` (delta), `radius-plate`; type `mono` 500/700, tabular-nums.

## Motion

Three registry rows in sequence, once per result:
1. **The tap** (Moment): on a submission win, three marks fill 180ms apart (`TAP_STAGGER_MS`, 80ms each) while the card nudges 2px down and back three times; `tapTick` x3, winner only. Reduce Motion: marks shown filled, haptics kept. The loser sees them filled, still and silent.
2. **Odometer ELO roll** (Moment): `RollingNumber`, 600ms `easing.brandOut`, starting after `TAP_LEAD_MS` 540 on a submission win.
3. **ELO delta chip** (Moment): pops from 0.6 on `spring.press` with a 100ms fade when the roll lands; `ratingGain` fires on a win with a gain.

Nothing buzzes on a loss or a draw. A remount, navigating back or an old result shows the landed card silently. The preview shows the landed frames.

## Source

`apps/mobile/components/match-flow/verdict/rating-moment.tsx` (`RatingMoment`, `TapMarks`, `TAP_COUNT`, `TAP_STAGGER_MS`, `TAP_LEAD_MS`), `apps/mobile/components/match-flow/fight/fight-ui.tsx` (`RatingBlock`, `Mono`, `deltaColor`), `apps/mobile/components/ui/elo-system/rolling-number.tsx`, `delta-chip.tsx`, `apps/mobile/components/match-flow/verdict/verdict-step.tsx`.

## Web twin and parity

None: the verdict is mobile only.

## Do and don't

- Do play it once per result and show the landed card everywhere else.
- Do keep the tap marks for submission results only.
- Don't buzz the loser or on a draw.
- Don't color the rating number; color lives in the delta.
