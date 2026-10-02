# OnAirStrip

OnAirStrip is the Arena body's live indicator: a green ON AIR tally beside a thin heartbeat trace, shown only while the athlete is live.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `isLive` | boolean | Renders nothing when false. |

Layout: a 24.5px row (`h-7`), 10.5px gap. Tally: 17.5px tall (`h-5`), 5.25px side padding, 1px `gain-green` border, 2px corners, an 18% `gain-green` fill, "ON AIR" in mono 700 10px caps, tracking 2.52px, `gain-green`. Trace: 14px tall, flexes to fill, one beat in a 100x16 box (`M0 8 H62 L65 8 L68 2 L72 14 L75 5 L77 8 H100`), 1.5px non-scaling `gain-green` stroke; a dim copy rests at 0.3 opacity and a bright copy lights on the beat.

States: hidden (offline), sweeping in (going live), live at rest between beats, on the beat. VoiceOver reads "On air". It never says "Go live" or "Go offline" (the match-loop harness taps those words elsewhere) and never sits in the header.

## Tokens used

`gain-green` (border, fill at 18%, text, trace), `radius-tag` 2px; type `mono` 700.

## Motion

Registry row **ON AIR strip** (Moment + Ambient). Moment: when live flips false to true the tally fill sweeps in from the left (`scaleX` 0 to 1, `duration.slow` 720ms, `easing.brandOut`); mounting while already live shows it filled and never replays. Ambient: the bright trace lights at the start of each cycle of the shared Arena tempo clock and fades out by 30% of the cycle (in phase with every live dot; quicker when the lobby is busier); paused in the background. Silent. Reduce Motion: the tally filled and the full trace static. The preview shows the rest frame and the Reduce Motion frame.

## Source

`apps/mobile/components/arena/on-air-strip.tsx` (`TRACE_PATH`, `BEAT_SHARE` 0.3, `TRACE_REST_OPACITY` 0.3), `apps/mobile/lib/arena/arena-tempo.ts`.

## Web twin and parity

None.

## Do and don't

- Do show it only on the Arena body while live.
- Do keep it green: it is live state.
- Don't put it in the header (the header right side is exactly the status chip then the bell).
- Don't add a haptic to the heartbeat.
