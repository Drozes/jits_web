# ELO RATED, practice match and live screen release journal (2026-09-26 to 2026-09-27)

**How to read this.** This is the narrative record of one long orchestrated session that took an idea (an optional practice match for new users) through design, build, review and a production release. The same session then redesigned the live recording screen and shipped it in portrait (over the air) and landscape (TestFlight 0.4.0). The section "State at handoff" is what a new session needs; everything above it explains why things are the way they are. Tracker ids are beads (`bd show <id>`), and project memories live in `bd memories` in both repos.

---

## What shipped

| Area | What | Where it lives |
|---|---|---|
| Practice match onboarding | Optional practice match against a scripted local bot, offered once on Home to athletes with no matches and replayable from Settings. It mirrors the real Arena flow (challenge, accept, weights, ready, live, result, confirm). The user can record once; the clip plays back locally and is deleted, never uploaded. | Spec: jr_be `specs/014-practice-match-onboarding/spec.md`. Mobile: `apps/mobile/app/(app)/practice.tsx`, `components/practice/*`, `lib/practice/*`. Backend: migration `20260926151502_practice_match_onboarding.sql`. |
| Submission picker | The result step's grid of submission chips became one field that opens a full-screen search (built on the existing `components/ui/search-select.tsx`). Search ignores case, punctuation and accents and matches initials ("rnc"). | `components/match-flow/steps/submission-fields.tsx`, `lib/match-flow/filter-submissions.ts` |
| Finish time prefill | The result step's finish time is prefilled from the pause-aware match clock at the moment the match ends (tap, auto-end at 00:00, or the opponent's end), clamped to 1..duration, editable, with a "From match clock" hint. "0" is now rejected, matching the backend. | `lib/match-flow/use-live-controls.ts`, `components/match-flow/steps/live-step.tsx`, `result-step.tsx`, `lib/match-flow/parse-finish-time.ts` |
| Live screen, portrait | "Broadcast Lower-Third": full-screen camera at the true recorded 9:16 frame (the old 16:9 box showed a crop that did not match the recording), with the athlete bar, clock slab and controls in one lower third. End Match is a 1.2 s hold with a fill, haptic, release to cancel, disabled while auto-ending at 00:00, and a screen-reader action. New states: paused (camera still recording), final 10 seconds, time up, camera starting, no video, and a 1.5 s "opponent ended" plate. | `components/match-flow/live/*`, `lib/match-flow/live-view-state.ts`, `lib/video/recorded-frame.ts` |
| Live screen, landscape | "Widescreen Sideline": the phone may rotate during the ready check; going live locks the current orientation for the whole recording; everything else stays portrait. Same components reflowed, with Pause and Hold to End as tiles in a right rail. | `components/match-flow/live/live-landscape-layout.tsx`, `components/match-flow/match-orientation-controller.tsx`, `lib/orientation.ts` |

## Key decisions and why

- **Practice matches are client-only.** Reusing the real `matches` table would have meant excluding practice rows from ELO, `get_athlete_stats`, match history, recent activity, the dashboard, gym stats and leaderboards (which do not filter bots today), and muting push triggers and realtime. The backend therefore only stores two onboarding timestamps behind a SECURITY DEFINER RPC; `guard_athlete_columns` is a denylist, so the migration had to add reverts for both new columns.
- **Record once, never upload.** The owner wanted new users to try the camera without adding code complexity. The recorder gained an `upload?: boolean` option and `discardLocalClip`; there is no new recorder.
- **The live screen had a truthfulness bug, not just a size problem.** The recording is portrait 720p but the preview was a landscape 16:9 box filled edge to edge, so users saw a centre crop, not what was recorded. The new full-screen preview uses the recorded shape.
- **Each athlete records on their own phone, propped matside with the back camera,** so the screen faces the wall. This is why several concepts on the design canvas explored mat-facing and glanceable layouts.
- **Landscape locks at go-live** because a clip's orientation is fixed when recording starts. Rotation is only allowed on the ready check.
- **0.4.0 version bump for landscape.** `runtimeVersion` follows `expo.version`, so a native change must fork the runtime; otherwise an OTA could land on binaries with different native modules. `lib/orientation.ts` is a no-op when the native module is missing, so nothing crashes on 0.3.0.

## Design work

