# RollingNumber

RollingNumber is the odometer: a number that rolls once from `from` to `to`, moving only the digit columns that change, and then rests as plain mono text.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `from` | number or null | The value before the change; null or equal to `to` means no roll. |
| `to` | number | The final value. |
| `play` | boolean | This mount plays the roll (decide with `usePlayOnce(key)`). |
| `delayMs` | number | The verdict waits for the tap marks (`TAP_LEAD_MS` 540). |
| `onLanded` | function | Fired from the animation's completion (100ms timer fallback). The caller fires `ratingGain` here on a gain. |
| `style` | text style, `fontSize` and `lineHeight` required | The caller's type (mono 700, tabular-nums). |
| `fit`, `staticTextProps`, `accessibilityLabel` | | Fit to a compact tile; props for the landed Text; VoiceOver reads only the final value. |

Exports `ROLL_MS` 600, `ROLL_MAX_SPAN` 30 (a large change starts at most 30 from the end), `ROLL_MAX_FONT_SCALE` 2, `usePlayOnce`.

States: rolling, landed (a plain Text). Rolls integers 0 and up only; anything else is shown static. Handles a digit-count change (999 to 1003) by fading the new leading column in as it carries.

The card shows the settled frame at the two real sizes and a static diagram of the columns; the motion itself cannot be shown in a still preview.

## Tokens used

None of its own: the caller's text style (`ink`, type `mono` 700, tabular-nums). The diagram uses `ink`, `ink-3`, `hairline`.

## Motion

Registry row **Odometer ELO roll** (Moment): 600ms on `easing.brandOut` (between `duration.base` 480 and `duration.slow` 720; no dedicated token), on the UI thread. Plays once per result: the played key is persisted and a result counts as fresh only if this athlete just confirmed it or it completed within the last 5 minutes. Reduce Motion: the final value at once. Haptic: `ratingGain` on a gain only, fired by the caller.

## Source

`apps/mobile/components/ui/elo-system/rolling-number.tsx` (`odometerPosition`, `columnOpacity`, `rollStart`), `play-once.ts`. Used by `EloTile` (after tile) and the verdict `RatingMoment`.

## Web twin and parity

None: mobile only.

## Do and don't

- Do roll only on a real, confirmed rating change, keyed on the result id.
- Do give it the same mono tabular style as the number it replaces, so the landed frame does not jump.
- Don't replay it on remount, refetch or navigating back.
- Don't use it for counters, timers or non-rating numbers.
