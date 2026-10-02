# LivePill

LivePill is the green LIVE status indicator: a pulsing 7px Gain Green dot and a JetBrains Mono Bold caps label; `LiveDot` is the dot on its own.

## Props, variants, states

`LivePill`

| Prop | Values | Notes |
|---|---|---|
| `label` | string, default "LIVE" | Real labels: Live, In lobby, Sent, Cancel. Mono 700 10px, tracking 2.52px (`tracking-caps-xl`). |
| `pace` | `arena` (default), `fixed` | `arena`: the shared Arena tempo clock; `fixed`: its own 1400ms cycle (the match LIVE, a sent challenge). |
| `onDark` | boolean | Fixed #22C55E dot and text (`on-media-win`) over video, whatever the theme; gap 6px instead of 7px. |

`LiveDot`: `pace`, `size` (default 7), `onDark`, `testID`. Decorative: hidden from assistive tech; the caller labels the state. The header status chip uses it at 6px; `HeaderLiveDot` (pushed screens) draws a 7px dot in a 16x28 box.

One state: live. Render it only while the thing is live.

## Tokens used

`gain-green` (dot and label), `on-media-win` (onDark), `size-live-dot` 7px; type `mono` 700. The preview's over-video sample sits on `on-media-ink` with an `on-media-tag` slab as a stand-in for the broadcast clock slab.

## Motion

Registry rows **LIVE pulse** and **LIVE pulse tempo** (Ambient). The dot dips in opacity and scale (`LIVE_DOT_MIN_OPACITY`, `LIVE_DOT_MIN_SCALE`) once per cycle. `pace="arena"` dots beat on the one shared tempo clock (`lib/arena/arena-tempo.ts`: `tempo.quiet` 3000ms, `normal` 1600ms, `busy` 800ms by lobby size), in phase with every other live dot and the ON AIR heartbeat; `pace="fixed"` uses `duration.pulse` 1400ms. Paused in the background (`useAppActive`). Reduce Motion: a static dot. No haptic. The preview shows the rest frame (full opacity, scale 1).

## Source

`apps/mobile/components/ui/elo-system/live-pill.tsx` (`LivePill`, `LiveDot`, `ON_DARK_GREEN`), `apps/mobile/components/layout/header-live-dot.tsx`, `apps/mobile/lib/arena/arena-tempo.ts`.

## Web twin and parity

`apps/web/components/ui/elo-system/live-pill.tsx` and `live-dot.tsx`. Parity gap: web has no `pace` or `onDark` and no shared tempo clock.

## Do and don't

- Do use green only for live state, gains and wins.
- Do keep every live dot on the shared clock unless the thing is not the lobby (then `pace="fixed"`).
- Don't show a LivePill for a state that is not live (pending, waiting, queued use neutral ink or `attention`).
- Don't add a haptic or sound to the pulse.
