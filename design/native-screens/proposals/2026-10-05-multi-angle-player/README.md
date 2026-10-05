# Proposed (multi-angle player v1): design notes, NOT PUBLISHED

Date: 2026-10-05. Code: branch `feat/multi-angle-player` (dev flag, off by default). Status: notes only. Nothing here has been drawn or published to the canvas (https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D). The "Current app" board `33-Video-Player.dc.html` must NOT change until this ships; when it does, `/canvas-sync` redraws it from the code. Device test plan: `docs/spikes/2026-10-multi-angle-player.md`.

## How the prototype differs from what is drawn today

Compared with "Current app" board 33 (Video player) and COPY-DECK v2.2:

1. **Angle control moves to the bottom thumb zone.** Board 33 has the segmented angle switcher under the top bar (`top: insets.top + 60`). The prototype puts it in the bottom cluster, between the transport and the moment chips, inside a new "angle bar". The segments themselves are the unchanged `AngleSwitcher` (44 px, mono caps, the Best angle tag from the Film status work lands as is).
2. **Angle-count chip.** A new chip at the left of the angle bar: `2 OF 3 ANGLES` (ready of expected), or `3 ANGLES` when all are ready. It opens the Angles sheet. Mono bold 10 caps, `ON_MEDIA.white` on `ON_MEDIA.tag`, `ON_MEDIA.strong` border, 2 px corners, 44 px tall.
3. **Persistent "Approx. sync" tag.** While a clock-only angle is on screen, a tag `APPROX. SYNC` sits beside the chip (mono 10 caps, `ON_MEDIA.text2` on `ON_MEDIA.badge`, `ON_MEDIA.strong` border). It replaces the five-second "Angles aren't synced; position is approximate" note for the multi-angle player. It is neutral, never amber: it is a property of the angle, not a state to act on.
4. **"Switching to {label}" note.** Only when a switch takes longer than 400 ms, the same tag style beside the chip.
5. **Angles sheet (new surface).** A bottom sheet titled `ANGLES` listing every expected angle in the deck's row order, including uploading, processing and failed ones, with the deck's own row strings from `angleStatus` (`Uploading 42%`, `Processing`, `Not used`, `Didn't upload`) and helpers, the role tag `Timekeeper`, `Best angle` and `Approx. sync` tags, and `Watching` on the angle on screen. Only ready rows are buttons; tapping one switches and closes the sheet. Footer helper: `Only angles that are ready can play.` Surface `ON_MEDIA.ground`, 8 px top corners, rows 56 px minimum on `ON_MEDIA.glass` (selected: `ON_MEDIA.glassStrong` with a `ON_MEDIA.strong` border, never red).
6. **Frame step.** While paused only, two 44 px buttons (chevron left and right) centred above the transport. Accessibility labels say where they land: `Back one frame, 01:14.23`.
7. **Horizontal swipe on the video** changes angle (left = next). Vertical drags are ignored (they stay free for a future swipe-down-to-close). The video surface is an `adjustable` accessibility element with the actions `Next angle` and `Previous angle`, so the gesture is never the only route.
8. **Switch transitions.** A hot, in-step angle cuts in on the next frame (opacity swap, no animation). A warm angle shows a held still of the outgoing frame until the new one lands. A clock-only switch dips to black for 80 ms each way; Reduce Motion makes it a cut. A light selection haptic on commit (`haptics.select`).
9. **Timeline is the Best angle's clock.** The seek bar, key moments, caption and clock stay put across a switch (board 33 shows the visible file's own clock, which jumped on a switch).
10. **Announcements.** On a landed switch only: `M. Park's angle.` or `J. Cruz's angle. Approximate sync.` (deck 10: state changes only).

## Copy deck amendments needed before the flag ships

- Contradiction rule 4 keeps the quick switch ready-only; add the Angles sheet to the surfaces that may list non-ready angles (rows only, never playback).
- New strings: `Approx. sync`, `{ready} OF {total} ANGLES` / `{total} ANGLES`, `Angles` (sheet title), `Only angles that are ready can play.`, `Watching`, `Switching to {label}`, `Next angle`, `Previous angle`, `Back one frame`, `Forward one frame`, `Match video. Swipe left or right to change angle.`, and the announcements in item 10. They live in `apps/mobile/lib/video/multi-angle/copy.ts` today; move them into `video-status-copy.ts` (the Film status work's single copy module) when both branches land.
- The `Best angle` string in the sheet duplicates COPY-DECK section 13 (`BEST_ANGLE` on `feat/video-status-ux`); dedupe on rebase.

## DESIGN.md Motion registry entries needed

- Angle dip (Moment): 80 ms opacity to black and back on a clock-only switch; still state under Reduce Motion is a cut.
- Held frame (Reactive): a still image over the video while a warm angle seeks; no animation.

## Boards to draw when the prototype passes its gate (proposed page)

| Board | Content |
|---|---|
| P-MA-01 Player, Best angle, playing | Angle bar in the thumb zone, `3 ANGLES` chip, Best angle tag on the selected segment. |
| P-MA-02 Player, paused with frame step | Frame step row, the clock with hundredths in the label callout. |
| P-MA-03 Player, clock-only angle | `APPROX. SYNC` tag, the timekeeper segment selected. |
| P-MA-04 Angles sheet | Four rows: Watching, Ready, Uploading 42%, Didn't upload; tags. |
| P-MA-05 Switch states | Swap (no transition), seek with held frame and "Switching to" after 400 ms, dip to black. |
