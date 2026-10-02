# ChallengeStrip

ChallengeStrip is the Mat Board's one-line challenge row: a panel-tier strip with a 3px left rail (Signal Red when someone wants you, ink-3 otherwise), a mono caps line with the live countdown, an OutlineAction, and on incoming challenges a 2px afterglow edge that cools once.

## Props, variants, states

Built from `StripShell` (`rail`: `red` or `neutral`, `edge`, `testID`) and `StripLine`, in these strips:

| Strip | Rail | Line | Action |
|---|---|---|---|
| `IncomingStrip` | red | "ALEX WANTS TO ROLL · 8:41", plus " · +2" for more fresh challenges | OPEN ("Open challenge") |
| `WaitingStrip` | neutral | "WAITING · ALEX · 8:12" (read "Waiting for Alex") | CANCEL ("Cancel challenge"), disabled while cancelling |
| `OfferStrip`, `AwayStrip`, `ConfirmStrip`, invite `BookedStrip` | per state | | |

Shell: at least 48px tall, 10.5px gap, padding 5.25px top and bottom, 10.5px left, 7px right, 1px `hairline` border, 2px corners. Line: JetBrains Mono 700 11px caps `ink`, tabular, one line; the head truncates first. Text scales up to `MAX_SCALE` 1.3. The countdown ticks once a second while the tab is focused (`M:SS`).

States: incoming hot (first frame of a new challenge), incoming cooling, incoming cooled (settled), waiting, waiting with cancel disabled.

## Tokens used

`panel`, `hairline`, `signal-red` (rail; afterglow red), `ink-3` (neutral rail), `ink` (line), `hairline-strong` (action), `plate-bright` (cooled edge), `heat-orange` (afterglow core), `radius-tag`, `stroke-rail` 3px, `stroke-edge` 2px; type `mono` 700, `heading` 700.

## Motion

Registry row **Challenge afterglow** (Moment): the 2px bottom edge starts hot (`heat-orange` over `signal-red`) and cools to the `plate-bright` line over 2000ms (`AFTERGLOW_MS`), linear; the orange core fades in the first half, the red lingers (ease-out). Timed from the earlier of the challenge's `created_at` and the first draw in this app run, so a re-render, remount or old challenge shows it cooled; silent (the prompt sheet already fires `challengeArrived`). Reduce Motion: cooled at once. The OutlineAction has **Press scale**. The first preview row is the settled (cooled) frame; the hot frame is shown for reference.

## Source

`apps/mobile/components/arena/strip-primitives.tsx` (`StripShell`, `OutlineAction`, `MAX_SCALE`), `apps/mobile/components/arena/mat-board.tsx` (`StripLine`, `IncomingStrip`, `WaitingStrip`, `OfferStrip`), `apps/mobile/components/arena/afterglow-edge.tsx`.

## Web twin and parity

None.

## Do and don't

- Do use the red rail only for "someone wants you"; it is a rail, never a CTA.
- Do keep the line to one row; let the name truncate before the countdown.
- Don't replay the afterglow on remount; it is once per challenge id.
- Don't use heat colors outside the Arena.
