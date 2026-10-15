# Arena ranges (mobile): challenge Online & Close, server-driven bands

Status: build-ready, owner-approved scope (2026-10-15). Author: PM agent, 2026-10-15.

**The source of truth for both halves of this change is the jr_be spec:** `jr_be/specs/023-arena-ranges/spec.md` (on disk: `/Users/msponagle/code/EloRated/jr_be/specs/023-arena-ranges/spec.md`). Read it in full before building; this file only points to it and repeats the client acceptance criteria so they are visible from this repo. If the two ever disagree, the jr_be spec wins.

Summary: "On the mat" widens to about 600 m (base 500 m plus a GPS allowance capped at 100 m) for both the Arena display and the proximity gate; "Online & Close" becomes 3 km in two bands (`under_1km`, `under_3km`); close rows become challengeable when the server says so (`can_challenge`); a gentle, non-blocking info box appears on both sides of a challenge that involves someone in Online & Close; and every range is admin-tunable on the server without a migration or an app release.

Release order: this client OTA ships FIRST (it is inert against today's server), then the jr_be migration is applied to prod by hand, then `/canvas-sync` redraws boards 57, 13, 14 and 15. See jr_be spec section 11.

## Client acceptance criteria (copied from jr_be spec section 10)

- C1. The parser keeps any close row whose band matches `^under_(\d+)(m|km)$`, uses `band_max_m` when present else meters from the id, drops malformed bands, reads `can_challenge` as true only when exactly `true`, and parses `ranges` or null.
- C2. Against today's server (no new keys) the Arena renders exactly as it does today: same labels (`< 500 m`, `< 1 km`, `< 2 km`), same order, close rows not challengeable, header `< 2 km`.
- C3. Against the 023 server, close rows show `< 1 km` / `< 3 km`, are ordered by meters then name, and the section header reads `< 3 km` from `ranges`.
- C4. A close row with `can_challenge: true` shows ROLL; tapping it sends the challenge immediately with no extra sheet; with `can_challenge` false or absent the row stays disabled as today.
- C5. After ROLL on a close row, the WaitingStrip shows `Possibly on a different mat · <band label>` with the spoken variant; a challenge to an on-mat row shows no such line; a rehydrated outgoing challenge derives the line from the current close list.
- C6. The incoming challenge sheet shows the `Maybe a different mat` plate (neutral rail, no button, non-blocking) only when the challenger is in the viewer's close list, with the band label and spoken text from jr_be spec 8.4; accepting and declining are unchanged.
- C7. Live with nobody else on the mat and N > 0 close: chip `LIVE · N NEARBY`, control bar `N NEARBY`, spoken variants; never `JUST YOU` while close rows exist. With both counts 0: `LIVE · JUST YOU` and `NOBODY ELSE ON MAT` unchanged.
- C8. All tests in jr_be spec 8.6 updated or added; `npm run typecheck` and `npm run test` green at the jits_web root.
- C9. Shipped as an OTA on runtime 0.5.0, production channel, via the `ship-mobile` skill (JS-only change; no native dependency, no `app.json` change).
- C10. After the backend apply, `/canvas-sync` redraws boards 57-Arena-Nearby, 13-Arena-Live, 14-Arena-Waiting and 15-Challenge-Sheet from shipped code with an independent review, and advances `last-sync.json`.

## Files in scope (details in jr_be spec section 8)

- `packages/shared/src/api/location.ts` (+ `location.test.ts`)
- `apps/mobile/lib/arena/use-arena-nearby.ts`, `lib/arena/mat-board.ts`, `lib/arena/header-chip-model.ts`, `lib/arena/arena-store.ts`, `lib/arena/use-arena-challenge.ts`
- `apps/mobile/app/(app)/(tabs)/arena/index.tsx`
- `apps/mobile/components/arena/online-close-section.tsx`, `components/arena/mat-board.tsx` (WaitingStrip), `components/arena/challenge-prompt-sheet.tsx`, `components/arena/arena-plates.tsx`
- Tests listed in jr_be spec 8.6

Beads: jits_web epic `jits-suv4` (children `.1` to `.7`); jr_be epic `jr_be-ov8` (the prod apply `jr_be-ov8.5` waits for the OTA `jits-suv4.6`; the canvas sync `jits-suv4.7` waits for `jr_be-ov8.5`). Both labelled `arena-ranges`.