The live screen went through a full design loop on a Design canvas: https://claude.ai/artifact/7AWXfMVu4AeLViX28xk9rq. Four design teams (camera-first, operator, athlete, wildcards) proposed 24 concepts, three judges scored them, and a director picked 12 hi-fi concepts, shown next to a faithful recreation of today's screen. The owner chose 01 Broadcast Lower-Third and 08 Widescreen Sideline. A refinement pass then drew every state in both orientations (rows "Refined" on the canvas) from one shared spec. The next exercise, on the primary menu and the match flow, is queued as jits-ot3o with a ready prompt in `docs/prompts/design-exercise-menu-and-match-flow.md`.

## How it was built

Every slice used the workspace policy: a product manager wrote the spec and acceptance criteria and filed beads; one implementer built in its own git worktree; two independent reviewers (correctness and security, then fidelity and simplicity) looped with a fixer until clean; two product-acceptance passes checked the experience (including a Playwright walk of the practice flow); and a quality gate ran typecheck, all workspace tests, the web build and `expo export`. Bugs caught by review that tests had missed include: the hold-to-end relying on React Native long press (which cancels when the finger drifts, replaced by an own timer), the REC tally reverting to "camera starting" after a recording stopped, and the Android launch orientation not honouring the iOS-only plugin setting.

## Release record

1. **Backend (2026-09-27).** jr_be `development` and `main` fast-forwarded to `11ecf20`. The Push Migrations GitHub Action has never worked (empty `SUPABASE_PROJECT_REF` secret, jr_be-35j), so the migration was applied by hand: `supabase migration list --linked` (prod already had everything through `20260925120100`), `supabase db push --linked --dry-run` (listed only `20260926151502`), then the real push, then the list again.
2. **Web.** jits_web `development` and `main` fast-forwarded to `4066642` only after the migration was verified, because `ATHLETE_GUARD_SELECT` selects the new columns. Vercel deploys `main` to `https://jitsweb.vercel.app`. Web has no practice match in v1 (jits-gu1q).
3. **Mobile OTA.** Group `a391af14-6a09-44fb-9995-837fdd89e0d6` on runtime 0.3.0 from commit `4066642`, published with the worktree's local `.env` files moved aside. The EAS production environment supplied `EXPO_PUBLIC_SUPABASE_URL` and the anon key. Rollback target: group `23271e97-356d-4f41-b9d3-e1d5230b72d5`.
4. **Landscape, TestFlight.** `expo.version` bumped to 0.4.0; `development` and `main` fast-forwarded to `523daa8`; EAS build `c430db44-d805-4ce3-aede-b7baf00c7959` (0.4.0, build 23) finished at 18:16 UTC with auto-submit `d6cb1244-358e-414f-95cd-b0f78f627b95`. The submission's success is not yet confirmed (jits-1c5i).

## Friction worth knowing

- **Permission classifier.** Pushes to `development` and `main`, EAS reads and some `gh` calls were repeatedly denied in auto mode even with the owner's chat approval. The owner ran several release steps with the `!` prefix, then added allow rules. Plan for this: stage everything so each release step is one pasteable command.
- **Shared local Supabase.** A gate agent ran `supabase db reset` from a worktree and wiped the owner's local data (backup `qa-predreset-data.sql` in that session's scratchpad, not restored). Never reset the shared local stack without a backup and the owner's OK; prefer `supabase migration up --local`.
- **Metro and worktrees.** The simulator shows whatever checkout Metro serves. When testing a feature branch, restart Metro from that worktree (`CI=false npx expo start --dev-client`); `CI=` (empty) crashes the Expo CLI.

## State at handoff (2026-09-27)

- **Production:** jr_be `main` `11ecf20` (prod DB through `20260926151502`); jits_web `main` `523daa8`; OTA `a391af14` on runtime 0.3.0; TestFlight 0.4.0 (23) submitted, pending confirmation and external Beta App Review.
- **Open work:**
  - jits-1c5i (P1): confirm the 0.4.0 submission and send it to external Beta App Review.
  - jits-kgra.6 (P1): portrait live screen device checks Q1 to Q7.
  - jits-n48v.5 (P1): landscape device checks D1 to D17.
  - jits-82by.5 (P2): regenerate `database.ts` from the prod schema (`npm run db:types`).
  - jr_be-35j (P2): fix or remove the Push Migrations workflow.
  - jits-ot3o (P2): the menu and match flow design exercise.
  - jits-gu1q (P3): practice match on web.
- **OTA targeting from now on:** anything published from `main` targets runtime 0.4.0 and reaches only build 23 and later. To patch 0.3.0 users, publish from a 0.3.0 commit.
