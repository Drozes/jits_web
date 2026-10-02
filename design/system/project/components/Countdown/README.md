# Countdown

Countdown is the face-off 3-2-1 before the match clock: a full-screen Bebas Neue numeral over the camera preview and a 55% black scrim, a Signal Red bar draining to GO, the recording chip, the synced-clock caption and the face-off chip, all in the fixed on-media colors.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `goAt` | epoch ms | GO on this device; both phones time from the server's `started_at` (`COUNTDOWN_MS` 3000). |
| `recording` | boolean | Chip "REC ARMS AT GO" (`on-media-cta` border, `on-media-red` ring and text) or "NOT RECORDING" (`on-media-strong` border, `on-media-text3` ring, `on-media-text2` text). |
| `me`, `opponent` | athletes | Face-off chip names (`shortName`: "M. Park"; one word stays as is) and "ELO · WEIGHT LBS". |
| `myWeight`, `opponentWeight` | lbs or null | Rated weights from the challenge. |

Numeral: Bebas Neue at `clamp(96, 0.55 x window height, 240)`, `on-media-white`. Bar: 3px, `on-media-track` under an `on-media-cta` fill, 48pt from each side, 132pt above the bottom inset. Caption: mono 500 10px tracking 2.52px `on-media-text2`. Face-off chip: 56pt, `on-media-chip` fill, `on-media-chip-border`, 3px corners, a 4px `on-media-cta` square before "you", names DM Sans 700 15px `on-media-ink`, meta mono 11px `on-media-ink3`, "VS" Bebas 22 `on-media-ink-red`. Landscape drops the caption and the chip.

States: 3, 2, 1 (each slams in), GO (`GoFlash`: "GRAPPLE" in Bebas 116, `on-media-red`, over the live screen). The preview shows numeral 2 landed with the bar a little over half full; the camera feed is represented by a flat `on-media-ink` field. Names, ratings and weights are sample data.

## Tokens used

`on-media-scrim`, `on-media-white`, `on-media-cta`, `on-media-red`, `on-media-strong`, `on-media-tag`, `on-media-text2`, `on-media-text3`, `on-media-track`, `on-media-chip`, `on-media-chip-border`, `on-media-ink`, `on-media-ink3`, `on-media-ink-red`, `radius-tag`, `radius-button`; type `display`, `heading` 700, `mono` 500/700. On-media colors are fixed in both themes.

## Motion

Registry row **Countdown slam** (Moment): each numeral drops in from 1.6x (`SLAM_FROM_SCALE`) and lands in about 140ms (`SLAM_MS`, ease-out back 1.7) with a 100ms fade; the bar drains linearly over the whole countdown to GO; `countdownTick` (Heavy) per numeral and `countdownGo` at GO (fired by `LiveStage`). GO slams in the same way then fades over 700ms. Reduce Motion: numerals crossfade over `duration.fast` 240ms, the bar still drains (it is a timer), haptics kept.

## Source

`apps/mobile/components/match-flow/countdown/countdown.tsx` (`Countdown`, `GoFlash`, `numeralSize`), `countdown/live-stage.tsx`, `apps/mobile/components/match-flow/faceoff/faceoff-top.tsx` (`FaceoffChip`), `apps/mobile/lib/theme/palette.ts` (`ON_MEDIA`).

## Web twin and parity

None: the countdown is mobile only.

## Do and don't

- Do use the on-media tokens for every color over camera or video, whatever the app theme.
- Do keep weights in lbs.
- Don't change the countdown length; the match start is the server's.
- Don't drop the drain bar under Reduce Motion.
