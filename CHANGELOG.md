# Changelog

## [Unreleased]

### Mobile: timed match auto-ends at 00:00 again (jits-2y8i)

JS-only, OTA-eligible for runtime 0.3.0 (no native dependency, `app.json` or config change).

**Fixed**
- `apps/mobile/components/match-flow/steps/live-step.tsx`: a timed match never auto-ended at 00:00. The auto-end effect listed `handleEnd` in its deps, and `handleEnd` is a new function every render while the timer keeps re-rendering every second at zero, so the first tick inside `AUTO_END_DELAY_MS` cancelled the armed timeout and a one-shot guard stopped it re-arming: the match sat LIVE at 00:00 and `match_ended` was never sent. The effect now reads `handleEnd` through a ref and keys only on whether an auto-end is due (zero, running, not paused, no pause/resume in flight, not already ended). A pause at 00:00 holds the auto-end and resuming re-arms it; the opponent's `match_ended`, a manual END MATCH and unmount can never double-fire it. Test: `apps/mobile/__tests__/components/match-flow/live-step-auto-end.test.tsx` (real match timer under fake timers, forced re-renders inside the delay).

### Web: match detail page + inline video viewer (jits-5tj9.9, jits-8t0m)

**Added**
- `/matches/[id]` (`apps/web/app/(app)/matches/[id]/`): `page.tsx` (sync, Suspense + skeleton), `match-detail-content.tsx` (async server read via `getMatchDetailView`, `notFound()` on `MATCH_NOT_FOUND`, inline "You can't view this match" / "Couldn't load this match" panels, per-video server-side signing via `getMatchVideoPlaybackResult` for every non-processing video, per request and never cached across users), `match-result-header.tsx` (WIN / LOSS / DRAW / NO RESULT verdict, ranked ELO delta with before and after (hidden when the delta is unknown) or "Casual, unrated", amber DISPUTED or muted VOIDED / CANCELLED chip, opponent row with a circular avatar linking to `/athlete/<id>`, meta row with a mono date), `match-video-card.tsx` (client: poster or placeholder, angle label, Watch mounts an inline `<video controls playsInline preload="metadata">` and calls `play()` so iOS Safari needs no second tap; a playback error re-signs silently and resumes at the same position, the budget is refunded only after 2s of real progress past the resume point and capped at 2 silent re-signs per mount, otherwise "Couldn't play this video" with Try again; processing, file missing and unavailable states; only the first watchable card gets the Signal Red Watch), `match-video-card-parts.tsx` (poster, panels, actions), `match-video-state.ts` (phase rules shared by server and card), `match-detail-states.tsx`, `not-found.tsx` ("Match not found" / "It may have been cancelled or removed." / Back). Tests colocated (`*.test.ts(x)`).
- `apps/web/e2e/smoke.spec.ts`: unauthenticated `/matches/<uuid>` redirects to `/login`.

**Changed**
- Match history rows link to `/matches/<id>`: Profile Recent Matches and athlete Head-to-Head (`app/(app)/profile/profile-history-list.tsx`), Stats history (`app/(app)/profile/stats/match-history-list.tsx`) and Home "Me" scope (`components/domain/recent-activity-section.tsx`). "All" scope rows stay unlinked. Each row's accessible name is "Open match vs <name>, <outcome>[, <signed delta> when ranked]" via `apps/web/lib/match-row-label.ts`; `MatchCard` takes an optional `ariaLabel`. Tests added for each.

**Fixed**
- `apps/web/components/domain/video-analysis-viewer.tsx` (jits-8t0m): signs through `getMatchVideoSignedUrlResult` (normalized_path ?? storage_path) instead of reading `match_videos.storage_path` directly, so a WebM upload plays its normalized MP4. Test: `components/domain/video-analysis-viewer.test.tsx`.

### Shared: match detail + video playback data layer (jits-5tj9.6)

**Added**
- `packages/shared/src/api/queries.ts`, new "Match detail view (history + playback)" section (all `Result`-shaped, never throw):
  - `getMatchDetailView(supabase, matchId, viewerAthleteId)`: `get_match_details` including its `videos` (failed kept, deleted never present), split into `me` / `opponent`, viewer's video first, per-video `playability`, `angle_label`, and a best-effort signed `poster_url` (thumbnail keys are storage keys, `http` values pass through, signing failure is `null`). A non-UUID id returns `MATCH_NOT_FOUND` without a round trip; a viewer with no participant row (timekeeper) gets `NOT_PARTICIPANT`.
  - `getMatchVideoPlaybackResult(supabase, videoId, expiresInSeconds = 3600)`: signed `normalized_path ?? storage_path` plus poster, status and playability; a malformed id, no row, a `deleted` row or no path is `ok: true, null`; a storage "Object not found" (404 when a status code is present, never "Bucket not found") is `VIDEO_FILE_MISSING`.
  - `getMyMatchVideos(supabase, athleteId, { limit })`: every non-deleted video in the caller's matches (both uploaders, failed and disputed included) grouped one item per match, newest first, enriched from `get_match_history` and, for matches missing from it, up to 20 `get_match_details` calls; no video is ever dropped (when exactly `limit` rows return, the oldest group may be undercounted, documented in the JSDoc).
- `packages/shared/src/utils/match-video.ts`: `videoPlayability`, `videoAngleLabel`, `sortMatchVideosForViewer`, `formatVideoDuration` (exported from `@jits/shared/utils`).
- `packages/shared/src/api/errors.ts`: `MATCH_NOT_FOUND` and `VIDEO_FILE_MISSING` codes; hint `match_not_found` maps to `MATCH_NOT_FOUND`.
- Tests: `packages/shared/src/api/match-detail-view.test.ts`, `packages/shared/src/utils/match-video.test.ts`, `errors.test.ts`. Existing `getMatchDetails`, `getMatchVideoSignedUrl`, `getMatchVideoSignedUrlResult` and `getAthleteVideos` are unchanged.

### Web: session match confirm-step parity with mobile

**Fixed**
- `apps/web/app/(app)/session/[id]/match/[matchId]/steps/match-summary-step.tsx`: after confirming, a secondary "Continue without waiting" link appears after 20s (`LEAVE_AFTER_MS`, same timing and copy as mobile) so an opponent who leaves cannot hold the athlete on the step; it moves on to the match-recorded screen, like mobile's move to its summary.
- Same file: a failed `confirmMatchResult` now re-reads the match + confirmations from the DB before erroring. The UI stays in its confirmed state while it checks (no flash back to Confirm/Dispute). A disputed (or both-confirmed) match advances, an own confirmation that did land shows the waiting state and re-broadcasts `result_confirmed`, and only an unexplained failure toasts the error, now with a "Retry" action (dismissed when the step advances or unmounts) and restarts the 20s leave clock on the next confirm.
- Same file: the ranked copy said "ELO will update on confirmation", but ELO is applied when the result is recorded. It now matches mobile: "Ranked. ELO already applied. Disputes are reviewed by an admin." Tests: `apps/web/.../steps/match-summary-step.test.tsx`.

### Mobile: match-flow review nits (follow-up to match sync reliability)

JS-only, OTA-eligible for runtime 0.3.0 (no native dependency, `app.json` or config change).

**Fixed**
- Mobile: an opponent's cancel during the ready check could toast "Match cancelled" and navigate twice (the ready step exited on its own, then the reconciler read `status=cancelled` and exited again). `ReadyStep` now leaves through the wizard's single `exitCancelled` path (passed as `onCancelledRemotely`, like the weight step), which marks the wizard exiting so the reconciler stays quiet.
- Mobile: a `voided` match (an admin voiding a disputed result, ELO reverted) was unhandled. `lib/match-flow/reconcile.ts` now exits it like a cancelled match, from every step with a "Match voided" toast; an athlete already on the summary (whose verdict and rating change are no longer true) is taken out on the next re-sync (a `matches` row UPDATE or returning to the foreground; the summary step does not poll or hold a channel); `voided` ranks as terminal so a stale read cannot un-void it. `lib/match-flow/step-router.ts` mounts a voided match on the summary (its only action is the exit), never on the weight step.
- Mobile: the live step's DB pause re-sync could apply a read that straddled a pause or resume already applied on the device (own tap or the opponent's broadcast), re-pausing a running timer (or restarting a paused one) until the next poll, up to 10 s. New `apps/mobile/lib/match-flow/use-pause-resync.ts` records every applied pause/resume and ignores a DB read older than one of them (`total_paused_duration` orders reads against resumes). An equal-total disagreement (which may instead be a real resume that added 0 s, for a pause under 0.5 s, whose broadcast was lost) is held back only within 3 s of the last applied change, and the hook re-evaluates every reconciler snapshot (new `subscribeSnapshot` on the match sync context, fired even for an identical read), so the timer can never stick paused or running.
- Mobile: tapping Resume on a match the opponent had already resumed (broadcast missed) got `MATCH_NOT_PAUSED` and only a "Couldn't resume" toast, leaving the timer paused. `use-live-controls.ts` now re-reads the match and applies the running state.

**Tests**
- `exit-navigation.test.tsx` and `upload-status-visibility.test.tsx` now mock `getMatchConfirmations` (the reconciler read it through an unmocked export and swallowed the throw); each asserts the mount-time reads hit the mocks. New `__tests__/lib/match-flow/use-pause-resync.test.tsx` and `__tests__/lib/match-flow/use-live-controls.test.ts`; ready-cancel-once and voided cases in `wizard-reconcile.test.tsx`, `reconcile.test.ts` and `step-router.test.ts`.

### Tooling: match-loop bot speaks the Team A match protocol (P0.4)

**Added**
- `tools/match-loop/tests/protocol.test.ts`: pins the bot to the app protocol (the app's `SEND_GRACE_MS`, `READY_REPEAT_MS` and confirm delay read from source, every session-match event validated and bound, `match_disputed`, repeated `ready_signal`, and the confirm-step decision table: a `completed` row alone never finishes confirm). Run by `npm run match-loop:test`.
- The bot now runs an app-equivalent DB reconciler (`MatchSide.reconcile`): re-reads `getMatchDetails` + `getMatchConfirmations` on every step change, every step channel SUBSCRIBED, every `match-row:<id>` UPDATE (whole match) and a poll from the app's own `pollIntervalFor`; snapshots are interpreted with the app's `targetFor` (imported from `apps/mobile/lib/match-flow/reconcile.ts`). Traced as `reconcile`.

**Changed**
- `tools/match-loop/bot/match-side.ts`: the weight step mounts a channel and leaves on `match_cancelled`; ready repeats `ready_signal` every 3s until the opponent's arrives and also goes live / exits from a DB snapshot; `timer_started`, `match_cancelled`, `match_ended`, `result_submitted` and the new `match_disputed` sends are awaited (bounded by `SEND_GRACE_MS`) before the step changes, like the app; `dispute()` broadcasts `match_disputed`; the new `waitConfirmDone()` (replaces `waitOpponentConfirmed`) leaves confirm only on the opponent's `match_disputed`, both confirmations (broadcast, 1.5s later, or DB rows) or a `disputed` row, never on `completed`; `waitDisputeSignal()` is broadcast-only. The old `match-complete:` completion listener is gone.
- `tools/match-loop/bot/protocol.ts`: re-exports `settleWithin`, `targetFor`, `pollIntervalFor`, `MATCH_STEPS` from the app; `APP_TIMING` constants.
- Scenarios: `bothConfirm` asserts the bot's confirm outcome and that Blue's `result_confirmed` reached the spy; C6 expects Blue's `match_disputed` (spy payload, Red's confirm channel, Red leaves confirm on it) and is no longer an expected failure; E3B expects the weight channel to receive the cancel (no longer an expected failure); E6 expects Blue on confirm after foregrounding (no longer an expected failure); E7 expects the relaunch to land on confirm and both to confirm; E8 lets the bot finish confirm from the DB after the outage.
- `tools/match-loop/run.ts`: the protocol oracle no longer waves through unknown event names containing "disput" (`match_disputed` is validated now).
- Review follow-up: the cancelled `ReadyOutcome` carries `via` (`broadcast` / `weight_channel` / `reconciler`); C5 hard-asserts `protocol:blue-sent-match_cancelled` on the spy (via recorded as informational), so the DB reconciler cannot mask a lost cancel broadcast; `bothConfirm` hard-asserts that the bot's confirm channel received Blue's `result_confirmed` (`MatchSide.confirmReceivedOnChannel()`; informational in E7 and E8); new core scenario `tools/match-loop/scenarios/core/c6b-red-disputes.ts` (C6B: Red broadcasts `match_disputed` BEFORE the dispute RPC, a deliberate harness-only reorder via `MatchSide.disputeBroadcastOnly()` + `disputeRpcAfterBroadcast()`, so the row is still `completed` and unconfirmed and Blue's DB reconciler cannot move Blue; Blue must reach the summary within 3s, then the RPC and the DB oracles; the summary verdict is informational); a test that loading the bot pulls in no React / React Native / Expo module.

### Mobile/Web: Arena reliability (jits-1o4l, jits-celf, jits-yiwx, jits-ef2a)

JS-only, OTA-eligible for runtime 0.3.0 (no native dependency, `app.json` or config change). Web ships with it from main.

**Fixed**
- Mobile: an expired outgoing challenge left the "Waiting for <name>" plate stuck until a relaunch (jits-1o4l). `apps/mobile/lib/arena/use-arena-challenge.ts` now treats every status that cannot become a match (`declined`, `cancelled`, `expired`, anything unknown) as terminal on the challenger side, toasts "Your challenge to <name> expired." for an expiry, and also clears the plate on its own at `expires_at` (timer plus a re-check on every return to the foreground). Cancel on the plate always resolves: a cancel that changed no row (the challenge was already over) clears the plate, or joins the match if the opponent had just started it; an `RLS_VIOLATION`, or a failed cancel of a locally expired challenge, clears it too; only a plain network failure on a live challenge keeps it.
- Mobile + web: stale pending challenges no longer hold the 3-pending cap for 7 days (jits-celf, frontend mitigation; the backend sweep is a separate bead). The athlete's OWN outgoing pending challenges older than the 10-minute Arena freshness window are withdrawn on bootstrap mount, on going live and on return to the foreground (mobile via `use-pending-challenge-recovery.ts`, web via `apps/web/hooks/use-arena-challenge.ts` on mount, on going live / leaving a match and on tab `visibilitychange`). The challenge on the athlete's own waiting plate is never swept. A `MAX_PENDING_CHALLENGES` insert withdraws stale ones and retries exactly once; if still refused, mobile shows the cap plate (new copy: "Unanswered challenges clear automatically after 10 minutes, so try again shortly.") and web toasts the same explanation. The roster is re-read after a sweep that withdrew something.
- Mobile live-state nits (jits-yiwx): `use-arena-live.ts` seeds its committed state from `initialRanked`, so a stale `looking_for_ranked = true` is actually cleared on a cold launch straight into a match and on a silent-push background launch (it previously stayed true all match, challengeable from web); a prompt that is up when a match starts by another route (deep link) is dropped instead of held, and recovery re-reads after the match and re-offers it only if still fresh with its challenger in the lobby; recovery marks a challenge offered only once the prompt was really raised (`offerIncoming` now resolves a boolean). Documented: watching the match video from the summary step keeps the athlete offline until they leave the match screen.
- Mobile a11y (jits-ef2a): the challenge prompt exposed only "Bottom Sheet" to VoiceOver/idb, so Accept/Decline were unreachable. `apps/mobile/components/arena/challenge-prompt-sheet.tsx` sets `accessible={false}` on the `BottomSheetModal` (gorhom made its content container an accessible leaf labelled "Bottom Sheet") and swaps the stock background (an accessible "adjustable" element) for a purely visual one (top corners 8px, the brand modal cap, was gorhom's 15px). The `challenge-prompt` container keeps its testID and is `accessibilityViewIsModal`; "Accept challenge" / "Decline challenge" are individually reachable buttons.

**Added**
- `@jits/shared/constants`: `ARENA_CHALLENGE_FRESH_MS` (10 minutes); mobile's `PENDING_PROMPT_MAX_AGE_MS` now aliases it.
- `@jits/shared/api/mutations`: `isStaleOutgoingChallenge()` and `cancelStaleOutgoingChallenges()` (own rows only, pending-guarded so an accept landing in between is never cancelled, skips a `keepChallengeId`). Tests: `packages/shared/src/api/arena-challenges.test.ts`.
- `apps/mobile/lib/arena/arena-store.ts`: `notifyStaleChallengesCancelled()` (roster refresh after a sweep).

**Changed**
- `cancelChallenge()` returns `Result<{ cancelled: boolean }>` (whether a row changed) and takes `{ onlyIfPending }`; `createChallenge()` also returns `expiresAt`. Existing callers only read `ok`.

### Mobile: match sync reliability (jits-wfpo, jits-bh2v, jits-vh7m, jits-bmei, jits-mzfu)

The match wizard advanced only on per-step `session-match:<id>` broadcasts (`postgres_changes` on `matches` never fire: the table is not in the realtime publication), so any missed broadcast stranded an athlete. The DB is now the backstop. JS-only (no native, `app.json`, dependency or metro/babel change), so OTA-eligible for runtime 0.3.0.

**Added**
- `apps/mobile/lib/match-flow/reconcile.ts`: pure mapping from a DB snapshot (status + confirmations) to a wizard action. `cancelled` exits like `match_cancelled`, `in_progress` goes live, `completed` goes to confirm until both `match_confirmations` rows exist (then summary; `completed` is set at record time, so it never means "confirmed"), `disputed` goes to summary. Forward-only, with one initial summary -> confirm correction for an athlete who never confirmed.
- `apps/mobile/lib/match-flow/use-match-reconciler.ts`: re-reads `getMatchDetails` + confirmations on step change / mount, app foreground, every step-channel SUBSCRIBED (join and rejoin), a `matches` row UPDATE (dormant until the backend publishes the table), and a poll only on waiting steps (ready, result, confirm every 4s; live every 10s; paused in the background). One fetch in flight, one trailing fetch, stale reads dropped.
- `apps/mobile/lib/match-flow/use-wizard-sync.ts`: the wizard's step state (now monotonic) plus reconciler wiring; stops the recorder before leaving live, rebuilds the confirm verdict from the stamped outcome when `result_submitted` was missed, refreshes on summary.
- `apps/mobile/lib/match-flow/match-sync-context.tsx`: `useStepMatchSync` (per-step channel that reports its status to the reconciler), `SEND_GRACE_MS`.
- `@jits/shared`: `getMatchConfirmations()` query; `SESSION_MATCH_EVENTS.MATCH_DISPUTED` (`match_disputed {athlete_id}`) with `onMatchDisputed` / `broadcastMatchDisputed`; `useSessionMatchSync` `onStatus` param; `settleWithin()`. Additive; web unaffected.
- Confirm step: after confirming, "Continue without waiting" appears after 20s so an opponent who leaves cannot hold this athlete on the step (result and ELO are already final at record time).
- Summary step: a disputed match explains that an admin will review it.

**Fixed**
- URGENT (live since the backend published `matches` to realtime, jr_be 20260925120100): the confirm step skipped straight to the summary without anyone confirming, and disputing became impossible, because `use-match-completion.ts` treated a `matches` UPDATE to `completed` (and a `completed` status at mount) as "both confirmed", while `record_match_result` sets `completed` at RECORD time. Mobile now advances only on `disputed` or a `match_confirmations` row from both athletes; the row UPDATE only triggers a re-read. Web parity in `apps/web/app/(app)/session/[id]/match/[matchId]/steps/match-summary-step.tsx` (`isConfirmStepDone`; re-reads match + confirmations on mount, on every row UPDATE and every 5s while waiting on the opponent). Tests: `apps/mobile/__tests__/components/match-flow/wizard-reconcile.test.tsx`, `apps/web/.../steps/match-summary-step.test.tsx`.
- Dispute never reached the other athlete (jits-wfpo): the disputer now broadcasts `match_disputed` (awaited) and the other side moves to the summary with a toast; the confirm poll catches a missed one. Web's session summary step sends and handles it too.
- Cancel during the opponent's weight step was lost (jits-bh2v): the weight step now listens for `match_cancelled`, and the reconciler exits on `cancelled` at the next step mount.
- Backgrounded athlete stranded after the opponent recorded (jits-vh7m): foreground re-sync moves them on (live or result -> confirm).
- Missed `result_confirmed` after a realtime reconnect (jits-bmei): the rejoin and the confirm poll read `match_confirmations` and advance to summary.
- `result_submitted` lost when the step unmounted right after sending (jits-mzfu): the session-match channel now uses broadcast acks and result, `match_ended`, `timer_started`, `match_cancelled` and dispute sends are awaited (bounded by `SEND_GRACE_MS`) before the step unmounts.
- Two ready athletes could wait on each other forever when a `ready_signal` was sent before the other's ready step joined: a ready athlete now repeats it every 3s until the opponent's arrives.
- The live step applies a newer pause state from a re-sync.

**Removed**
- `apps/mobile/lib/match-flow/use-match-completion.ts`: its `completed` trigger skips confirmation now that `matches` is published (the status flips at record time); superseded by the reconciler.

**Tests**
- New: `apps/mobile/__tests__/lib/match-flow/reconcile.test.ts`, `use-match-reconciler.test.ts`, `awaited-sends.test.tsx`, `apps/mobile/__tests__/components/match-flow/wizard-reconcile.test.tsx`, `apps/web/.../steps/match-summary-step.test.tsx`; shared additions in `session-match-channel.test.ts`, `use-session-match-sync.test.ts`, `queries.test.ts`.
- `upload-survives-remount.test.tsx` now drives the summary through the reconciler's row listener (with both confirmations) instead of the deleted hook, and gives its first cold live render a 5s budget (it measured ~1s on a cold jest cache under a full parallel run).

### Mobile: v0.3.0 TestFlight release

**Changed**
- `apps/mobile/app.json` `expo.version` 0.2.0 -> 0.3.0. This build carries native changes since build 21 (Instagram Reels module + config plugins), so the version bump forks `runtimeVersion` (policy `appVersion`) and later OTA updates target only 0.3.0 binaries, never build 21's older native module set. Ships the Arena-only app (jits-gewv), notification bell fix (jits-iddq) and app-wide live + LIVE/bell headers (jits-pplr) against hosted Supabase.

### Tooling: mobile match-flow verification harness (match-loop)

An end-to-end harness that drives the real iOS simulator app as Demo Blue (via idb) against a headless Demo Red / Demo Green opponent bot speaking the app's own realtime protocol, then checks the database, the UI, the bot trace and the Metro log. LOCAL stack only. The app-side changes are JS-only (testIDs, one copy line), so OTA-eligible.

**Added**
- `tools/match-loop/` (not a workspace; own `tsconfig.json`): `config.ts` (hard local-only guards: API `127.0.0.1:54321`, a fixed local DB target with PG* env vars stripped, every Expo dotenv file pointed at the local stack, publishable bot key, `supabase_realtime_*` container), `bot/` (opponent + per-step match side with strict/lenient channel fidelity and human/fast timing, spy socket, JSONL trace), `sim/` (idb + simctl drivers, page objects), `oracle/` (DB, UI, Metro log), `fixtures/reset.ts`, `preflight.ts` (incl. a runtime check that the simulator app is on the local realtime), `scenarios/` (core C1-C6, extended E1-E16 + E3B; E13 documented as not implemented), `run.ts` (`result.json`, fingerprints, `known` via beads, history), `LOOP.md` (unattended loop runbook), `local.config.example.json`.
- Root `package.json`: devDependency `tsx`; scripts `match-loop`, `match-loop:typecheck` and `match-loop:test` (guard tests in `tools/match-loop/tests/guards.test.ts`: `assertSafe`, `psqlEnv`, `activeEnvValue`, redaction).
- The runtime "simulator app is on the local stack" proof (`tools/match-loop/bot/app-on-local.ts`) runs in preflight and at the start of every scenario.
- `packages/shared/src/hooks/session-match-channel.ts`: the in-match realtime protocol extracted framework-free (`createSessionMatchChannel`, `SESSION_MATCH_EVENTS`, `sessionMatchTopic`). `useSessionMatchSync` now wraps it with unchanged behaviour (web unaffected); `send` returns realtime-js's status for non-React callers. Test: `session-match-channel.test.ts`.
- Mobile testIDs (JS-only): wizard step marker `match-step-<step>` with accessibility label "Step N of 8, <Label>" (the duplicate visual step name is hidden from VoiceOver), `weight-confirm`, `ready-button`, `ready-panel-you|opponent` (with "Opponent, ready" labels), `live-pause-toggle`, `live-end`, `result-outcome-*`, `result-winner-<id>`, `result-submission-<code>`, `result-finish-time`, `result-record`, `confirm-result`, `confirm-dispute`, `confirm-verdict`, `dispute-reason|submit|back`, `summary-verdict|elo-delta|exit|done`, `wizard-error-exit`, `login-email|password|submit`, `arena-waiting-plate`, `challenge-prompt`.
- A third LOCAL-only test account, `demo-green@elorated.dev` (active, 170 lbs, ELO 1000, seed password), created with jr_be's seeding engine; used for mid-match challenge and 3-cap scenarios. Not present in any hosted environment.

**Changed**
- Confirm step copy (`apps/mobile/components/match-flow/steps/confirm-step-panels.tsx`): "Ranked. ELO updates on confirmation." was wrong (ELO is applied when the result is recorded); now "Ranked. ELO already applied. Disputes are reviewed by an admin."
- `.gitignore`: ignores `tools/match-loop/.runs/`, `tools/match-loop/local.config.json`, and every `.env*` file or backup at any depth except `*.example` templates.

### Mobile: notification bell opens again

**Fixed**
- The notification bell did nothing when tapped. `apps/mobile/components/notifications/notification-panel.tsx` called gorhom's `dismiss()` on a sheet that was not showing (on first render, and again after a backdrop tap / pan-down had already closed it), which leaves `BottomSheetModal` stuck in DISMISSING so every later `present()` tore straight down. It now only dismisses a sheet it presented that has not closed itself, and sets `enableDynamicSizing={false}` so the fixed 65% list is not sized to a sliver. Regression test: `apps/mobile/__tests__/components/notifications/notification-panel.test.tsx`.

### Mobile: stay live across the app, with a LIVE signal in the header (jits-pplr)

Being live in the Arena now persists across Home, Arena, Rankings and Profile, the header shows it on every screen, and incoming challenges reach a live athlete wherever they are. Mobile only; JS-only, so OTA-eligible (no `app.json`, native, dependency or metro/babel change).

**Added**
- `apps/mobile/lib/arena/arena-bootstrap.tsx`: `<ArenaBootstrap />`, mounted once beside the Stack in `app/(app)/_layout.tsx` for an active athlete (keyed by athlete id). The single owner of `useArenaLive`, `useLobbyPresence`, `useArenaChallenge`, pending-challenge recovery and the `ChallengePromptSheet`.
- `apps/mobile/lib/arena/arena-store.ts`: module-level external store (`useArenaState`, `useIsArenaLive`), stable `arenaActions` delegating to the registered owner, the roster-correction hand-off, and `takeArenaOfflineBeforeSignOut()`.
- `apps/mobile/lib/arena/use-pending-challenge-recovery.ts`: reads `getPendingChallengesForAthlete()` at mount, on going live and on return from the background; offers the newest incoming challenge that is unexpired, at most 10 minutes old and whose challenger is in `lobby:online` (only while live, never over an open prompt, each once), and restores the athlete's own fresh outgoing challenge so the accept broadcast still lands.
- `apps/mobile/components/layout/live-header-signal.tsx`: `LivePill` shown only while live; taps through to the Arena (static on the Arena itself).
- `apps/mobile/components/layout/brand-header.tsx`: the Home / Rankings wordmark header (wordmark left; LIVE signal then notification bell right), replacing two inline copies.
- `useArenaChallenge` gains `offerIncoming` / `restoreOutgoing` and remembers answered or withdrawn challenges so a stale read cannot re-raise one.
- Tests: `__tests__/lib/arena/arena-store.test.ts`, `arena-bootstrap.test.tsx`, `use-pending-challenge-recovery.test.ts`, `__tests__/components/layout/live-header-signal.test.tsx`, `__tests__/screens/profile.test.tsx`; new lifecycle and recovery cases in `use-arena-live.test.ts` and `use-arena-challenge.test.ts`.

**Changed**
- Live lifecycle: switching tabs no longer takes the athlete offline. Entering a match takes them offline (flag and presence) and leaving the match screen by any exit restores live if they were live going in; no challenge prompt is raised or offered while a match screen is mounted (`useArenaMatchScreen()` counter in `arena-store.ts`, closes jits-u12o). Backgrounding still clears both signals; foregrounding restores live wherever the athlete lands if the background is what took them down, except mid-match, where the intent waits for the match to end; a failed restore says so in a toast. Launch with `looking_for_ranked` true resumes live, but only in the foreground: a background cold launch (silent push) parks the intent until the first "active". Sign-out clears `looking_for_ranked` before `supabase.auth.signOut()` (bounded at 4s); unmounting the owner still clears.
- Match screen and profile-setup headers show the LIVE signal as static (not a link), so tapping it cannot pop a match and strand the opponent.
- `use-lobby-presence.ts`: after the stale-channel backoff gives up, setup re-runs on the next foreground instead of leaving the lobby dead for the session.
- Pending-challenge recovery re-checks freshness at offer time; the realtime INSERT re-checks for an existing prompt (and a match) after its challenger lookup.
- `AppHeader` renders the LIVE signal in its right slot (new `liveSignal` prop, `"static"` on the Arena); its side slots now share the leftover width equally so the title stays centred and the pill never shifts it.
- The Arena screen reads live and challenge state from the store and no longer mounts presence, the live writer, the challenge listener or the prompt itself.
- Tab headers: on Home, Arena, Rankings and Profile the right side is exactly the LIVE signal (while live) then the notification bell. Home and Rankings drop the header avatar (it was not tappable; the Profile tab covers it) and Rankings gains the bell. Profile's header Share icon moves into the body as a secondary "Share profile" button under the profile header, opening the same share sheet. Pushed screens keep their right actions.
- Help & Support: dropped the "keep the Arena open while you're live" caveat; describes staying live across the app and the header LIVE pill.

**Fixed**
- The first incoming challenge after every launch was invisible: `ChallengePromptSheet` called `dismiss()` on a never-presented gorhom modal on mount, leaving it stuck in DISMISSING so the next `present()` rendered nothing (it could also minimise an open notification panel). It now only dismisses a sheet it presented that has not closed itself, and sizes to its content (`enableDynamicSizing`, no percentage snap point). Regression test: `__tests__/components/arena/challenge-prompt-sheet.test.tsx`.

**Removed**
- `apps/mobile/lib/arena/use-arena-tab-focus.ts` and its test (no remaining caller).

### Mobile: Arena-only matchmaking; gym sessions, gym pages and the gym-manager portal removed (jits-gewv)

Product decision 2026-09-25: on mobile the Arena (go live, send and receive live challenges) is the only way to get a match. Mobile only; `apps/web`, `packages/shared` (web uses every session symbol) and the backend are untouched. JS-only, so OTA-eligible: no `app.json`, native, dependency or metro/babel change (native cleanup such as the now-unused `expo-location` permission is jits-d3hb).

**Removed**
- Routes: `apps/mobile/app/(app)/session/` (join wizard, live lobby, session match screen), `app/(app)/gyms/` (gym list and detail), `app/(app)/gym-manager/` (hub, sessions, roster, stats, stats-by-elo, ladder, athlete detail), and their `Stack.Screen` registrations in `app/(app)/_layout.tsx`.
- Session and gym-only code: `lib/session/`, `lib/gym-manager/`, `lib/location/use-location.ts` (no remaining importer), `components/session/`, `components/session-card.tsx`, `components/gym-manager/`, `components/gyms/`, `components/dashboard/active-session-card.tsx`, `components/dashboard/session-discovery-section.tsx`, plus their tests.
- Home no longer reads `getActiveSession`, `getGymDetailResult` or `getGymsWithSessionsResult`; its only read is `getDashboardSummary`.
- Admin Metrics drops the SESSIONS / Upcoming group (`app/(app)/settings/admin/metrics.tsx`).

**Added**
- `apps/mobile/components/dashboard/arena-nudge-card.tsx`: Home's "Find a match" card, the one Signal Red CTA on Home, pushing to the Arena tab (`ARENA_HREF`). Replaces the active-session card and session discovery.
- `apps/mobile/lib/deep-links/retired-routes.ts`: `isRetiredRoute()` recognises `/session`, `/gyms` and `/gym-manager` paths with or without a leading slash or `(group)` segments, plus `HOME_HREF`.
- `apps/mobile/app/+native-intent.tsx` and `apps/mobile/lib/deep-links/system-path.ts`: expo-router's `redirectSystemPath` hook, run on the launch URL and every URL received while running, before routing. Retired session/gym links (custom scheme or `elorated.com`) become `/`, `reset-password` becomes `/login` with its query and hash carried over unchanged, and every other URL (athlete links, `elorated://login`, the dev-client launcher URL) is returned untouched for expo-router to route.
- Tests: `__tests__/lib/deep-links/system-path.test.ts`, `__tests__/lib/notifications/handlers.test.ts`, `__tests__/components/dashboard/recent-activity-section.test.tsx`; Home Arena-nudge and no-session-reads cases in `__tests__/screens/dashboard.test.tsx`.

**Changed**
- Deep links: `session/*`, `gyms/*` and `gym-manager/*` now land Home with nothing behind it, because they are rewritten in `+native-intent` before expo-router navigates, so its Unmatched Route screen never enters the stack. Push taps (`lib/notifications/handlers.ts`) whose payload `route` points into a removed family also go Home.
- Recent Activity empty states point at the Arena ("Find a match in the Arena", "Go live in the Arena to get started"); the prop is renamed `onPressFindSession` to `onPressFindMatch` and defaults to the Arena.
- `MatchFlowWizard`'s default exit label is now "Back to Arena" (`ARENA_EXIT_LABEL`) instead of "Back to Lobby".
- Help & Support "Getting Started" describes the Arena flow instead of joining a gym session with geofence and waiver, and says to keep the Arena open while live (pending challenges are not fetched at mount).
- Home paints the ELO tile and the Arena card on the first frame; only the summary-driven sections wait behind the skeleton. The Recent Activity "Find a match" link is muted (`text-ink-2`) so the Arena card is Home's one Signal Red affordance.
- Profile setup City helper no longer promises "find local sessions and gyms".

**Removed (deep linking)**
- `apps/mobile/lib/deep-links/handler.ts` and its `<DeepLinkBootstrap />` mount in `app/_layout.tsx`. expo-router 6 already consumes incoming URLs itself (custom scheme and universal), so the bootstrap's `router.push` duplicated it: a universal `https://elorated.com/athlete/<id>` link could push the athlete screen twice. (Its own custom-scheme parsing never matched `elorated://athlete/<id>`, so those links were routed once, by expo-router, and users saw no bug there.) `elorated://reset-password` now reaches `/login` via `+native-intent` instead of an unmatched route (the old parser never matched it either); the recovery code is still not consumed (deferred).

**A native module that can hand a clip to Instagram Reels, built and deliberately left unreachable (jits-s6mi.1, jits-s6mi.2).**

Meta's documented "Sharing to Reels" integration: the app writes a local video to the iOS pasteboard and opens `instagram-reels://share`, or fires an Android `com.instagram.share.ADD_TO_REEL` intent at a FileProvider URI. `react-native-share` cannot do this (its targets are `INSTAGRAM` and `INSTAGRAM_STORIES` only) and no Expo module wraps it, so both halves are hand-written.

**NOTHING IN THE APP CALLS IT, AND THAT IS THE POINT.** The share entry point is a separate slice (jits-s6mi.4) gated on the `highlight_share_enabled` feature flag, which must stay false while the consent decision `jr_be-17f` is open. That gate covers the Reels handoff, the generic system share sheet AND save-to-camera-roll, because all three hand the other athlete's likeness to a destination outside the two match participants; they are the same disclosure and none of them may ship as an unflagged convenience. These two slices add the capability and no route to it, and a test suite polices all three routes rather than only this module.

**NATIVE CHANGE: this needs a TestFlight build, not an OTA.** It adds a local native module, an `app.json` plugin entry, an Info.plist key and an AndroidManifest element. An OTA can carry none of it and will silently ship without it. The JS half is written so an OTA landing on an existing 0.2.0 binary degrades to a named "unavailable" failure instead of crashing.

**Added**
- `apps/mobile/modules/instagram-reels/`: a local Expo module exposing `shareToReels({ videoUri, appId, stickerImageUri? })`, which resolves a discriminated result and never throws. iOS writes Meta's three documented pasteboard keys (`com.instagram.sharedSticker.backgroundVideo`, `...stickerImage`, `...appID`) with a five-minute expiry plus `localOnly`, and opens `instagram-reels://share`; note that on the Reels path the App ID travels on the PASTEBOARD, not as the `source_application` URL parameter the Stories path uses, and passing it the Stories way is a silent no-op. Android follows Meta's single-media sample exactly: `setDataAndType(uri, "image/* video/*")`, the same URI in `Intent.EXTRA_STREAM`, the `com.instagram.platform.extra.APPLICATION_ID` extra, the documented `interactive_asset_uri` sticker extra, and a per-URI `grantUriPermission()` on top of `FLAG_GRANT_READ_URI_PERMISSION`. The clip is served from the module's own `ReelsFileProvider` rather than another package's.
- `apps/mobile/plugins/with-instagram-reels.js`: adds `instagram-reels` and `instagram` to `LSApplicationQueriesSchemes` and declares `com.instagram.android` in the Android `<queries>` element. Both are additive and idempotent: other plugins write the same plist array (`@react-native-google-signin`) and libraries merge their own `<queries>` blocks in (`expo-file-system`, `expo-sharing`, `expo-image-picker`), so replacing either would break something unrelated.
- Tests: `__tests__/modules/instagram-reels.test.ts` (34, the JS boundary), `__tests__/modules/instagram-reels-contract.test.ts` (33, the unreachability guard plus the cross-language string contracts no compiler checks), `__tests__/plugins/with-instagram-reels.test.ts` (14). Mobile 872 -> 953, web 90 and shared 246 unchanged, all green.

**Why each design decision, where it is not obvious**
- **Meta's duration window lives in TypeScript and travels to native on every call.** Three copies of "3 to 60 seconds" in a Swift file, a Kotlin file and a TypeScript file is three chances for one platform to enforce a different window and for nobody to notice until a user hits it. Duration is read from the file itself on the native side, not trusted from the caller, because the caller's idea of the length comes from the render request and the clip is what Instagram measures.
- **The duration window is enforced; the 50 MB ceiling is ADVISORY, and conflating them was a bug.** Meta states 3-60s as a requirement and "under 50 MB" as a recommendation. Refusing on both makes them mutually inconsistent at 1080p: a 60s clip at 8 Mbps is roughly 60 MB and at 7 Mbps roughly 52 MB, so a clip sitting legally inside the duration requirement was refused with copy blaming its length when the real cause was bitrate. Size now comes back as `oversize` plus a `byteCount` on an otherwise successful result, and `ERR_REELS_VIDEO_TOO_LARGE` is gone from all three languages. The render pipeline needs a bitrate ceiling to keep a 60s clip under 50 MB; that is a requirement on the render slice, not something this module can fix by refusing.
- **Failure is always named, never silent, and that now includes the optional half of the payload.** The documented failure mode of this entire mechanism is a no-op: Instagram opens to an empty composer, or does not open, with no error anywhere. Both native halves reject with one of seven explicit `ERR_REELS_*` codes (passed, not inferred from a class name, because Swift and Kotlin infer by different rules), which the JS wrapper maps to a stable failure value plus user-facing copy; the raw native text travels separately in `detail`, for logs, so a user is never shown an error code. A sticker that could not be read is reported through `stickerApplied: false` rather than quietly vanishing.
- **`shareToReels` genuinely cannot throw.** The two pre-flight checks used to sit outside the `try`, which was the only hole: `appId` reaches this module from config, which is `string | undefined` at its source, so `options.appId.trim()` on an undefined value was a live `TypeError` in the one function whose whole contract is not throwing. A share button that throws is a crash, not a message.
- **`requireOptionalNativeModule`, not `requireNativeModule`.** `expo.version` is 0.2.0 with a `runtimeVersion` policy of `appVersion`, so every already-installed 0.2.0 binary accepts the same OTA as the TestFlight build that first carries this module. Same reasoning and the same call as `modules/backup-exclusion`.
- **The Android intent follows Meta's SINGLE-MEDIA sample, not the multiple-media one.** Meta publishes two and they are not interchangeable: the single-media form is `setDataAndType(uri, "image/* video/*")` and only `ADD_TO_REEL_MULTIPLE` uses a bare `setType`. Taking the wrong one deviates twice at once, moving the URI out of `intent.data` and narrowing the MIME string. `setPackage` makes the intent explicit at package level but it is still matched against Instagram's intent filters, so both feed resolution, and a failure to match throws `ActivityNotFoundException`, which this module reports as "Instagram is not installed" on a phone where it plainly is.
- **The Android URI grant is explicit and per-URI.** `FLAG_GRANT_READ_URI_PERMISSION` covers an intent's `data` URI and its `ClipData`. It does NOT cover `EXTRA_STREAM`, which Android migrates into `ClipData` only for `ACTION_SEND` / `ACTION_SEND_MULTIPLE`, nor the sticker extra. So `grantUriPermission()` is called for the clip and for the sticker. It is wrapped in `runCatching` so a grant at an absent package cannot pre-empt `startActivity`'s `ActivityNotFoundException` with a generic "handoff failed", which would report "Instagram is missing" as an unexplained error. An earlier revision attached the clip as `ClipData` to make the flag reach `EXTRA_STREAM`; with the documented `setDataAndType` form the flag attaches to the data URI directly, so that workaround is gone (it also advertised the clip as `text/uri-list`).
- **The Android failure detail names the exception class and the MIME string.** Four different causes reach `ERR_REELS_INSTAGRAM_UNAVAILABLE` (absent, too old, invisible to `<queries>`, or an intent that did not match the filter) and the code alone cannot tell them apart, which would leave a device tester guessing. The `"image/* video/*"` string is kept verbatim on purpose: it is not interchangeable with a bare `"video/*"`, because `IntentFilter.findMimeType` splits on the first `/` so one tests as `image` and the other as `video`. What settles it is that Meta publishes BOTH strings against this same action on the same page (combined in the single-media sample, `"video/*"` in the sticker example), so Instagram's filter has to accept both for Meta's own samples to work.
- **The iOS share does not gate on `canOpenURL`.** `canOpenURL` answers only for schemes in `LSApplicationQueriesSchemes`, so gating on it would make the config plugin load-bearing for the share and turn a dropped plist entry into "Instagram is not installed" on devices where it plainly is. `open`'s completion handler answers the same question and needs no declaration. The plist entry still matters, for the pre-flight availability check in jits-s6mi.3. On **Android** the `<queries>` declaration IS load-bearing for the share, because an explicit intent at a package the app cannot see throws `ActivityNotFoundException`.
- **The user's clipboard is restored, not destroyed, and the insurance is only bought when it is needed.** The handoff IS a pasteboard write; there is no way to hand the composer a video without replacing `UIPasteboard.general`. The previous contents are snapshotted and put back when iOS REFUSES to open the URL, so someone without Instagram no longer pays for our failed handoff with whatever they had copied. The snapshot is gated on `canOpenURL` returning false, because reading `items` is itself the cross-app read iOS 16 can prompt for: snapshotting unconditionally would make the user risk a paste prompt on the SUCCESS path to insure the failure path, with a real chance of two prompts back to back (ours to read, then Instagram's to read what we wrote). `canOpenURL` is metadata, prompts for nothing, and needs only the plist entry this plugin already ships. It decides ONLY whether to snapshot; `open`'s completion handler remains the sole authority for the result, so a dropped plist entry still cannot break the share, it just costs one wasted snapshot.
- **`localOnly` is set on the pasteboard items.** Without it a video OF THE OTHER ATHLETE syncs to the user's other Apple devices over Universal Clipboard, which is squarely the out-of-scope disclosure class the consent gate exists to decide. The option is consumed by the pasteboard server and is not visible to the reading app, so it cannot change what Instagram sees.
- **`UIApplication.open`'s completion handler is raced against a 10s timeout, and the race has THREE outcomes, not two.** The handler is not guaranteed to arrive; the reported case is the app being suspended mid-transition. Without the timeout the Task never finishes, the Promise never settles and the JS `await` hangs forever, which is strictly worse than any named failure because the caller's spinner never resolves and no copy is ever shown. A one-shot latch guards the continuation, since resuming one twice is a hard crash. `opened` / `refused` / `timedOut` are kept apart because two of them mean opposite things to a user: `refused` is iOS saying it did not open the URL, which on this scheme means Instagram is not there, while `timedOut` is our own timer and says nothing about Instagram at all. And a timeout restores NOTHING, because the likeliest cause is a merely DELAYED handler, in which case iOS has already switched to Instagram and putting the old clipboard back would pull the payload out from under a handoff that is about to succeed. The five-minute expiry is what cleans up instead.
- **The podspec declares iOS only.** `backup-exclusion`'s podspec also claims tvOS; this one must not, because the entire mechanism is `UIPasteboard` plus `UIApplication.open` and `UIPasteboard` does not exist there.

**Corrections to claims an earlier revision of this module made**
- **Meta DOES document an Android sticker extra.** The Kotlin docblock and this changelog previously stated that no equivalent to the iOS `stickerImage` pasteboard key was documented for Android and that inventing one would be a guess. Meta's Android Sharing-to-Reels page carries an "Example with Sticker" block using `intent.putExtra("interactive_asset_uri", stickerAssetUri)` on that exact action. The extra is now implemented on both platforms. A comment asserting a vendor does not support something is worse than a missing feature, because it stops the next person re-checking.
- **Meta's single-media sample uses `setDataAndType`, not `setType`.** The previous comment claimed "Meta's own sample sets only the type", which was the `ADD_TO_REEL_MULTIPLE` sample read onto the single-media path. See the intent note above.

**Verified, and not verified**
- Verified on a dev box: `expo-modules-autolinking search` discovers the module for both `apple` and `android` with the right Swift class, Kotlin FQN and podspec name; a real `expo config --type introspect` run shows `LSApplicationQueriesSchemes: ["instagram-reels", "instagram"]` and a `<queries>` block carrying `com.instagram.android` APPENDED beside the browsable-intent query Expo already generates; typecheck, the full suite and `build:web` are green; `apps/web` lint holds at its 3 pre-existing errors.
- **The unreachability claim has independent evidence beyond the source guard.** `npx expo export --platform ios --no-bytecode` emits a bundle whose content hash has not moved across three rounds of substantial edits to this module's JS half (`entry-91a00d1bb5aa120017504433dca57595.js`, 7.13 MB). Metro is excluding the module entirely, which is a stronger statement than "no file imports it" because it is made by the bundler rather than by a regex.
- NOT verified, and not verifiable without a physical device: that Instagram reads the pasteboard item, that the composer opens with the clip in it, that `grantUriPermission` makes the FileProvider URI readable to Instagram, that Instagram's intent filter matches the documented MIME string, that the Swift and Kotlin compile at all (no gate here builds native code, and `expo export` does not touch it), and how often iOS 16's cross-app pasteboard prompt appears, including whether the new clipboard snapshot makes users meet it more rather than less often. The JS tests prove the wrapper's contract and degradation; they prove nothing about the handoff. On-device verification is jits-s6mi.6, and it additionally needs a registered Facebook App ID in Live mode (jits-s6mi.8), without which this path cannot work at all.
- **There is no App ID plumbing yet.** `shareToReels` takes `appId` as a required argument and nothing in `apps/mobile` or `packages/shared` supplies one. That is not a gap in these slices; it is unfiled work.

**Parked match recordings no longer ride into iCloud or break Android's backup (jits-vjbq).**

`retainRecording` moves an unfinished upload's clip into `<document>/match-uploads/` so it survives a process kill. That directory is `<app>/Documents/` on iOS, which iCloud backs up by default, and `context.filesDir` on Android, which Auto Backup includes and caps at 25 MB per app. A 300-600 MB clip parked overnight therefore consumed a user's 5 GB free iCloud tier, brushed the iOS Data Storage Guidelines (2.5.2) that App Review enforces, and on Android made the backup of the entire app fail for as long as it sat there, silently taking preferences and device-to-device transfer with it.

**NATIVE CHANGE: this needs a TestFlight build, not an OTA.** It adds a local native module and an `app.json` plugin entry. The JS half is written so an OTA landing on an older build degrades instead of crashing (see below), but the exclusion itself cannot ship over the air.

**Added**
- `apps/mobile/modules/backup-exclusion/`: a local Expo module exposing `excludeFromBackup(uri)` and `isExcludedFromBackup(uri)`. iOS sets `NSURLIsExcludedFromBackupKey` through `setResourceValue`, which is a per-URL resource value written at runtime, so no config plugin can do it and `expo-file-system@19.0.22` exposes nothing for it (verified: no backup-related symbol in its iOS or Android sources). Synchronous `Function`s rather than `AsyncFunction`s, because the caller is synchronous and a floating promise in the retention path is exactly the kind of surprise that path must not grow. The Android half is a deliberate no-op that returns `false` honestly, because Android has no per-file equivalent.
- `apps/mobile/plugins/with-android-backup-rules.js`: emits `res/xml/elo_data_extraction_rules.xml` (API 31+, covering cloud backup AND device-to-device transfer separately) and `res/xml/elo_backup_rules.xml` (API 23-30), and points `android:dataExtractionRules` / `android:fullBackupContent` at them. Both files are written because shipping only one leaves half the install base unprotected. `android:allowBackup` is deliberately left `true`: switching it off would also discard the preferences and auth material the user does want preserved.
- Tests: `__tests__/modules/backup-exclusion.test.ts` (7), `__tests__/plugins/with-android-backup-rules.test.ts` (11), plus 6 in `recording-file.test.ts`. The plugin test runs the plugin's own prebuild mod against a temp project root and asserts the emitted XML byte for byte.

**Changed**
- `apps/mobile/lib/video/recording-file.ts`: `retainRecording` now asks for the exclusion on the directory AND on the retained clip. The directory call is unconditional rather than only on the create branch, because the flag is a per-inode attribute: a directory can exist because an earlier call created it and then failed to set the flag, or because a device migration restored it. The per-file call is belt and braces, since Apple's QA1719 says excluding a directory excludes its contents but that is the one claim here that cannot be checked without a device. Both are best-effort: a refusal or a throw is logged and retention proceeds, because an un-excluded clip that uploads beats an excluded one that does not.

**Observability**
- `apps/mobile/lib/video/video-upload-bootstrap.tsx` reports a `video.backup_exclusion` Sentry tag once per launch, ungated on auth, plus a log line (the release Sentry DSN is still a pre-launch blocker, so a device console is the only place this is visible today). It exists because the exclusion is NATIVE and JS ships over the air while native code does not: `expo.version` is 0.2.0 with a `runtimeVersion` policy of `appVersion`, so the TestFlight build that adds the module and every already-installed 0.2.0 binary share a runtime version and accept the same OTA. Without this, the installs where the exclusion is silently inert are indistinguishable from the ones where it works, with 300-600 MB clips quietly going to iCloud.
- The tag is three-valued (`active` / `missing` / `not-applicable`), not a boolean, because `isBackupExclusionSupported` is false for two unrelated reasons: on Android that is CORRECT (exclusion is declarative), while on iOS it means clips are being backed up. Collapsing them would bury every real case under the whole Android install base.

**Verified, and not verified**
- Verified on a dev box: the module is discovered by `expo-modules-autolinking` for both apple and android with the right pod, swift module and Kotlin class names; Expo's config pipeline resolves the plugin from `app.json` and registers both its manifest and dangerous mods; the dangerous mod writes both XML files to the exact path prebuild uses; `npx expo export --platform ios` bundles the JS half; the whole suite is green.
- NOT verified, and not verifiable without a device or TestFlight build: that iOS actually writes `NSURLIsExcludedFromBackupKey`, and that Android honours the rules. The JS tests prove the exclusion is REQUESTED and that a failure cannot break retention; they cannot prove the native flag was set, because the native module is absent under Jest. `isExcludedFromBackup()` exists precisely so this can be confirmed on a real build.

**Match video uploads survive a dropped connection: resumable (tus) transfer, on-disk job records, jittered backoff, real progress, and a failed database write that no longer deletes the bytes.**

The product is moving to recording EVERY match at up to 10 minutes, so a clip is 300-600 MB and a single subway ride used to lose it permanently. Mobile had no network resilience at all: one non-resumable `FileSystem.uploadAsync` POST, two immediate attempts with zero delay between them, nothing on disk, and an indeterminate spinner. Web had no retries whatsoever and advanced the wizard past a failed upload.

**Added**
- `packages/shared/src/utils/backoff.ts`: `backoffDelayMs(attempt, {baseMs, maxMs, random})`, exponential backoff with EQUAL jitter. Equal and not full jitter because full jitter can return ~0 ms, which turns the first retry of a dead link into an immediate re-attempt, the behaviour being replaced. Shared because both apps now retry uploads.
- `packages/shared/src/utils/upload-retry.ts`: `classifyUploadError()` / `statusOfUploadError()`, the retry policy for a tus failure, shared by both apps. 404/410 (the server dropped an unfinished upload, which Supabase does after roughly 24 h) and 409 discard the upload URL and create a new one against the SAME object key; 401 is retried because every attempt resolves a fresh token; 403 and 413 are terminal.
- `apps/mobile/lib/video/tus-rn-shims.ts`: React Native shims for tus-js-client. `ExpoFileSource` reads 6 MiB windows on demand through expo-file-system's `FileHandle` (`offset` + `readBytes`), so a 600 MB clip costs 6 MB of heap per request; tus's own RN fallback pulls the WHOLE file into a Blob first. Every chunk is tagged with a `size` property because tus reads `value?.size` and rejects the upload on the last chunk when the total does not match. `AsyncStorageUrlStorage` replaces `WebStorageUrlStorage`, which silently degrades to a no-op on RN because there is no `localStorage`.
- `apps/mobile/lib/video/upload-persistence.ts`: AsyncStorage-backed record of an unfinished upload (file URI, object key, tus upload URL, byte offset, attempt count, phase), one key per match so concurrent writers cannot clobber each other, with per-match write serialisation making each read-modify-write atomic. `phase: "bytes" | "row"` so a job that finished uploading never re-uploads to retry one INSERT.
- `apps/mobile/lib/video/recording-file.ts`: moves the clip out of the purgeable camera CACHE into the document directory before the first byte is sent, and deletes it when the job settles. Persistence would otherwise be in name only: the record would survive the process kill and the file it names would not.
- `apps/mobile/lib/video/video-upload-manager.ts`: the single retry / resume authority. Jittered exponential backoff, attempt counts persisted across a process kill, resume on AppState foreground and on NetInfo reconnect, byte progress into the match store, and the `match_videos` write retried on its own budget. Deliberately NOT built on `lib/network/mutation-queue.ts`: that queue is in-memory, FIFO, last-write-wins, has no notion of partial progress, and its `clear()` on sign-out would silently destroy a recording. It does reuse the same NetInfo reconnect signal.
- `apps/mobile/lib/video/video-upload-bootstrap.tsx`, mounted in `app/_layout.tsx`: resumes unfinished uploads on launch once a session exists, and binds the foreground / reconnect triggers.
- `apps/mobile/types/tus-js-client-browser.d.ts`: types for the explicit deep import of tus-js-client's BROWSER build. Its `main` is the NODE build; Metro honours the `browser` field and Jest (>= 28) does not, so importing by path makes both resolve the same file and what the tests exercise is what ships.
- `apps/web/lib/video/resumable-upload.ts`: the same tus transfer for web, where no shim is needed (native `Blob` + `localStorage`).
- `apps/mobile/jest.setup.js`: the library's own AsyncStorage mock, globally. AsyncStorage is now a transitive import of the whole match-flow wizard, so the stub belongs in setup rather than in every suite that renders a match.
- Tests: `tus-rn-shims` (21), `upload-persistence` (25), `recording-file` (12), `video-upload-manager` (38), rewritten `upload-recording` (29), shared `backoff` (7), web `resumable-upload` (10), web `timekeeper-live-step` (8). Mobile 837 / web 90 / shared 246, all green.

**Changed**
- `apps/mobile/lib/video/upload-recording.ts`: the single-shot `FileSystem.uploadAsync(BINARY_CONTENT)` POST is replaced by `uploadFileResumable()`, a tus transfer against `${supabaseUrl}/storage/v1/upload/resumable` with Supabase's mandated 6 MiB chunk size. tus's own retry loop is disabled (`retryDelays: null`) so there is exactly one retry authority. The storage path convention, the `x-upsert` retry semantics and the `status: "ready"` row write are all unchanged: the object key still travels as `Upload-Metadata`, so the storage INSERT policy's `foldername[2] = auth_athlete_id()` still holds.
- `apps/mobile/lib/video/use-video-recorder.ts`: no longer owns the upload. It builds the object key ONCE and hands the clip to the manager; `uploadProgress` is now real byte progress read from the match store instead of a `useState` whose setter was discarded. The stop watchdog is retired on any transition out of `stopping`, because the upload that follows can now run for many minutes.
- `apps/mobile/lib/video/match-upload-store.ts`: new `progress` field, and the docblock's "the file URI is deliberately not recorded" decision is REVERSED, with the reasoning for the reversal and where the lifecycle problem is now solved instead of avoided.
- `apps/mobile/lib/video/upload-banner-state.ts`: an upload in flight now outranks a live recorder error, taking the escape hatch the previous author documented for exactly this change. A persisted job can resume with no recorder involved, so a user who re-enters the same match and denies the camera would otherwise see "Camera permission required" over a running upload.
- `apps/mobile/components/match-flow/upload-progress-banner.tsx`: a real percentage and a hairline progress fill, replacing the indeterminate spinner. It falls back to the spinner only before the first server-confirmed offset.
- `apps/web/hooks/use-video-recorder.ts`: resumable upload with backoff, `uploadProgress`, `canRetryUpload`, `retryUpload()` and `discardUpload()`. A retry resumes from the tus URL and re-PUTs the same key; once the bytes have landed a retry touches only the row.
- `apps/web/app/(app)/session/[id]/match/[matchId]/steps/timekeeper-live-step.tsx`: `uploadStatus === "error"` is no longer treated as terminal. A failed upload used to flash an amber line, unmount, and leave the user on "Match Recorded!" with no video and nothing to act on; the recording only ever exists in that page's memory, so advancing destroyed it. The step now stops and offers "Retry upload" and "Continue without video" (which compensates any orphaned object before advancing).

**Fixed**
- **A superseded upload can no longer corrupt the recording that replaced it.** Re-recording the same match leaves the first transfer running until it notices. Its success path was the one exit with no supersede check, and the only one that mutates the persisted `phase`: a late-resolving first transfer wrote `phase: "row"` onto the SECOND clip's job, whose bytes had never been uploaded. The next launch then skipped the upload entirely and wrote a `match_videos` row at `status='ready'` for an object that does not exist, dispatching the backend slicer at a nonexistent file while the user was told the video uploaded. Every persisted write in the runner is now preceded by a supersede check with no await between, including the success path, the row-write catch, and the tus upload-URL callback (which otherwise stamped the old clip's upload URL onto the new clip's job, so the next resume PATCHed the new bytes into the old object). A superseded run that did complete has its object removed, but only when the key it holds is provably different from the one the match currently owns.
- **Two upload runners could start for one match.** The `runners.has()` check and the registration that followed it straddled an await in both `resumeMatchVideoUploads` and `startMatchVideoUpload`, so two callers could both pass the check before either registered. Not theoretical: `ensureUploadListeners` binds AppState `"active"` and NetInfo reconnect as independent triggers that fire together on the canonical "walk back into wifi and open the app", with the bootstrap's mount effect as a third caller. Both resumed from the same persisted tus URL, the server answered 409, and the loser nulled the URL and began a second full 600 MB transfer against the same key. The slot is now claimed synchronously by `claimRunner()`, and `startMatchVideoUpload` holds it across its whole prepare sequence instead of releasing it at the top.
- **A stalled transfer hung forever and blocked the match.** tus's browser HTTP stack sets no `xhr.timeout`, React Native's `XMLHttpRequest` defaults to 0, and tus's own retry loop is disabled here, so a half-open socket after an iOS suspend left `uploadFileResumable` unsettled: the runner was not in a backoff sleep so a wake was a no-op, and the resume sweep skipped it because a runner was registered. A per-attempt stall watchdog now aborts and retries after 120 s with no server-confirmed progress. It ticks off wall-clock rather than a single timer, so a suspended process detects the stall on its first tick after the app comes back.
- `apps/mobile/lib/video/tus-rn-shims.ts`: a SHORT read reported `done: false`, which is the infinite loop it claimed to prevent. tus sent the short chunk, the server echoed the offset, `_performUpload()` recursed, and tus's own "source is done after N bytes" guard never fired because it only runs on a chunk marked done. Reachable when a resumed source opens a file that has changed size underneath it. It is now marked done, so tus rejects cleanly and the retry loop owns the failure. **The test for this asserted the wrong value**, with a caption describing the correct one.
- **A single 403 no longer destroys the recording.** A non-retryable upload failure routed straight to `abandonJob`, which deletes the local clip, so one response could erase an irreplaceable 600 MB file with no user choice. A 403 can be transient (a token edge, a `match_participants` row not yet visible), and the web half already keeps the recording and offers a retry. Mobile now parks the job and keeps the clip for every failure except the one where the clip is genuinely gone from the device; the retention window, not one response, decides to give up.
- `apps/mobile/lib/video/upload-recording.ts`: the tus file source was closed only on tus's two success paths (`abort()` deliberately does not close it), leaking a native file handle per failed attempt. `uploadFileResumable` now owns the lifetime and closes it in a `finally`. An abort also settles the promise instead of leaving the caller awaiting a transfer nobody is driving.
- `apps/mobile/lib/video/video-upload-manager.ts`: the retention sweep expired jobs BEFORE checking for a live runner, so a job created just inside the window could have its local clip deleted out from under a transfer that was still running. The runner check now comes first.
- `apps/mobile/lib/video/upload-persistence.ts`: the per-match write chain was never pruned, holding one map entry per match for the life of the process. Records are now also normalised on read rather than rejected, so a missing `bytesUploaded` repairs to 0 instead of discarding the only handle on a 600 MB recording (and instead of rendering `width: "NaN%"`).
- **A transient database failure no longer deletes a successfully uploaded video.** Both platforms used to run orphan compensation on the FIRST `match_videos` failure, deleting a 600 MB object that had just uploaded and forcing the retry to send it all again. The row is now retried on its own budget and the object is left alone; deletion happens only when the job is abandoned outright (mobile: past the 7-day retention window; web: the user explicitly continuing without video).
- `apps/mobile/lib/video/upload-persistence.ts`: concurrent `patchUploadJob` calls raced. The tus upload-URL callback and the failure handler fired in the same tick, the failure handler read first, and the retry resumed with `uploadUrl: null`, re-uploading the whole clip from zero. Found by the new manager tests; writes are now serialised per match.

**Not changed, deliberately**
- `buildMatchVideoStoragePath()` and the `<match_id>/<uploader_athlete_id>/<unix_ts>.<ext>` convention, the `match_videos` row shape, and the `status: "ready"` write that the slicer's AFTER INSERT trigger dispatches on.
- No `expo-task-manager` / `expo-background-fetch` and no new `UIBackgroundModes`. Backgrounding still suspends an upload; what changed is that resuming it costs the remaining bytes instead of all of them. True background transfer is a native change and a separate decision.

**Adversarial-review remediation: the Arena tab no longer crashes on a failed read, web reached WCAG AA parity with mobile, email+password sign-in is back, and the Playwright gate runs green for the first time since May.**

Five independent implementer agents, each owning a disjoint file set, working from a four-agent adversarial review of `c40dba9..HEAD`. Tracked under epic **jits-05xx**. Every fix below is gated by a test that was verified RED before the fix and green after.

**Fixed**
- `packages/shared/src/api/queries.ts` (**P0**): `getArenaData` logged its error and returned `data as unknown as ArenaData`, which is `null` on failure, so `apps/web/app/(app)/arena/page.tsx` threw a `TypeError` on `.map()` for any transient read failure on a primary nav tab. `get_arena_data` also RAISEs `athlete_not_found` when `auth_athlete_id()` is null, so the path was guaranteed reachable. Added `getArenaDataResult` as a `Result<T>` sibling (the convention `getGymDetailResult` established) and moved web onto it with a real error plate. The lenient `getArenaData` keeps its exact runtime behaviour INCLUDING the null, pinned by a regression test, because `apps/mobile/lib/arena/use-arena-roster.ts` derives its only failure signal from it.
- `apps/web/app/(app)/gyms/[id]/manage/manage-content.tsx` (**P1**): a transient `gym_managers` read failure made `isGymManager` false and REDIRECTED A REAL GYM MANAGER off their own management page. The redirect now runs only on `ok && !isGymManager`. Same migration to `Result` variants for `gym-detail-content.tsx`, `gym-header-manage-link.tsx` and `gyms-content.tsx`, which previously rendered "no sessions scheduled" and an empty gym finder as fact on a dropped request.
- `apps/web/app/(app)/leaderboard/page.tsx` (**P1**): per-gym `memberCount`, `averageElo` and the gym ranking itself were all computed by grouping a `.limit(50)` athlete scan, so with >50 active athletes every number and the ordering were wrong by construction. Now uses the `get_gym_ladder` RPC, which aggregates over every active athlete and returns an exact count and average in one round trip. No prop consumed by `leaderboard-content.tsx` changed; the label "{memberCount} athletes · Avg:" is now literally true.
- `apps/web/app/design-system/tokens.css` and `apps/web/public/design/tokens.css` (**P0**, jits-ozvd): web still shipped every WCAG AA failure that closed P0 **jits-anbc** reported as "now zero" — that fix was mobile-only. Minimum text contrast was **2.87:1** in dark (14 failing pairs) and **2.89:1** in light (17 failing pairs). Both mirrors now measure **4.60:1 minimum with zero failing text pairs**, verified by an independent WCAG 2.1 implementation self-validated against reference values first. `--color-signal-red #E63946` is untouched; the fix darkens the CTA *label* to Void, as jits-anbc did on mobile. All four token mirrors (two web, two mobile) now agree on all 17 semantic tokens in both themes.
- New `--accent-cta-text` (`#EC6A74` dark / `#AC2B34` light) for the brand red used as TEXT, which measures 4.05:1 dark / 3.21:1 light and cannot pass AA at the locked brand value. Applied to `apps/web/app/(app)/page.tsx`, `settings/settings-content.tsx`, `profile/profile-hero.tsx`, `design/web-layouts/concepts/strava-feed.tsx` and `components/ui/elo-system/rank-row.tsx`. Fills and rules still use `--accent-cta`. The mobile half is **jits-8cfd**.
- `apps/mobile/__tests__/lib/tokens-mirror-drift.test.ts` (**P1**): the drift guard could be DEFEATED by a selector list such as `[data-theme="light"], :root { ... }` — `themeOf` returned on the first match, classified the block light-only, and stayed green while the rendered dark palette changed. Replaced with `themesOf`, which merges a block into every theme it matches and fails loudly when one block claims both. Selector recognition is now normalised, so `[data-theme='light']`, `html[data-theme="light"]` and `:root:not([data-theme="light"])` no longer produce false positives.
- `apps/mobile/lib/arena/use-lobby-presence.ts` (**P1**): when a stray `removeChannel()` did not confirm `'ok'`, `ensure()` adopted the still-joined channel and called `.on()` on it, which throws. Result: lobby presence dead for the entire app session, no Challenge button anywhere on the Arena, and the athlete invisible to everyone else while the UI said they were live. Reachable from one flaky `getCurrentAthlete` read. Now bails out and retries with backoff. The existing test mocked away the very throw production raises; the mock is now honest.
- `apps/mobile/lib/arena/use-arena-live.ts` (**P1**): the background path awaited `leaveLobby()`, whose `untrack` buffers and resolves `'timed out'` only after 10s on a dead socket, before the durable `looking_for_ranked` write. iOS suspended the process first, leaving the athlete flagged live and unreachable — the exact failure this hook's header claims to prevent. Presence lapses on its own; the flag does not. The untrack is still issued first but is no longer awaited ahead of the write.
- `apps/mobile/lib/video/match-upload-store.ts` and `use-video-recorder.ts` (**P1**): `truncation` was never cleared per attempt and the store merges, so a second recording on the same match inherited the first attempt's warning and told the athlete a COMPLETE clip "stops before the end of the match". A stale `videoId` likewise left the summary showing an error banner and a working "Watch Match Video" button at once. Every field except `matchId` is now explicitly per-attempt.
- `apps/mobile/lib/video/upload-banner-state.ts`: a stale store success outranked a live recorder error, showing a green "Match video uploaded" chip while the camera was failing.
- `apps/mobile/lib/video/match-upload-store.ts`: eviction could drop an entry whose upload was still IN FLIGHT, losing its truncation warning and retry key on a ladder night (>8 matches in one session).
- `apps/mobile/components/match-flow/match-flow-wizard.tsx`: the loading guard included `|| !match` and preceded the error guard, so a first-load failure rendered a PERMANENT spinner instead of "Match unavailable". `WizardError` was only reachable on a revalidation failure.
- `apps/mobile/lib/video/use-video-recorder.ts`: render-phase `startRef.current` write moved into an effect; `stop()` with no camera no longer strands the machine in `recording` with the banner hidden; and the unmount camera-release guard was DELETED rather than repaired — React detaches refs in the mutation phase, so it had never once executed. All three `CameraView` test stubs now null the ref on unmount, matching React, which is what exposed it.

**Added**
- `apps/web/components/login-form.tsx` (**P0**): email+password sign-in via `supabase.auth.signInWithPassword`. `sign-up-form.tsx` has always called `signUp({ email, password })`, so web users set a password and then had no way to sign in with it; `/forgot-password` and `/update-password` were meaningless without it. Wires up `components/auth/password-input.tsx`, which had existed with zero consumers. "Sign In" is the surface's single Signal Red CTA, which demotes "Register with Email" to secondary chrome. Errors are mapped so an unknown address and a wrong password read identically (no account enumeration).
- `packages/shared/src/api/queries.ts`: `getPendingChallengesForAthlete()` returning `Result<{incoming, outgoing}>`, the query needed to close the P0 where a challenge arriving while the recipient is off the Arena is invisible for its full 7-day life. **Not yet wired into either UI** — that remains open.

**Changed**
- `CLAUDE.md`: corrected four claims that contradicted the code. The backend path was `experiments/jr_be`, which is not a git repository at all (1 migration, last touched May 26); the real repo is `EloRated/jr_be` (90 migrations). "Mobile nav still has Gyms" was false. "The challenge inbox... not yet built on mobile" was false. The match-video storage key is `<match_id>/<uploader_athlete_id>/<unix_ts>.<ext>` via `buildMatchVideoPath()`, not `matches/{matchId}/{timestamp}.mp4`. Also noted that Next 16 renamed `middleware.ts` to `apps/web/proxy.ts`, which does exist and is load-bearing for auth.
- `apps/web/e2e/smoke.spec.ts`: the suite had been RED since ~2026-05-15 and nobody knew, because Playwright's browsers were never installed locally so it failed before executing. It is enforced by nothing: `.husky/pre-commit` runs only typecheck and test, and `ci.yml` has no Playwright step. Now **12 passed / 0 failed**, verified cold and with `--repeat-each=2`. Stale `text=Login` selectors (a string that never existed on that page) replaced with role-based locators.
- `.gitignore`: `playwright-report/` and `.worktrees/` now match at any depth, like the `test-results/` fix before them.

**Removed**
- `apps/web/components/layout/lobby-presence-bootstrap.tsx`: dead since `ArenaContent` took ownership of `lobby:online`; it had zero importers.


**Shared discovery queries can now report a failed read, and the gym list stopped shipping every active athlete to the device.**

**Added**
- `packages/shared/src/api/queries.ts`: `getGymDetailResult`, `getGymsWithSessionsResult` and `getMatchVideoSignedUrlResult`, three sibling queries returning the existing `Result<T>` union from `api/errors.ts` (the convention the mutations already use). The originals kept their exact behaviour, so every existing call site on web and mobile is untouched. Each pair shares one internal loader that builds the payload AND reports the first fatal error; the lenient wrapper takes the payload, the Result wrapper refuses it (**jits-icei.5**).
- `apps/mobile/__tests__/screens/video-playback.test.tsx`: first test coverage for the match-video screen (5 tests), including the failure-is-not-absence distinction and the retry.

**Fixed**
- **jits-icei.5, P1**: shared queries discarded the PostgREST `error` and returned `null` or `[]`, so a caller could not tell a failed read from an empty result. supabase-js never rejects (postgrest-js sets `shouldThrowOnError = false` and converts even a hard network failure into a resolved `{ data: null, error }`), so no amount of `try`/`catch` at a call site could have recovered it. The shipped consequence: mobile Home told an athlete their gym had nothing scheduled whenever the read failed.
- `apps/mobile/app/(app)/(tabs)/(home)/index.tsx`: discovery now reads the real signal instead of inferring failure from a null gym. The previous workaround covered only a failure of `getGymDetail`'s FIRST read; if the gym row loaded and the sessions read then failed, the error was discarded, a truthy detail came back with `sessions: []`, and Home said "Nothing scheduled at <gym> right now" on a dropped request. That hole is closed. The free-agent branch's error plate was likewise unreachable in production (its `failed` flag could never be true) and is now live.
- `apps/mobile/app/(app)/video/[id].tsx`: "the recording is not there" and "we could not find out" are now different states. A transient failure rendered the "Video Unavailable" empty state, telling an athlete their match video does not exist; it now gets its own message and a Try Again action.
- `getGymDetail`'s ten reads are sorted into fatal and degraded. Fatal (the Result reports failure): the gym row, the session list, and the two capability booleans `isMemberGym` / `isGymManager`, since a false `isGymManager` silently removes the Manage entry from a real manager. Degraded (logged, defaulted): participant and RSVP counts, creator names, the athlete's own rsvp/checked-in lists, and the member count. Promoting those to fatal would hide a LIVE session behind an error plate, which is the same harm by another route.
- A FAILED read still hands back what it established, as `partial` on the failure branch (`GymDetailResult`, `PartialGymDetail`). Refusing the whole payload was an availability regression on the surface this issue exists to fix: nine reads succeeding including a live session, plus one failed `gym_managers` read, would have hidden that session behind an error plate, where the old lenient function rendered it. `partial` is offered only while the session list is trustworthy (a failed sessions read yields null, because the empty list is an artefact of the failure), and the two capability booleans are typed OUT of it so no caller can read an authorization answer off a failed read. `getGymDetailResult`'s type stays assignable to `Result<GymDetail>`.

**Changed**
- **jits-icei.2, P1**: `getGymsWithSessions` no longer issues `SELECT primary_gym_id FROM athletes WHERE status = 'active'` with no limit. That read shipped every active athlete row to the device purely to build a member-count map client side, and it moved onto the Home landing screen for every athlete without a primary gym, plus every server render of web `/gyms`. It now calls the new `get_gym_member_counts()` RPC: one row per gym that has members. On the local dataset that is 19 athlete rows down to 2 gym rows; in production it goes from O(active athletes) to O(gyms with members). **Requires the jr_be migration `20260918030000_gym_member_counts.sql` (jr_be-p33) to be applied first.** If the RPC is missing the counts degrade to 0 with a logged error rather than failing the gym list, so an out-of-order deploy is survivable.
- `packages/shared/src/types/database.ts`: `get_gym_member_counts` added to `Functions`. Hand-written to match what `npm run db:types` will generate, because regenerating against the local database would have rewritten the file from a drifted local schema.

**Not changed, deliberately**
- `getGymDetail`, `getGymsWithSessions` and `getMatchVideoSignedUrl` keep their exact previous behaviour, including returning a partial payload when a later read fails. Web's three `getGymDetail` call sites turn `null` into `notFound()`, so tightening the original would have converted a dropped sessions read into a 404 on a page that used to render. Tests pin both the new strictness and the old leniency.

**Arena ships on mobile at parity with web: a fourth tab, the live challenge handshake, and a sessionless match route that inherits the whole video pipeline. The lobby flag now clears when you leave, which web never did.**

**Added**
- `apps/mobile/app/(app)/(tabs)/arena/index.tsx` + `_layout.tsx` (jits-y1lg): the Arena surface. One Signal Red CTA writes `looking_for_ranked` and joins `lobby:online`; the roster splits into "Online now" (present in Presence) and "Open to challenges" (flagged but absent). Every state is reachable and none is a dead end: skeleton on first paint, an inline retry plate when the read failed, an empty-lobby plate only when the read succeeded, copy in the Online section when nobody is present, and a per-row reason wherever a Challenge is not offered.
- `apps/mobile/lib/arena/use-lobby-presence.ts` (jits-q27s): the `lobby:online` tier, ported from `apps/web/hooks/use-lobby-presence.ts`. Same external-store shape, one channel on the shared constant topic (a per-mount topic isolates the client into a lobby of one, jits-a8y.1), and a desired-payload ref so a join requested before SUBSCRIBED still lands and a websocket rejoin re-tracks what is true now rather than what was true at mount. The channel is created once and ADOPTED on a remount, never rebuilt, because realtime-js 2.105.4 makes a rebuild silently fatal: `channel()` hands back the existing instance for a live topic, `removeChannel()` only tears down when `unsubscribe()` resolves 'ok', `subscribe()` is a no-op unless the adapter is closed, and `on()` throws for presence and postgres_changes alike on a joined channel. A remount racing its own teardown would otherwise leave a channel that never fires SUBSCRIBED, never tracks, and holds "Online now" at zero for the rest of the app session. Releases are awaited and their status checked.
- `apps/mobile/lib/arena/use-arena-live.ts`: owns the `looking_for_ranked` flag and Presence together, because the Arena renders one list off each and they lie the moment they disagree. Shaped as desired-state reconciliation rather than a pair of imperative methods, for two reasons that are really one. Intent is recorded SYNCHRONOUSLY, so a background landing inside the flag write's round trip still has something to clear; without that it finds nothing, returns happy, and leaves an athlete live and unreachable with no path that ever clears them, because the AppState handler ignores "active" and the tab effect cannot fire until they come back. And transitions are SERIALIZED on one promise queue, so a clear racing a set cannot reach the database first and lose. Going live writes the flag then tracks; going offline untracks then clears the flag, with one retry. This is the bug web's model still has: Presence lapses by itself, the column does not, so a web athlete who closes the tab stays parked in "Open to challenges" indefinitely.
- `apps/mobile/lib/arena/use-arena-tab-focus.ts`: you stay live until you leave the Arena TAB. `athlete/[id]` and `match/[matchId]` are registered in `(app)/_layout.tsx` and push OVER the tab navigator, so React Navigation blurs the Arena screen while the Arena tab is still selected. Keying "they left" on screen focus would drop an athlete out of the lobby for reading a profile, or for the match they just accepted. The tab navigator's own index survives a push, so that is what is read, and an unrecognised navigation tree fails OPEN: a false negative silently drops a live athlete with nothing to notice, while a false positive is corrected by backgrounding and by the next visit. Backgrounding and a real teardown still clear. "inactive" does not, because iOS reports it for the notification shade, Control Center, an incoming-call banner, a system alert and a half-swiped app switcher.
- `apps/mobile/lib/arena/use-arena-challenge.ts` (jits-xg50): the handshake, ported from `apps/web/hooks/use-arena-challenge.ts`. Create, a live prompt from the filtered `postgres_changes` INSERT, accept (acceptChallenge, then startMatchFromChallenge, then BROADCAST `match_started`, and only then navigate), decline, cancel, and a synchronous `busyRef` that closes the double-tap window a `useTransition` pending flag leaves open. There is no inbox. Beyond web: the prompt self-dismisses from the challenge row's own status change when the challenger cancels; a challenger whose broadcast went missing recovers into the match from that same status change (`start_match_from_challenge` is idempotent for either party, and its own EXCEPTION block catches the `matches.challenge_id` unique violation and returns the winner's row, so both sides converge with no client-side retry); and `channel.send` is checked for its "ok" status and retried, because it resolves rather than rejecting. The "already navigated" latch is keyed by challenge id, not a boolean: the Arena is a tab screen with no `unmountOnBlur`, so this hook survives the round trip into a match and back, and a one-shot latch would make every later accept a silent no-op that leaves the opponent alone in a match nobody joined.
- `apps/mobile/lib/arena/use-arena-roster.ts`: `getArenaData` at limit 100, never the RPC default of 20 (presence is uncapped, so a low limit silently hid live athletes and under-reported the online count). A null payload is treated as a FAILED READ, not an empty lobby: the shared wrapper logs the PostgREST error and returns the raw payload (jits-icei.5), so null means "we do not know" and must not be rendered as a claim that nobody is looking.
- `apps/mobile/app/(app)/match/[matchId].tsx` (jits-54km): a match with no session behind it, which is where the handshake lands both parties. It mounts `MatchFlowWizard` with `exitHref` `/arena` and `exitLabel` "Back to Arena" and passes no `sessionId`, so the Arena inherits recording, upload and playback with zero Arena-specific video code, and the wizard derives its starting step from `matches.status` as it always did. Registered in `apps/mobile/app/(app)/_layout.tsx` beside the other pushed detail screens.
- `apps/mobile/components/arena/`: `go-live-plate.tsx`, `competitor-row.tsx`, `challenge-prompt-sheet.tsx`, `arena-plates.tsx`, `arena-skeleton.tsx`. All on the ELO brand tokens and `components/ui/elo-system`, none on the legacy shadcn tier.
- `apps/mobile/lib/arena/constants.ts`: the topics, the roster limit and the two routes, each spelled once. A regression guard that carries its own copy of a route string passes green while the app navigates somewhere else, so the tests import these.
- Tests (85 new, 7 new suites): `__tests__/lib/arena/use-lobby-presence.test.ts`, `use-arena-live.test.ts`, `use-arena-challenge.test.ts`, `use-arena-roster.test.ts`, `use-arena-tab-focus.test.ts`, `__tests__/screens/arena.test.tsx`, `__tests__/screens/arena-match-screen.test.tsx`. Failure is driven by returned data throughout (supabase-js resolves transport errors into `{ data: null, error }` and `channel.send` resolves to "ok" / "error" / "timed out"), never by `mockRejectedValue` against a path production cannot produce.

**Changed**
- `apps/mobile/app/(app)/(tabs)/_layout.tsx` and the two tab tests: the bar is now the target 4-up, Home / Arena / Rankings / Profile. `EloTabBar` needed no change; its columns are flex-1 and it reads the list off the navigator. The selected-tab assertion in `__tests__/components/layout/elo-tab-bar.test.tsx` is now derived from the tab list rather than a hardcoded triple, so a future tab cannot leave it asserting a shorter bar than the one being rendered.

**Deliberately not done**
- The 3-pending-challenge cap surfaces as a standing plate and suppressed row actions, never a toast, because `can_create_challenge()` enforces it inside the `challenges_insert` RLS WITH CHECK and the fourth insert is refused by the database. But the cap is only asserted after the opponent's row confirms it: `mapPostgrestError` collapses EVERY 42501 on this insert into MAX_PENDING_CHALLENGES, and `opponent_accepts_match_type` is genuinely reachable, because the roster is a snapshot and this design has people leaving the Arena constantly, which clears their `looking_for_ranked` between the load and the tap. So a refused insert triggers a re-read: an opponent who has left gets "X just left the Arena" plus a roster refresh, a confirmed-eligible opponent gets the cap plate, and an eligibility read that fails gets a toast rather than a standing banner that is confidently wrong about a limit the athlete may be nowhere near.
- `apps/mobile/app/(app)/athlete/[id].tsx` still carries its disabled Challenge placeholder (jits-qwn5). Wiring it needs presence gating on a surface that does not mount the lobby channel, which is a decision about the online-only rule rather than a wiring change.

**Arena now runs the real match wizard, with an instant challenge handshake; web video recording fixed on Safari and switched to MP4/H.264.**

**Added**
- `apps/web/app/(app)/arena/match/[matchId]/page.tsx`: Arena matches render the SAME wizard the Gyms screen uses. The wizard turned out to have no session dependency (its guard is `requireAthlete`, every RPC is keyed on `matchId`, match realtime is `session-match:${matchId}`, and `matches.session_id` is nullable because `chk_match_origin` is satisfied by `challenge_id` alone), so a challenge-originated match renders unchanged. Deliberately NOT done via a shadow `sessions` row: `sessions.gym_id` is `NOT NULL` with no virtual-gym concept, `session_participants_insert_self` forces each athlete to join themselves, and it would pollute the sessions model with fake gym sessions.
- `apps/web/hooks/use-arena-challenge.ts`: instant handshake. Challenge, live prompt, accept, straight into the wizard, with no inbox round trip. Incoming challenges arrive as a `postgres_changes` INSERT filtered to the recipient; the accepting side then broadcasts `match_started` on a per-challenge channel so both parties navigate together. Double-taps are guarded by a ref set synchronously before the await.
- `apps/web/app/(app)/arena/arena-content.tsx`: in-row Challenge action on online athletes only (an offline opponent cannot answer a live prompt), plus incoming-challenge and waiting-for-opponent plates.
- `apps/web/lib/video/recorder-codec.ts` + tests: container negotiation extracted as pure, testable helpers (11 tests).

**Fixed**
- `apps/web/hooks/use-video-recorder.ts` (**jits-rvc, P0**): web recording was dead on Safari and every iOS browser, and reported "Camera access denied" while doing it. `MediaRecorder.isTypeSupported` rejects every WebM type on Safari, so the preference list fell through to an unsupported `"video/webm"` fallback, which made the `MediaRecorder` constructor throw inside a catch that blamed camera permissions. Now: MP4/H.264 is probed first, an unsupported type is never passed to the constructor, and camera failures and codec failures have separate messages.
- Container choice (**jits-kaf.1.2, option A**): the recorder no longer hardcodes WebM. The storage extension and `contentType` are derived from `recorder.mimeType`, which is authoritative because the browser may return a different type than requested. This matters beyond Safari: the jr_be slicer muxes chunks with `-c copy`, and VP8-in-WebM fails that outright while VP9-in-WebM yields an MP4 iOS cannot decode. H.264 is the only source that survives the pipeline untouched.
- `apps/web/hooks/use-video-recorder.ts`: camera tracks are now stopped inside `onstop`, after the final `dataavailable` has flushed. Stopping them synchronously alongside `recorder.stop()` could truncate the last chunk. Upload also gained `upsert: true` so a retry replaces rather than 409s, and the upload catch no longer discards the underlying error.
- `apps/web/hooks/use-lobby-presence.ts` is now mounted by `ArenaContent` rather than the app layout. As a null-rendering client component nested in a Suspense-deferred async server component, its effect did not run reliably, which is what left Arena's "Online now" section empty even while presence was demonstrably correct on the wire. Mounting it from the component that actually renders the list also keeps the channel off every other screen.

**Changed**
- `apps/web/app/(app)/session/[id]/match/[matchId]/`: the wizard's four hard-coded `/session/${sessionId}/lobby` exits are now an `exitHref` / `exitLabel` pair, and `MatchFlowContent` takes an explicit `matchId` plus an `allowTimekeeper` flag. Arena passes `allowTimekeeper={false}`, which collapses the timekeeper variants so both remote athletes get `fighter-live`. Session behaviour is unchanged.
- `apps/web/components/layout/nav-config.ts`: `/arena/match/*` added to the immersive-route patterns so the shell hides during a match.

**Verified end to end on the local stack**: challenge created, opponent accepted, match started, both parties navigated to `/arena/match/<id>`, and the wizard opened on Verify Weights (the fighter path, not timekeeper-wait) showing 175 lbs vs 172 lbs. Typecheck clean across all three workspaces, 257 tests pass, `build:web` green with both Arena routes emitted.

**Still outstanding for video**
- Option B (normalise WebM to H.264/AAC MP4 in the jr_be slicer before slicing, and store the normalised artifact as the playback source) is not done. Until it lands, a browser with no MP4 encoder still produces an unusable recording.
- The pipeline is wired and green only on this machine. The five `app.settings.*` GUCs are set by hand with no migration setting them anywhere, the Cloud Run slicer is not deployed, and `RUNBOOK.md` still documents a `--no-allow-unauthenticated` deploy that would 403 every pg_net slice request. Tracked as jits-kaf.1.1, .1.7, .1.8.

**Arena restored on web, re-skinned to the brand token system, and the app-wide theme mismatch that made text unreadable is fixed.**

**Fixed**
- `apps/web/app/layout.tsx`: the ThemeProvider emitted only `attribute="class"`, but `app/design-system/tokens.css` themes off `[data-theme]`. The brand layer was therefore pinned to its `:root` dark palette and its entire `[data-theme="light"]` branch was dead code, while `defaultTheme="light"` meant `.dark` never applied and every shadcn slot class resolved to light values on the dark shell. Now emits `attribute={["class", "data-theme"]}` with `defaultTheme="dark"` (the brand is dark-first), so both token systems move together. This is the root cause of Arena's section headings rendering at 1.01:1 contrast (near-black on the Void background). Also removes a duplicate `tokens.css` import.
- `apps/web/app/(app)/arena/*`: Arena was the one primary-nav screen never migrated off shadcn slot classes, so it absorbed the full mismatch. Ported `arena-content.tsx`, `looking-for-match-toggle.tsx`, `swipe/swipe-discovery-client.tsx` and both route skeletons to `var(--…)` brand tokens plus the `components/ui/elo-system` primitives (`Plate`, `Avatar32`, `MetaTag`, `LivePill`). Measured result: every piece of Arena content now clears WCAG AA (4.5:1) in both themes, against 9 distinct sub-4.5 pairings before.
- `apps/web/app/(app)/arena/arena-content.tsx`: the ELO difference was coloured `text-red-500` when the opponent was *stronger* and `text-green-500` when *weaker*. `eloDiff` is a strength gap, not a rating change, so both directions read backwards against the colour semantics (Signal Red is CTA + state-negative; Gain Green is rating increases only). Now rendered neutrally as `1113 +113 vs you` in mono.
- `apps/web/app/(app)/arena/looking-for-match-toggle.tsx`: a failed `toggleMatchPreferences` silently reverted the control with no feedback; now raises a toast. Double-taps could fire concurrent, out-of-order mutations; now guarded by a ref set synchronously before the await (a `useTransition` pending flag does NOT cover the await window, so it would have left the race open). The Radix Switch had no accessible name (screen readers announced a bare "switch") and an 18x32px target against the 44px minimum; replaced by the surface's single Signal Red CTA.
- `apps/web/components/domain/online-indicator.tsx`: the presence dot's `ring-background` resolved light and drew a near-white halo on the dark shell, and an 8px green glow violated the no-drop-shadow rule. Now rings on `var(--bg-primary)` with an `sr-only` label so "online" is not conveyed by colour alone.
- `apps/web/components/domain/elo-badge.tsx`: ELO rendered in Inter, not `font-mono`, against the rule that all numeric data is mono + tabular-nums. Its `stakes` variant also used raw `green-700`/`red-700`; now on state tokens.
- `apps/web/components/domain/lobby-active-indicator.tsx`: `animate-ping` looped at Tailwind's default 1000ms, outside the motion budget (only the 480ms rating tick and 1400ms LIVE pulse may auto-animate). Now delegates to `LivePill`.
- `apps/web/components/domain/challenge-badge.tsx`: used amber, which is reserved for draws / Pressure Score. Now a neutral `MetaTag`.

**Added**
- `apps/web/components/domain/theme-chips.tsx`: shared Dark / Light / Auto picker. Surfaced on Profile (`profile-footer-actions.tsx`) and reused by Settings, which previously carried its own copy. With the layout fix above this is the first time the light brand palette has ever rendered.
- `apps/web/app/(app)/arena/arena-content.tsx`: guided empty state. The old one was a bare "No one is looking for a match right now" with no action, the same dead-end pattern `research/012-ftue-discovery-roadmap.md` flags for the Gyms tab. Now branches on whether *you* are live and offers a next step.

**Changed**
- `apps/web/app/(app)/arena/page.tsx`, `swipe/page.tsx`: removed the `redirect("/")` that hid Arena. All of the real code below it was already intact and unreachable.
- `apps/web/components/layout/nav-config.ts`: `/gyms` removed from the primary nav. Same treatment as chat/messages (nav omission, not a redirect), so gym routes stay reachable by direct URL and from the Home and session links. Gym *selection* in signup and settings is untouched. `/arena` added in its place.
- `apps/web/components/layout/bottom-nav-bar.tsx`: the grid was hardcoded `repeat(4, 1fr)`; now derives from `NAV_TABS.length` so adding or hiding a tab cannot drift.
- `apps/web/app/(app)/layout.tsx`: left deliberately WITHOUT a `lobby:online` mount. `useLobbyPresence` is owned by `ArenaContent` instead, because a null-rendering client component nested in a Suspense-deferred async server component did not run its effect reliably, which is why Arena's "Online now" was empty. (An earlier draft of this entry claimed `LobbyPresenceBootstrap` was mounted here. It never was; the component had zero importers and has now been deleted.)
- Arena is ranked-only: the toggle writes `looking_for_ranked` and clears `looking_for_casual` (casual was removed in `47f166b`); the dead `lookingForCasual`/`lookingForRanked` props were dropped from the Competitor mapper.
- Arena section headings renamed "Online now" / "Open to challenges". The old "Looking for Match" section header collided with the toggle of the same name.

**Known, not addressed here**
- `--text-tertiary` (`#6B7280`) measures 3.49:1 on `--bg-elevated` and 4.05:1 on the light plate, below AA for body text. Arena now avoids it for content, but it is still used by the shared `RankRow`, `ParticipantRow` and sidebar chrome. A token-level decision, not an Arena one.
- The `--text-on-accent` / `--accent-cta` CTA pairing measures 3.54:1. That is the brand's defined primary-button pairing and is used app-wide; changing it is a brand decision.

**Video-native TestFlight build: full video module set embedded, OTA runtime forked to 0.2.0 (jits-kaf.2.6). Shipped as v0.2.0 build 21, submitted to TestFlight 2026-07-24 (build 20 failed on the AppCheckCore pod drift fixed below).**

**Added**
- `apps/mobile/package.json`: `expo-video` (~3.0.16, go-forward player), `expo-media-library` (~18.2.1, save-to-phone), `expo-sharing` (~14.0.8, share sheet), `expo-video-thumbnails` (~10.0.8, future poster generation). `expo-av` stays for now; the shipped `video/[id]` player still uses it, and the expo-video swap follows via OTA against the new runtime.
- `apps/mobile/app.json`: `expo-video` plugin; `expo-media-library` plugin with photo-library read/save purpose strings.

**Changed**
- `apps/mobile/app.json`: `expo.version` 0.1.0 -> 0.2.0. With the `appVersion` runtime policy this forks the OTA target: updates published from here on carry runtime 0.2.0 and can never reach the 0.1.0 builds in the field, so future JS may safely use the newly embedded video modules. The final 0.1.0-runtime OTA (Past Match Videos on expo-av) remains the terminal update for older installs.

**Fixed**
- `apps/mobile/app.json` + `expo-build-properties` (~1.0.10): pin CocoaPods `AppCheckCore` to 11.2.0 via `ios.extraPods`. Build 20 failed in the EAS "Install pods" phase because a CNG project resolves pods fresh each build (no committed Podfile.lock) and a post-June AppCheckCore release (transitive dep of GoogleSignIn) added a `RecaptchaInterop` dependency that breaks static-library integration ("Swift pods cannot yet be integrated as static libraries"). The pin restores the June known-good graph (AppCheckCore 11.2.0, no RecaptchaInterop); verified locally with a from-scratch `expo prebuild` + `pod install --repo-update`. Remove the pin when GoogleSignIn/AppCheckCore ship a modular-headers-clean release.

**Past Match Videos on the mobile Profile tab (first mobile playback surface, jits-kaf.2.1 / jits-kaf.2.2 scope)**

**Added**
- `packages/shared/src/api/queries.ts`: `getAthleteVideos()` typed wrapper over the `get_athlete_videos` RPC (own gallery; other athletes gated on `is_scoutable`) and `getMatchVideoSignedUrl()` playback helper (reads `storage_path` off `match_videos` under participant RLS, then signs a 1-hour URL against the private `match-videos` bucket; null on RLS-invisible row, missing path, or sign failure). New `AthleteVideoRow` type. Tests in `packages/shared/src/api/athlete-videos.test.ts`.
- `apps/mobile/lib/profile/use-athlete-videos.ts`: stale-while-revalidate hook (`useCachedResource`, key `athlete-videos:<id>`) serving the Profile section.
- `apps/mobile/components/profile/past-match-videos.tsx`: "Past Match Videos" section on the Profile tab; one row per video (opponent, relative date, duration, Analyzed marker) pushing the player. Renders nothing while the athlete has no videos so the empty state never reads as a broken surface.
- `apps/mobile/app/(app)/video/[id].tsx`: pushed full-screen match-video player with native controls. Deliberately uses `expo-av` (already embedded in the field build) so the screen is OTA-deliverable today; the `expo-video` swap ships with the Phase 2 TestFlight build (jits-kaf.2.6), because an OTA must never reference a native module the installed binary does not carry. Registered on the `(app)` Stack.

**On-device video debugging: recording now actually works on real iOS hardware (live-tested end to end)**

All four fixes below came out of a live on-device test session (real iPhone + simulator opponent against the local stack) that took a real match recording through upload and the slicer pipeline for the first time. None of these failures reproduced in the simulator or unit tests.

**Fixed**
- `apps/mobile/lib/video/use-video-recorder.ts`: recording never started on real hardware — `recordAsync` was called as soon as camera *permission* existed, but the native capture session initializes asynchronously and throws "Camera is not ready yet", an error that was previously invisible (state-only). `start()` now defers until `CameraView`'s `onCameraReady` (new `markCameraReady` wiring through `camera-overlay.tsx` / `live-step.tsx`), with a 3s timeout backstop for the observed case where `onCameraReady` never fires, plus a bounded retry (500ms × 16) for the also-observed case where it fires before the session can actually record.
- `apps/mobile/lib/video/use-video-recorder.ts`: a `stopRecording()` silently ignored by iOS left the recording promise pending forever and the clip lost (observed live). `stop()` now re-issues the stop on a 250ms interval until the promise settles, and a clip the OS finalizes WITHOUT an explicit stop (time cap, lost stop bookkeeping) is now uploaded instead of discarded. A stop (or unmount) arriving during the not-ready retry sleep aborts the retry loop cleanly instead of letting the next attempt record past the match end (review-caught race). The deferred-start backstop timer is held in a ref and cancelled on ready/unmount, and the pending-stop wait short-circuits when the recording settles (no leaked timers; Jest exits cleanly). Error transitions and every start/stop/upload step now emit `[video]` diagnostics tagged with the uploader athlete id (distinguishes devices on a shared Metro).
- `apps/mobile/components/match-flow/steps/ready-step.tsx`: "Couldn't start match" race — both devices call `startMatch` when the ready handshake completes and the RPC succeeds only once; the loser surfaced a misleading error and was stranded on the ready step whenever the winner's timer-started broadcast was missed. The loser now consults `getMatchDetails` and joins the already-running match.
- `packages/shared/src/hooks/use-pending-challenges.ts`: realtime channel name used a per-instance counter as its "unique" suffix, so a second hook instance (remount) collided with the first and crashed to the error boundary ("cannot add `postgres_changes` callbacks after `subscribe()`"). The suffix is now globally unique per effect run.

**Added**
- `apps/mobile/__tests__/lib/video/use-video-recorder.test.ts`: camera-ready deferral + resume, stop while start is deferred, not-ready retry, stop-during-retry-sleep abort, the 3s onCameraReady-timeout backstop (fake timers), OS-finalized clip upload.
- `apps/mobile/__tests__/components/match-flow/ready-step.test.tsx`: start-race rescue (loser joins the in_progress match with the DB started_at, no toast, no broadcast) and the fallthrough (error toast, retry re-armed).
- Backend (separate repo `jr_be`): `supabase/migrations/20260610000000_match_videos_bucket.sql` — the `match-videos` bucket moves from config.toml-only into a migration (private, 2 GiB prod cap), plus the bucket's first `storage.objects` RLS policies: participant-gated SELECT (signed-URL playback), own-folder + participant INSERT/UPDATE (x-upsert retry path) with the participant check hardened against future SELECT-policy broadening, own-folder DELETE (frontend orphan compensation), and uuid-shape guards so malformed paths deny cleanly instead of erroring. pgTAP `supabase/tests/043_match_videos_bucket_test.sql` (24 tests); full suite 1329 green.

**Video upload-path bug fixes, Phase 1 (jits-1v6, jits-81l, jits-hu0, jits-voh, jits-0lc, jits-za8, jits-a8y.13)**

**Fixed**
- `packages/shared/src/api/mutations.ts` + `errors.ts`: `createMatchVideo` / `upsertMatchVideo` now return `Result<{ id }>` (via `mapPostgrestError`) instead of throwing, matching every other mutation in the data layer (jits-0lc). `upsertMatchVideo`'s UPDATE-on-conflict path no longer nulls out optional columns the caller did not pass (`duration_seconds`, `file_size_bytes`, `camera_angle`, `athlete_left_id`, `recorded_by`, `recording_type`, `requested_tier`); a retry that omits a field keeps the existing row's value (jits-za8). A bare 23505 from the video mutations now maps through the new `match_video_create` context to `VIDEO_ALREADY_EXISTS` ("A video has already been uploaded for this match.") instead of the challenge-flavored `MATCH_ALREADY_EXISTS`; the raw code is preserved so the upsert's 23505 interception keeps working.
- `apps/mobile/lib/video/upload-recording.ts`: storage upload now sends `x-upsert: true`, so a retry against the same object key overwrites the half-written object instead of failing 400 "resource already exists" (jits-81l). New optional `storagePath` option lets callers pin the object key across retries. When the `match_videos` upsert fails after the storage write succeeded, the object is removed so no orphan file is left in the bucket (jits-1v6); the new `removeUploadedObject` helper inspects the `remove()` response (a storage-RLS-denied DELETE resolves 200 with `data: []` and NO error) and reports failed cleanup via Sentry `captureException` + `console.warn` without ever masking the original DB error. New `skipCompensation` option (used by the hook's first attempt) defers compensation to the final retry attempt; the new `MatchVideoDbError` carries `path` + `storageObjectPersisted` so callers know whether cleanup is still owed.
- `apps/mobile/lib/video/use-video-recorder.ts`: the upload retry now reuses the SAME storage path (built once per recording) instead of minting a fresh `Date.now()` key per attempt, which could strand two orphan objects per session (jits-voh); the first attempt skips orphan compensation so a transient DB failure no longer deletes the just-uploaded object and forces a full re-upload — compensation runs only after the FINAL attempt fails (including a hook-level cleanup when attempt 1 persisted an object and attempt 2 died at the storage layer). A stop requested before the recorder reaches `recording` (End fired on a very short match) is tracked as a pending-stop intent and honored once recording starts: the stop is deferred briefly and re-issued on a 250ms interval (~2s window) until `recordAsync` settles, because hardware can silently ignore a `stopRecording()` issued before native capture begins (jits-a8y.13; exact native timing still needs on-device verification). `stop()` also reads recorder state from a ref so stale broadcast-handler closures cannot no-op it. Unmounting mid-upload no longer loses the write: the storage + DB chain runs to completion and only React state setters are skipped via a `mountedRef` (jits-hu0).
- `apps/web/hooks/use-video-recorder.ts`: consumes the new `Result` shape from `upsertMatchVideo` (no try/catch around the data layer); on a failed DB upsert after a successful storage upload it removes the stored object (no orphan, jits-1v6), inspecting the `remove()` response (error present OR not exactly one removed object, e.g. a silent storage-RLS denial) and `console.warn`-ing failed cleanup without masking the original DB error. An unmount mid-upload no longer fires state setters while still letting the storage + DB write finish (jits-hu0).

**Changed**
- `packages/shared/src/api/match-video.test.ts`: rewritten for the `Result` shape; covers the UPDATE-on-conflict partial-payload behavior (provided-only columns), non-23505 passthrough, UPDATE-path failures, and the `VIDEO_ALREADY_EXISTS` mapping for a bare 23505.

**Added**
- `apps/mobile/__tests__/lib/video/upload-recording.test.ts`: x-upsert header + endpoint shape, pinned `storagePath` reuse, orphan-compensation delete + observability (remove() resolving with an error, the `data: []` silent-RLS-denial shape, and a rejecting call — all reported, none masking the DB error), `skipCompensation` flagging the persisted object, non-2xx short-circuit.
- `apps/mobile/__tests__/lib/video/use-video-recorder.test.ts`: same-path retry with compensation deferred to the final attempt, hook-level cleanup of a persisted first-attempt object (and no double-compensation), pending-stop on short matches (clip uploaded, re-issued stop when the camera ignores the first one, clean idle when no URI), upload completion after unmount.
- `apps/web/hooks/use-video-recorder.test.ts`: upload→upsert happy path, orphan-compensation delete on DB failure plus failed-cleanup observability (resolved error and `data: []` shapes), DB write completion after unmount.

**Gym Finder city dropdown dead to touch (mobile, jits-t0b)**

**Fixed**
- `apps/mobile/components/ui/select.tsx`: the `SelectTrigger` had `active:opacity-70` on a View nested inside the Pressable; NativeWind v4 css-interop attaches a press responder to that View, swallowing the tap so `onPress` (open) never fired. The city picker on the Gyms tab looked permanently stuck on the defaulted city, and the `Select` in `components/session/template-form-sheet.tsx` was equally dead. Moved the variant onto the Pressable, the same fix jits-vir applied to `SearchSelect`.

**TestFlight build 19 submitted (mobile, v0.1.0)**
- Submitted iOS build 19 to App Store Connect / TestFlight (EAS build `bb1a7332`). First **OTA-capable** build (embeds `expo-updates`), so subsequent JS-only fixes can ship via `eas update`. Bundles the sign-in fix (`jits-bxb`, no longer routes an active athlete to profile-setup) and the Glow Statement launch splash.

**Admin member management: full roster picker + grant admin / gym owner (mobile, jits-p4d)**

**Added**
- `apps/mobile/app/(app)/settings/admin/members.tsx` — new unified admin **Members** screen. Browse the FULL member roster through the gym/city-style `NativeSelect`/`SearchSelect` autocomplete (loads everyone once, filters locally), select a member, then: founders set the platform role (member/admin/founder); any admin grants/revokes "gym owner" (`gym_managers`) status at any gym. Replaces the search-only `admin/roles.tsx`.
- `apps/mobile/components/admin/member-role-section.tsx` — founder-only platform-role editor (folds in the former roles screen's logic, incl. the self-demotion warning). Non-founder admins get a read-only notice.
- `apps/mobile/components/admin/member-gym-owner-section.tsx` — gym-owner manager: lists owned gyms with revoke, plus a gym picker (excludes already-owned) to grant. Reloads after each change.
- `apps/mobile/lib/admin/use-admin-members.ts` — loads the full roster + all gyms once (cancellation-guarded), with `patchRole` to update a member in place after a role change.
- `apps/mobile/lib/admin/use-managed-gyms.ts` — loads the gyms a member manages; refetches on member change / `reload()`.
- `packages/shared/src/api/queries.ts` — `adminListAthletes()` (→ `admin_list_athletes`), `adminListManagedGyms(athleteId)` (→ `admin_list_managed_gyms`), `getAllGyms()` (plain `gyms` SELECT) + `AdminAthlete` / `AdminManagedGym` / `GymOption` types.
- `packages/shared/src/api/mutations.ts` — `addGymManager({ gymId, athleteId })` (→ `admin_add_gym_manager`), `removeGymManager(...)` (→ `admin_remove_gym_manager`).
- `packages/shared/src/api/errors.ts` — `GYM_NOT_FOUND` domain code + `gym_not_found` hint mapping.
- Backend (separate repo `jr_be`): `supabase/migrations/20260609000000_admin_gym_managers.sql` — four `is_admin()`-gated `SECURITY DEFINER` RPCs (`admin_list_athletes`, `admin_add_gym_manager`, `admin_remove_gym_manager`, `admin_list_managed_gyms`). The grant/revoke RPCs bypass the `gym_managers` manager-only INSERT RLS and write `admin_audit` rows. pgTAP `supabase/tests/042_admin_gym_managers_test.sql` (19 assertions, incl. a real RLS-bypass proof under `SET LOCAL ROLE authenticated`). `packages/shared/src/types/database.ts` regenerated.

**Changed**
- `apps/mobile/app/(app)/settings/admin.tsx` — hub link **ROLES → MEMBERS**.

**Removed**
- `apps/mobile/app/(app)/settings/admin/roles.tsx` and `apps/mobile/lib/admin/use-athlete-search.ts` — superseded by the Members screen (its role-setting is folded in). The `searchAthletes` shared wrapper is left in place (no current caller).

**Mobile OTA updates enabled (EAS Update)**

**Added**
- `apps/mobile/package.json`: `expo-updates@~29.0.17` (resolves to 29.0.18, the SDK 54 pinned version). The native updates runtime was missing, so although `app.json` already had a real `updates.url` (`u.expo.dev/146416ac…`), `runtimeVersion: { policy: "appVersion" }`, and `eas.json` channels (development/preview/production), no build could actually receive over-the-air updates. Installing the package makes the next EAS build OTA-capable. From that build onward, JS-only fixes can ship via `eas update --channel <channel>` without a new TestFlight submission, as long as the build's `runtimeVersion` (the app `version`) matches the published update. No app code imports `expo-updates`; it runs passively from the existing `app.json` config. Validated with `expo install --check` (compatible), `tsc`, and `expo export` (ios bundle + config load clean).

**Mobile sign-in no longer dumps an already-active athlete back to profile setup**

**Fixed**
- `apps/mobile/lib/auth/auth-context.tsx`: signing in (Google SSO or email/password) always redirected an already-active athlete to `/profile-setup`. The `onAuthStateChange` callback set `isLoading=false` for the signed-out case but never re-armed it on a fresh sign-in, so after sitting on the login screen (`isLoading` already false, `athlete` still null) the `app/index.tsx` gate ran `if (!athlete) redirect("/profile-setup")` synchronously, before the async `getCurrentAthlete` resolved, and the wrong redirect won every time. Cold-start with a restored session was unaffected. The callback now re-arms `isLoading=true` on a sign-in for a user whose athlete row has not been loaded yet (tracked by a `loadedAthleteForUserId` ref), holding the gate on "Loading..." until the row resolves. Token refreshes and other repeat events for the same user do not re-arm loading, so there is no Loading flash.

**Added**
- `apps/mobile/lib/auth/athlete-load.ts`: pure `needsAthleteLoad(nextUserId, loadedForUserId)` helper used by the auth-state callback (true only for a fresh sign-in or account switch). Unit + state-machine regression tests in `apps/mobile/__tests__/lib/auth/athlete-load.test.ts`.

**Mobile "Glow Statement" launch splash: E·R lettermark → ELO RATED expand (jits-cd9)**

**Added**
- `apps/mobile/components/ui/elo-system/splash-glow-statement.tsx`, new launch-splash variant. Frame 0 is the static DM Sans E·R lettermark (size-matched to the native splash). It HOLDs while the red interpunct fades out, and "WE ARE" rises in (left-aligned). Then the mark's white E/R crossfade out while the Bebas "ELO RATED" crossfades in **at the mark's size** (no size jump) and EXPANDS OUTWARD from the compact E·R seed (E→ELO leftward, R→RATED rightward), the whole wordmark settling DOWN to its final size as it spreads. A Heavy haptic fires and "ARE YOU?" rises in red (right-aligned) on the lock beat. Every animation is finite and lands on a static frame. Reduced-motion shows the resting frame only (no mark, no expand, no haptic).
- `apps/mobile/components/ui/elo-system/er-mark.tsx`, the animated E·R `react-native-svg` mark (`<G>` of the two white DM Sans Bold glyph paths + a Signal Red `<Rect>` interpunct, each on its own opacity so the dot can fade out during the hold), rendered from the same `design/icon-options/er-lettermark/splash.svg` vector source that generates the native splash icon. Absolutely centered in the full screen (ignores safe-area insets, like the native splash). Pure opacity + transform → New-Architecture/Fabric safe.
- `SPLASH_GLOW_STATEMENT` timing block + `EASING_EXPAND` settle curve (no overshoot) and the `SPLASH_VARIANT.GLOW_STATEMENT` key in `packages/shared/src/constants.ts` (single source of truth; no inline magic numbers).
- `research/assets/splash-glow-statement-preview.html`, archived web prototype (look/feel reference only; mirrors `splash-statement-locked.html`).

**Changed**
- `DEFAULT_SPLASH_VARIANT` is now `glow-statement` (was `statement`). "The Statement" and "The Climb" remain as A/B fallbacks selectable via the AsyncStorage override (`splash-variant.ts`); `apps/mobile/app/_layout.tsx` mounts the new variant. `__tests__/lib/splash/splash-variant.test.ts` updated for the new default.
- `apps/mobile/app.json` native splash: replaced the legacy top-level `splash` block (`resizeMode: "contain"`, which scaled the mark with screen aspect) with the `expo-splash-screen` config plugin pinned to a fixed `imageWidth` of 280 dp, so the mark is the same physical size on every device and registers with the 280 dp overlay mark (`MARK_DP` in `splash-glow-statement.tsx`, keep the two equal). **Requires a fresh dev/EAS build** (native splash config is baked at build time).
- `apps/mobile/package.json`: promoted `react-native-svg` from an unpinned peer dependency (declared by `lucide-react-native`) to a pinned direct dependency at `15.15.5` (the version already resolved in the tree and compiled into the build; npm dedupes to a single copy with lucide's peer). This adds no new package, the pin just makes the splash's dependency explicit and safe from `lucide` changing it. (Note: Expo SDK 54 bundles `15.12.1`; aligning is a deferred `expo-doctor` follow-up since 15.15.5 was already building.)

**Mobile gym + city pickers: shared full-screen search overlay (jits-vir)**

**Added**
- `apps/mobile/components/ui/search-select.tsx` — one reusable full-screen search-overlay primitive (`SearchSelect`) for long mobile pickers: a `Pressable` trigger opens a `transparent` `Modal` with the search input pinned to the top and a virtualized `FlatList` of results below. Powers both the gym and city fields; supports option lists and free text (cities). Exported via `components/ui/index.ts`.

**Changed**
- The mobile gym picker (`native-select.tsx`) and city picker (`city-autocomplete.tsx`) are now thin wrappers over `SearchSelect`, replacing the per-field bespoke dropdowns so both share one searchable overlay (the gym list is expected to grow). `training-step.tsx` field order is Weight, Home Gym, City.
- `packages/shared/src/geo`: `na-cities.ts` regenerated to exclude counties/parishes/municipios (~20,900 -> ~17,788 entries); `searchCities` floats major metros to the top of each match tier and excludes the trailing country from substring matching (stops "usa"/"sa" flooding results and keeps the per-keystroke sort fast). `generate-na-cities.mjs` adds the county filter; `geo.test.ts` updated.

**Fixed**
- Search overlay rendered blank on iOS: it used `presentationStyle="fullScreen"`, which presents in a separate native window the app's NativeWind theme variables never reach (this also threw `CoreGraphics NaN` layout errors). Now a `transparent` modal with an inline `useThemedTokens()` background (the DOB-picker pattern), so themed content resolves and is visible.
- Picker trigger was dead to touch: `active:opacity-70` sat on a child `View`, so NativeWind v4 css-interop attached a press responder to that View and swallowed the tap before the parent `Pressable.onPress` could fire. Moved the variant onto the `Pressable` (matching `ui/select.tsx`). Also added `automaticallyAdjustKeyboardInsets` and a 44pt "Done" hit target.

**Removed**
- Dead `@react-native-picker/picker` dependency from `apps/mobile/package.json` (zero imports after the SearchSelect consolidation; `package-lock.json` synced).

**Signup blockers from alpha tester feedback: city autocomplete, SSO name prefill (jits-jws)**

**Added**
- `packages/shared/src/geo/` — bundled offline geography for the city picker. `na-cities.ts` is a generated, flat array of ~20,900 `"City, Region, Country"` labels for the US + Canada; `index.ts` exports `NA_CITIES` + `searchCities(query, limit)` (3-tier ranking: whole-label prefix, then later-word match so "vegas" surfaces "Las Vegas", then substring). Generated by `packages/shared/scripts/generate-na-cities.mjs` (run `npm run gen:cities` in `@jits/shared`) from the `country-state-city` devDependency, which is build-time only and never bundled into either app. Exposed via the new `@jits/shared/geo` package export. Tests in `src/geo/geo.test.ts`.
- `apps/mobile/components/profile-setup/city-autocomplete.tsx` — typeahead city combobox (lazy-`import()`s `@jits/shared/geo` so the dataset stays off cold-start). Free-text: a user can keep a city not in the list, so the picker never dead-ends activation. Active-gym cities surface as pre-type suggestions.
- `apps/web/components/profile-setup/city-autocomplete.tsx` — the web equivalent (HTML combobox, same lazy-load + free-text behavior).

**Changed**
- City selection is no longer limited to the cities of existing gyms (which fell back to just Toronto/Vancouver and blocked testers in any other market). Replaced the city dropdown with the new autocomplete on all three signup surfaces: mobile `training-step.tsx`, web `sign-up-form.tsx`, and web `auth/eua-form.tsx`. Selected value stored verbatim in `athletes.city` (no schema change).
- Mobile profile-setup now prefills first/last name from the Google session's `user_metadata` (`setup-wizard.tsx` `deriveSsoName`) so SSO users don't retype their name. Existing/edited names win. Birthdate is not provided by Google and stays a manual field.
- City validation copy: "Select a city." -> "Enter your city." (web `signup-form-validation.ts`, `eua-form.tsx`), reflecting the typeahead.

**Notes**
- The Google consent screen "Continue to Jits Arena" is external dashboard config, not a code bug. Fix steps documented in `research/014-google-oauth-branding-fix.md`.

**Mobile app icon: E·R lettermark (jits-ais)**

**Changed**
- Replaced the "Podium Tiers" ladder app icon with the co-founder's **E·R lettermark**: bold `E·R` in DM Sans Bold (the brand heading font), Terminal White `#E8EDF2`, with a Signal Red `#E63946` square interpunct, on Void `#0D0F14`. Regenerated all four mobile brand assets from one vector source so they stay pixel-consistent: `apps/mobile/assets/icon.png` (full-bleed, opaque for App Store), `adaptive-icon.png` (transparent foreground sized into the Android safe zone; `android.adaptiveIcon.backgroundColor` stays `#0D0F14`), `splash-icon.png` (transparent, modest centered mark), and `favicon.png` (48²).
- Updated the **native splash mark** to the same E·R, so the cold-launch sequence reads as one motion: home-screen icon (E·R) → native splash (E·R on Void, `splash.backgroundColor #0D0F14`) → the existing `SplashStatement` "ELO RATED" wordmark animation → app. Every stage keeps `#0D0F14`, so there is no color seam; no app.json config, splash component, or font-loading changes were needed.

**Added**
- `design/icon-options/er-lettermark/` — the durable vector source + tooling for the new icon: `icon.svg` / `adaptive-foreground.svg` / `splash.svg` (re-render at any size with `rsvg-convert`, no fonts required), plus `gen.js` (extracts real DM Sans glyph outlines via `opentype.js` and lays out the mark, auto-fitting cap-height/width to the 1024 canvas), `finalize.js`, and `README.md` with the regenerate + render steps. The icon is baked at native build time, so a new EAS build / TestFlight submission is required for it to change on device.

**Mobile admin-tooling alpha: roles / metrics / feature-flags screens (admin-tooling alpha)**

**Added**
- Admin role-management screen (`apps/mobile/app/(app)/settings/admin/roles.tsx`): founder-only athlete search + role assignment (`admin_set_platform_role`). Debounced name search, select an athlete, pick a target role (member/admin/founder), confirm via `Alert.alert`, with the target's current role shown as a Badge. Admins who are not founders get a read-only "Founders only" notice (admins cannot mint roles). Self-guards with the `useIsAdmin()` route-guard pattern; the setter UI gates on `useIsFounder()`.
- Admin metrics screen (`apps/mobile/app/(app)/settings/admin/metrics.tsx`): renders the 8 `get_admin_metrics` counters grouped into Signups / Activation Funnel / Matches / Sessions Plates; numbers in `font-mono tabular-nums` (never Signal Red), with loading / error+retry / refresh states.
- Admin feature-flags screen (`apps/mobile/app/(app)/settings/admin/flags.tsx`): lists every `feature_flags` row (key + description) with a `Switch` that toggles `admin_set_feature_flag` optimistically and rolls back on error (toasting the mapped message). The mobile `Switch` primitive supplies its track/thumb colors from `useThemedTokens()` (RN `Switch` can't take a className).
- Mobile fetch hooks (`apps/mobile/lib/admin/use-admin-metrics.ts`, `use-feature-flags.ts`, `use-athlete-search.ts`): cancelled-ref `useEffect` pattern; the flags hook exposes an optimistic `toggle` and the search hook is debounced (300ms).
- Shared typed wrappers (`packages/shared/src/api/`): `getAdminMetrics` (`Result<AdminMetrics>`, new exported 8-key type), `listFeatureFlags` (`FeatureFlagRow[]`), `searchAthletes` (`AthleteSearchResult[]` = id/display_name/platform_role, `ilike` capped at 20) in `queries.ts`; `setPlatformRole` and `setFeatureFlag` (both `Result<void>`) in `mutations.ts`. New domain error codes + HINT mappings in `errors.ts` (`not_founder`, `last_founder`, `athlete_not_found`, `not_admin`).

**Admin: auto-founder bootstrap by email (jits-2uk.10, backend)**

**Added**
- `founder_allowlist` table + signup-trigger hook (`jr_be` migration `20260608010000_founder_allowlist.sql`) that auto-grants `platform_role='founder'` to seeded emails (`matthew.spon@gmail.com`, `tom_lum@hotmail.com`) at registration. **Spoof-proof:** gated strictly on the IdP-verified SSO provider (`raw_app_meta_data->>'provider' IN ('google','apple')`), NOT on `email_confirmed_at` (auto-set while `enable_confirmations=false`) nor the client-settable `raw_user_meta_data`. Email/password signups do not auto-grant. The allowlist is RLS-locked + `REVOKE ALL` (no client read/write); a one-time backfill covers a pre-existing SSO account. Regenerated `database.ts` for the new table. pgTAP `041` (10 assertions) including a negative-control proving a forged `raw_user_meta_data` provider is ignored. Note: a founder using Apple "Hide My Email" or email/password will not auto-grant and needs a manual `service_role` grant.

**TestFlight build 17 (2026-06-05): gym-owner portal shipped (mobile + backend)**
- Promoted the gym-owner portal to TestFlight as iOS build 17 (v0.1.0). Frontend epic jits-7xv (mobile-only): H1 hub, H2/H3 one-time sessions, H6/H7 roster + athlete detail, H8/H10 gym stats + ELO brackets, H9 gym ladder, all manager-gated behind a 5th "Gym" tab. Backend epic jits-iwd: 5 SECURITY DEFINER RPCs (`get_gym_roster`, `get_gym_athlete_detail`, `get_gym_stats`, `get_gym_stats_by_elo_range`, `get_gym_ladder`) deployed to the hosted Supabase (migration `20260605000000`). Deferred: H4/H5 documents (jits-4pk), H11 attendance/leads (jits-rsn). Follow-ups: gym-stats loss-time metric decision (jits-i8h), local pgTAP pollution cleanup (jits-nft).

**Mobile gym-owner portal: H9 gym ladder (epic jits-7xv.5, 2026-06-05)**

**Added**
- Gym Manager gym ladder screen (`apps/mobile/app/(app)/(tabs)/gym-manager/ladder.tsx`): H9 cross-gym ranking (gyms by avg member ELO) reached from the hub's "Gym Ladder" shortcut. A horizontal city filter chip row ("All Cities" + the cities present on the ladder) defaults to the manager's own gym city; a summary meta-line ("12 Partner Gyms · 90d") plus a right-aligned green "Your Gym #N · +12" callout when the own gym is in view. Each row shows a zero-padded rank, the gym name (+ "· You"), a mono-caps meta line (city · athletes · matches), and a right-aligned avg ELO + momentum arrow; the leader gets a Signal Red left rail and the manager's own gym a Gain Green left rail + tinted background. Pull-to-refresh; tapping a row opens the gym detail. The ladder is aggregate-only (not manager-gated), so it loads via the `getGymLadder` wrapper (no direct `.rpc()`); city filtering is client-side off the full row set for instant chip switching.
- `apps/mobile/lib/gym-manager/use-gym-ladder.ts`: cancelled-ref hook (W3-4 standard) keyed on the range that re-fetches on range change and follows the plain read style ([] on error) the aggregate-only ladder uses, unlike the `Result`-gated roster/stats hooks.
- `apps/mobile/components/gym-manager/ladder-row.tsx`: the H9 row, reusing the `DeltaNumber` elo-system primitive; all numeric values `font-mono` tabular-nums; Signal Red only for the leader rail, Gain Green for the own-gym rail, no drop shadows, 4px radius.
- `apps/mobile/lib/gym-manager/ladder-format.ts`: pure RN-free helpers (`formatGymMeta` with singular/plural + null-city handling, `deriveCities` distinct + case-insensitive sort, `formatLadderSummary`, `findOwnGym` 1-based rank lookup) shared by the screen + row.
- Tests: `apps/mobile/__tests__/lib/gym-manager/ladder-format.test.ts` (15 cases: meta-line join + singularization + null/blank-city drop, city dedupe/sort/trim, summary singularization, own-gym rank lookup + absent/undefined fallbacks).

**Fixed** (epic jits-7xv.5 review)
- Stopped the own-gym-city default from stranding the user on an empty ladder (`apps/mobile/app/(app)/(tabs)/gym-manager/ladder.tsx`): the city default now only applies when the manager's own gym city is actually present in the loaded ladder rows (gated on rows resolving, depends on `cities`); if the own gym is small/new and absent from `get_gym_ladder` (which only lists gyms with active members), the filter stays on "All Cities" instead of scoping to a city with no rows and no active chip. The empty-state copy now reads "No Gyms In {city}" under a city filter rather than the misleading "No Partner Gyms Yet".
- Unified momentum precision in the `getGymLadder` shared wrapper (`packages/shared/src/api/queries.ts`): the BE returns momentum as one-decimal NUMERIC, so the wrapper now rounds it to a whole number (`Math.round`), making the ladder row's `DeltaNumber` arrow and the "Your Gym #N" `formatMomentum` callout agree, matching how the H8 stats screen renders momentum. Added a wrapper test (`packages/shared/src/api/gym-portal.test.ts`).
- Wired up the dead range filter (`apps/mobile/app/(app)/(tabs)/gym-manager/ladder.tsx`): replaced the setter-less `const [range]` with a `RangeChips` control (30d/90d/all) reused from `stats-parts.tsx` for parity with the H8 stats screen, so the windows the hook + BE already support are now selectable instead of the UI implying a control that did not exist.

**Mobile gym-owner portal: H8 gym stats + H10 per-ELO bracket drill-down (epic jits-7xv.4, 2026-06-05)**

**Added**
- Gym Manager gym stats screen (`apps/mobile/app/(app)/(tabs)/gym-manager/stats.tsx`): H8 manager-gated aggregate dashboard reached from the hub's "Gym Stats" shortcut. A 30d/90d/all range chip row drives the whole screen; sections are Gym Rating (avg ELO hero + signed momentum), Submission Rate (big percent + two-segment split meter for submission vs time-expiry), Draws (draw rate + avg ELO on draw with a `Pressure Score` amber note), Winning/Losing Submissions (ranked share lists), Match Duration (avg win/loss finish-time tiles, green/red), and an ELO Trend sparkline. A full-width drill-down tile opens H10, seeding it with the current range.
- Gym Manager stats-by-ELO screen (`apps/mobile/app/(app)/(tabs)/gym-manager/stats-by-elo.tsx`): H10 per-ELO-bracket breakdown (1900+/1700–1900/1500–1700/1300–1500). Seeds its range from the H8 nav param, then owns its own chip toggle; a header meta-line totals athletes/matches/brackets. Each bracket renders as a card (range + tier label, athlete/match counts, six-cell stat grid, top winning/losing subs).
- `apps/mobile/lib/gym-manager/use-gym-stats.ts` + `use-gym-bracket-stats.ts`: cancelled-ref hooks (W3-4 standard) keyed on `(gymId, range)` that re-fetch on range change and map the `NOT_GYM_MANAGER` gating code onto an `isManager` flag for the not-authorized fallback. Load via the `getGymStats` / `getGymStatsByEloRange` wrappers (no direct `.rpc()`).
- `apps/mobile/components/gym-manager/stats-parts.tsx` (`SectionLabel`, `RangeChips`, `DrillDownTile`, `StatHero`, `RatePlate`, `SplitMeter`, `SubRankList`, `DurationGrid`), `gym-stats-trend.tsx` (a `react-native-svg`-free column chart of the running cumulative net-ELO change, newest column Signal Red), and `bracket-card.tsx`. Reuses the `Chip` and `DeltaNumber` elo-system primitives; all numeric values `font-mono` tabular-nums; Signal Red only for accent/negative, draws amber, no drop shadows, 4px radius.
- `apps/mobile/lib/gym-manager/stats-format.ts`: pure RN-free formatters (`formatRangeLabel`, `formatRangeSuffix`, `formatPct`, `formatFinishTime`, `formatMomentum`, `formatTierLabel`, `formatBracketRange`) shared by the screens + parts.
- Tests: `apps/mobile/__tests__/lib/gym-manager/stats-format.test.ts` (22 cases: range labels/suffixes, percent rounding + clamp + non-finite guard, m:ss finish-time formatting + em-dash for no data, aggregate `formatElo` rounding + non-finite guard, signed momentum with the unicode minus glyph, tier labels + bracket en-dash normalization).

**Fixed** (epic jits-7xv.4 review)
- Stopped coloring neutral numeric data Signal Red on the H8 stats screen (`apps/mobile/components/gym-manager/stats-parts.tsx`): the submission-rate headline (`RatePlate` `tone="accent"`) and the winning-submission `%` shares (`SubRankList` `variant="winning"`) now render in default foreground (`text-ink`), per the brand rule reserving Signal Red for CTAs/negative; the draw tile's `text-negative` stays as the sanctioned state-negative usage.
- Fixed the aggregate-ELO decimal leak: the BE returns avg-ELO / avg-ELO-on-draw / bracket avg-ELO as one-decimal NUMERIC, so a new `formatElo` helper (`apps/mobile/lib/gym-manager/stats-format.ts`) rounds them to whole numbers for display, matching the integer ELO shown everywhere else. Applied in `stats-parts.tsx` (`StatHero`), `stats.tsx` (avg ELO on draw), and `bracket-card.tsx` (bracket avg ELO).
- Unified H8 momentum rendering with the bracket cards: `StatHero` now passes `Math.round(momentum)` to `DeltaNumber` so a fractional momentum no longer leaks a raw decimal (the bracket cards already round via `formatMomentum`).
- Made the H10 bracket count + empty state meaningful (`apps/mobile/app/(app)/(tabs)/gym-manager/stats-by-elo.tsx`): the BE always returns all four fixed brackets, so the screen now filters to populated brackets (`athleteCount > 0 || matchCount > 0`) before rendering, totaling and counting off that filtered set. An empty gym now shows the "No Bracket Data Yet" empty state instead of four 0/0 cards and a "4 BRACKETS" line.

**Mobile gym-owner portal: H6 roster + H7 athlete detail (epic jits-7xv.3, 2026-06-05)**

**Added**
- Gym Manager roster screen (`apps/mobile/app/(app)/(tabs)/gym-manager/roster.tsx`): H6 active-member list reached from the hub's "Athletes" shortcut. Members are ordered by ELO DESC (BE order preserved), each row showing a circular avatar, name (+ "· You" for the signed-in manager), a mono meta-line (ELO · last-active · `PROVISIONAL` badge for < 20 matches), and a right-aligned stat block (current ELO + most-recent ELO delta). Pull-to-refresh; manager-gated with a "No Managed Gym" fallback. Loads via the new `getGymRoster` wrapper (no direct `.rpc()`).
- Gym Manager athlete detail screen (`apps/mobile/app/(app)/(tabs)/gym-manager/athlete/[id].tsx`): H7 manager-scoped member detail — hero ELO tile, four stat tiles (Matches, Record `W·L·D`, Win Rate, Peak ELO), an "ELO Trend · Last 10" sparkline, and the "Match History · Last 5" list (opponent + finish type + signed ELO delta). Resolves the managed gym via `useManagedGyms`; the display name is passed through the navigation param (the detail RPC does not echo it). Loads via `getGymAthleteDetail`; handles the `NOT_GYM_MANAGER`/`NOT_GYM_MEMBER` gating codes with distinct fallbacks.
- `apps/mobile/lib/gym-manager/use-gym-roster.ts` + `use-gym-athlete-detail.ts`: cancelled-ref hooks (W3-4 standard) that map the manager-gating `Result<T>` failure codes onto `isManager`/`notMember` flags so the screens can render the not-authorized path.
- `apps/mobile/components/gym-manager/roster-row.tsx`, `athlete-detail-parts.tsx` (`DetailHeader`, `StatTile`/`StatGrid`, `RecentMatchRow`, `SectionLabel`), and `elo-sparkline.tsx` — a `react-native-svg`-free column-chart sparkline scaled into a 48pt band (newest column Signal Red). Reuses the `Avatar32`, `DeltaNumber`, and `EloTile` elo-system primitives; all numeric values `font-mono` tabular-nums; no drop shadows.
- `apps/mobile/lib/gym-manager/roster-format.ts`: pure RN-free formatters (`formatLastActive`, `formatWinRate`, `formatFinish`) shared by the row + detail parts.
- Tests: `apps/mobile/__tests__/lib/gym-manager/roster-format.test.ts` (10 cases: last-active relative phrasing + no-match fallback, win-rate rounding + em-dash, submission vs time-decision finish labels).

**Mobile gym-owner portal: H2 sessions list + H3 create/edit (epic jits-7xv.2, 2026-06-05)**

**Added**
- Gym Manager sessions screen (`apps/mobile/app/(app)/(tabs)/gym-manager/sessions.tsx`): H2 sessions list reached from the hub's "Schedule" shortcut. All/Upcoming filter chips (no "Recurring" chip — recurring schedules are templates), one-time session rows, a top-right `+` and a sticky bottom "New Session" CTA. Reuses `getGymDetail` (already returns only `scheduled`/`active` sessions ending in the future, ascending) via the new hook — no new RPC. Manager-gated with a "No Managed Gym" fallback.
- `apps/mobile/lib/gym-manager/use-gym-sessions.ts`: loads gym name + manager flag + the session list with a cancelled-ref guard (W3-4 standard).
- `apps/mobile/components/gym-manager/session-edit-sheet.tsx`: H3 one-time create/edit bottom sheet (no recurrence UI). Session name, native date + time pickers (iOS spinner / Android `DateTimePickerAndroid`), 1h/2h/3h duration presets (end derived from start + duration), and max participants. Edits write through `updateSession`; "Delete Session" soft-cancels via `cancelSession` behind a confirm Alert. All mutations go through the `@jits/shared` typed wrappers and honor the `Result<T>` shape.
- `apps/mobile/components/gym-manager/session-row.tsx`: H2 row — mono day/time block, title + "One-time · May 16" sub-label, chevron (or LIVE pill for an active session); numeric values `font-mono` tabular-nums.
- `apps/mobile/lib/gym-manager/session-datetime.ts`: pure RN-free date/time helpers (`combineDateAndTime`, `addHours`, `durationHours`, `formatSessionRowParts`, `formatSessionRowDate`) shared by the edit sheet + row.
- Tests: `apps/mobile/__tests__/lib/gym-manager/session-datetime.test.ts` (11 cases: date/time combine, duration add/derive/round/floor, row label formatting).

**Fixed** (jits-7xv.2 adversarial review)
- `apps/mobile/components/gym-manager/session-edit-sheet.tsx`: editing a session no longer silently rewrites its end time. The edit sheet now tracks whether the manager actually moved the start or duration and only sends `scheduledStart`/`scheduledEnd` to `updateSession` when one of them changed; a title- or max-only edit (and any session whose real length isn't a 1/2/3h preset, e.g. a 4h or 90-minute session) keeps the row's true times instead of coercing the end to a rounded preset.
- `apps/mobile/components/gym-manager/session-edit-sheet.tsx`: the create/edit draft is now re-seeded every time the sheet opens (the trigger lives mounted for the screen's lifetime), so a "New Session" prefill can no longer go stale and land in the past. A client-side guard mirrors the backend "no sessions in the past" rule (now − 5min grace) and surfaces a clear toast instead of a raw Postgres error when a schedule write would start in the past.
- Tests: `apps/mobile/__tests__/components/gym-manager/session-edit-sheet.test.tsx` (3 cases: title-only edit omits schedule fields, duration change rewrites schedule, past-start schedule write is blocked with a toast).

**Mobile gym-owner portal: H1 hub + manager-gated tab (epic jits-7xv.1, 2026-06-05)**

**Added**
- Gym Manager tab + route group (`apps/mobile/app/(app)/(tabs)/gym-manager/_layout.tsx`, `index.tsx`): a fifth bottom-nav tab shown only to athletes who manage at least one gym. The H1 hub shows a next-session plate (live session, else soonest upcoming, with a "3H 14M"-style countdown + RSVP/cap meta), This-Month metric tiles (active athletes, matches), and shortcut tiles to Sessions, Athletes (Roster), Gym Stats, and Gym Ladder (Documents + Session Stats are toast placeholders for now). Reuses `getGymDetail` + `getGymManagerStats`; no new RPC.
- `apps/mobile/lib/gym-manager/use-managed-gyms.ts` (resolves the athlete's managed gym(s), gates the tab + drives the hub gym id), `use-gym-hub.ts` (loads the hub data with a cancelled-ref guard), `format-countdown.ts` (pure "3H 14M"/"2D 5H"/"0M" formatter with no 2-hour ceiling, unlike shared `formatTimeUntil`), and `components/gym-manager/hub-parts.tsx` (NextSessionPlate, MetricTile/Grid, ShortcutTile/Grid, SectionLabel; all data values `font-mono` tabular-nums, accent plate, no shadows).
- `getManagedGyms(supabase, athleteId)` + `ManagedGym` in `packages/shared/src/api/queries.ts`: typed read of `gym_managers` joined to `gyms` (name/city) for portal entry resolution.
- Tests: `apps/mobile/__tests__/lib/gym-manager/format-countdown.test.ts` (10 cases: minutes/hours/days/at-or-past-start).

**Changed**
- `apps/mobile/components/layout/elo-tab-bar.tsx`: honor a tab whose `tabBarButton` renders null (hidden-but-mounted), so the gym-manager tab stays hidden for non-managers.
- `apps/mobile/app/(app)/(tabs)/_layout.tsx`: register the gym-manager tab, gated on `useManagedGyms`.

**Mobile: shipped to TestFlight build 16 (v0.1.0, 2026-06-05)**

Promoted iOS build 16 to TestFlight (EAS build `ef5d54ec`, IPA `vymincKnhPtzSyt1pK7aLi`, auto-submitted to App Store Connect app `6774629438`, submission `9b36d53b`; remote build number auto-incremented to 16). Carries the match-flow recording fixes below (P0 `jits-ait` end-match-before-record and P1 `jits-zse` finish-time-required), both verified end-to-end in the iOS simulator against an automated realtime NPC opponent. Targets the current/staging backend (`EXPO_PUBLIC_APP_ENV=staging`), same as build 15; the production backend cutover remains the separate `jits-i1n` task. Quality gate green before build: typecheck (all workspaces), 401 tests (mobile 204, web 39, shared 158), iOS `expo export`. Tester "What to Test" note must be set in App Store Connect (EAS submit does not push it).

**Mobile match flow: fix two bugs that blocked recording a match result (jits-ait, jits-zse, 2026-06-05)**

**Fixed**
- (P0, jits-ait) The session match flow could never record a result or apply ELO. Tapping "End Match" called `end_match` (`apps/mobile/lib/match-flow/use-live-controls.ts`), which flips `matches.status` to `completed`; the very next step then called `record_match_result`, which hard-requires `status='in_progress'` and rejected the now-completed match with `invalid_status` ("Match is not in progress"). The match ended `completed` with `result=null` and **no ELO change for either athlete** (and a reload mapped `completed`→`summary`, skipping result/confirm entirely). `handleEnd` no longer calls `end_match`: it stops the local timer, broadcasts match-ended to the opponent, and advances to result entry; the match stays `in_progress` until `record_match_result` completes it (the `trg_release_session_participants` trigger still releases participants on the `in_progress`→`completed` transition). This brings the mobile flow into parity with the web session flow (`apps/web/.../steps/fighter-live-step.tsx`), which already goes start→record with no `end_match`. The `endMatch`/`end_match` wrapper is retained (with a regression-guard note in `packages/shared/src/api/mutations.ts`) for a future "abandon / no-result" path.
- (P1, jits-zse) A submission result with no finish time failed silently. `apps/mobile/components/match-flow/steps/result-step.tsx` `canSubmit` treated an empty finish time as valid (and `submission-fields.tsx` labeled the field "Finish Time (optional)"), but the BE `record_match_result` *requires* `finish_time_seconds` for a submission (`missing_fields`) — so "Record Result" was tappable with no finish time, fired the RPC, failed, and left the match stuck `in_progress` with only a "couldn't record" toast. `canSubmit` now requires a non-empty + valid finish time for submissions; the field label dropped "(optional)". Draw path and `isFinishTimeValid` (+ its 13 tests) unchanged. Web's form is unaffected (it pre-fills finish time with the elapsed match time).

**Verification**
- Both fixes verified **end-to-end in the iOS simulator** driving the real app (Nia Costa) against an automated realtime NPC opponent (Demo Red): weights → ready-check → live timer → End Match (match correctly stays `in_progress`) → record submission (ELO applied: winner +13 / loser −13) → confirm → "YOU WON". Also verified headless across in-session-challenge + random matchmaking and submission + draw outcomes (real RPCs through RLS). Filed `jits-27s` (P2): the confirm step can strand a user on "waiting for opponent to confirm" if the opponent's realtime confirmation broadcast is missed (works in the common two-live-athletes case; needs a design decision before fixing). Quality gate green: typecheck (all workspaces), mobile 204 tests.

**Mobile: shipped to TestFlight build 15 (v0.1.0, 2026-06-05)**

Promoted iOS build 15 to TestFlight (EAS build `7294749a`, IPA `f9CBAXH4XdH2VzUejtgdoe`, auto-submitted to App Store Connect app `6774629438`; remote build number auto-incremented to 15). Carries today's mobile QA + Design QA sweep (epic `jits-a8y`): the P0 presence-channel fix, all eight P1 fixes (`jits-a8y.2`–`.9`), and the six P2 correctness fixes (`jits-a8y.10`/`.11`/`.12`/`.14`/`.15`/`.21`). Quality gate green before build: typecheck (all workspaces), 401 tests (mobile 204, web 39, shared 158), iOS `expo export`. Targets the current/staging backend (`EXPO_PUBLIC_APP_ENV=staging`); the production backend cutover is the separate `jits-i1n` task. Tester "What to Test" note must be set in App Store Connect (EAS submit does not push it).

**Mobile QA + Design QA sweep: P0 + P1 fixes (epic jits-a8y, 2026-06-05)**

A 5-agent mobile-only review (3 functional QA, 2 design QA) surfaced 33 findings (filed under epic `jits-a8y`); the P0 and all P1 items were fixed, independently reviewed, and shipped green (typecheck all workspaces; mobile 192, web 39, shared 158 tests).

**Fixed**
- (P0, jits-a8y.1) Online presence was non-functional: `apps/mobile/lib/presence/use-online-presence.ts` subscribed to a per-mount topic `app:online:${mountId}`, so Supabase Presence never synced the athlete with anyone (each mount was alone on its own channel) and they never appeared in web's set. Now subscribes to the shared constant topic `"app:online"` with `presence.key = athleteId` (matching web); `mountId` is retained only as a stale-write guard in the `sync` handler. AppState foreground/background track/untrack and channel cleanup unchanged.
- (P1, jits-a8y.2) Waiver/TOS acknowledgement was silently dropped for every brand-new signup: `apps/mobile/lib/profile-setup/use-setup-submit.ts` `acceptTos()` only wrote `waiver_acknowledgements` when an athlete row already existed (a first-time user has none), and `submit()` never wrote it. `submit()` now performs an idempotent (check-then-insert; the table's unique key includes a NULL `session_id`, so NULLs-distinct means upsert/23505 cannot dedup) waiver-ack write against the resolved athlete id, mirroring web `eua-form.tsx`; `acceptTos()` made idempotent too. No trigger-guarded athlete columns are written.
- (P1, jits-a8y.3) Match summary showed a wrong post-match ELO: `apps/mobile/components/match-flow/match-step-renderer.tsx` computed `current_elo + eloDelta` while `current_elo` was already post-match (after `refresh()`), double-counting one delta. Now threads the authoritative `elo_before`/`elo_after` from the participant into `steps/summary-step.tsx` (no arithmetic); casual matches (NULL elo, delta 0) keep the no-tick single-tile behavior.
- (P1, jits-a8y.4) Live match had no back-navigation guard: iOS swipe-back / Android hardware-back could abandon an `in_progress` match (the visual back button was hidden but the gesture was live), orphaning it with no resume path. `apps/mobile/components/match-flow/match-flow-wizard.tsx` now reports the active step up via `onStepChange`; `apps/mobile/app/(app)/session/[id]/match/[matchId].tsx` blocks back via `usePreventRemove` + `Stack.Screen gestureEnabled:false` on the `live`/`end`/`result`/`confirm` steps (early/terminal steps stay navigable; the summary `router.replace` exits are unaffected).
- (P1, jits-a8y.5) A pending athlete who had already accepted TOS was trapped in the setup wizard with no exit (sign-out was wired only into the TOS step, which such a user skips). `apps/mobile/components/profile-setup/setup-wizard.tsx` now renders an always-available "Sign Out" tertiary on the identity/training steps (TOS keeps its own Exit), reusing the existing `signOut` + redirect.
- (P1, jits-a8y.6) Leaderboard ranks were renumbered after the gender filter: `apps/mobile/components/leaderboard/fighters-list.tsx` rendered `rank={index+1}` over the filtered array (a #14 male showed as #3) while the sticky "You" footer used the unfiltered rank and disagreed. Now renders the overall `item.rank` and sets the #1 styling from `item.rank === 1`.
- (P1, jits-a8y.7) Gym-detail fetch ignored its cancelled flag (the check sat in an empty `.then()`): `apps/mobile/app/(app)/(tabs)/gyms/[id].tsx` `fetchAll` now takes a live `isCancelled()` getter and gates every state setter, the error toast, and the `finally` loading setters on it, mirroring the canonical `use-session-for-join.ts` pattern. Pull-to-refresh (default `()=>false`) behaves identically.

**Changed (design system)**
- (P1, jits-a8y.8) Restricted Gain Green (`text-positive`) to genuine ELO increases only. Neutralized decorative green on count/rank data: Wins tile + `{wins}W` in `profile/stats.tsx`, `share-profile-sheet.tsx`, the Wins column in `athlete/head-to-head-card.tsx`, the winning side in `compare-stats-parts.tsx` (now `text-ink` vs `text-ink-3`), and the current-athlete rank in `ui/elo-system/rank-row.tsx`. Genuine rating-increase greens (match-card delta, `delta-number`, profile month delta) left intact.
- (P1, jits-a8y.9) Brought the error screen onto the brand system: `apps/mobile/components/error-boundary.tsx` now uses an ALL-CAPS `font-display` heading, `font-body`/`font-heading` (no system `font-medium`), and ELO tokens (`bg-surface`, `text-ink`/`text-ink-3`, `bg-cta`/`text-ink-on-cta`, `text-negative`, `border-hairline`) replacing legacy shadcn tokens; one primary CTA, sharp corners, no shadow, themes in light and dark.

**Fixed (P2 correctness follow-up, same epic)**
- (P2, jits-a8y.11) Unlocked Edit Profile: `apps/mobile/components/profile/account-section.tsx` now routes the Edit Profile row to `/profile-setup` (the setup hook auto-detects the editing path from the existing active athlete row, seeds values, and shows "Save Changes") instead of a dead "Coming soon" alert. The edit flow was already fully built, just unreachable.
- (P2, jits-a8y.10) Notification toggle now honors the mutation `Result`: `apps/mobile/app/(app)/settings/notifications.tsx` captures the prior value before the optimistic flip and, on a failed `updateNotificationPreferences`, reverts the toggle and shows an error toast (previously a failed save silently appeared to succeed).
- (P2, jits-a8y.12) Surface the IBJJF weight-division gap post-match: `apps/mobile/components/match-step-renderer.tsx` + `steps/summary-step.tsx` render an informational banner ("N weight class(es) apart, heavier athlete's ELO was adjusted") on the ranked summary when `weight_division_gap > 0`, sourced from the BE-stamped per-participant field (identical on both rows). Styled as a metadata/informational plate (surface-shift, mono tabular-nums, no decorative color), shown to both athletes; casual / zero-gap render nothing.
- (P2, jits-a8y.14) Validate finish-time against match duration: added a pure `isFinishTimeValid(input, durationSeconds)` helper in `apps/mobile/lib/match-flow/parse-finish-time.ts` (empty stays valid; non-empty must parse and be `<= duration`); `steps/result-step.tsx` folds it into `canSubmit` (disables the CTA on an over-duration/malformed time) and `steps/submission-fields.tsx` shows an inline hint. `parseFinishTime` itself unchanged. Added 13 tests (in-bounds, boundary, over-duration plain + mm:ss, unbounded `59:59`, malformed, empty/whitespace).
- (P2, jits-a8y.15) `apps/mobile/lib/session/use-session-lobby-realtime.ts`: the realtime INSERT handler now uses `.maybeSingle()` instead of `.single()`, so a joining athlete the viewer cannot read under RLS resolves to `null` (handled by the existing guard) rather than throwing an unhandled promise rejection.

**Changed (a11y)**
- (P2, jits-a8y.21) `apps/mobile/app/(app)/settings/index.tsx`: raised the settings nav rows (Notifications, Help, Video, Feedback, Sign out) to a 44px minimum touch target (`min-h-11`) without changing label size or layout.

**Mobile: close create/edit bottom sheets after a successful mutation (jits-f95, 2026-06-04)**

**Fixed**
- After creating a session (and likewise creating a gym, editing a gym, or saving a session template) the bottom sheet stayed open on success — the form just sat there after the "created" toast. Root cause: the submit handlers live in the component that renders `<Sheet>`, which sits above the `SheetContext` provider and so couldn't call `close()`.
  - `apps/mobile/components/ui/sheet.tsx`: added an imperative `controllerRef?: React.Ref<SheetController>` to `<Sheet>` (exposes `{ open, close }` via `useImperativeHandle`) so a parent can dismiss its own sheet.
  - `apps/mobile/components/session/create-session-sheet.tsx`, `components/gyms/create-gym-sheet.tsx`, `components/gyms/edit-gym-sheet.tsx`, `components/session/template-form-sheet.tsx`: hold a `sheet` ref, pass `controllerRef={sheet}`, and call `sheet.current?.close()` after the mutation succeeds (the sheet's content unmounts on dismiss, so the form also resets for next open).

**Mobile: fix top-right accessory sheets collapsing into a tiny corner box (jits-utl, 2026-06-04)**

**Fixed**
- Tapping a header right-action accessory (gym-detail Edit pencil, gym-list Create `+`, profile/athlete Share, Home notifications bell) rendered a tiny ~half-height box pinned to the top-right corner (just the drag handle visible) instead of a full-width bottom sheet. Root cause: `apps/mobile/components/ui/sheet.tsx` and `apps/mobile/components/notifications/notification-panel.tsx` used the **non-modal** `@gorhom/bottom-sheet` `<BottomSheet>`, which is rendered inline in the React tree and measures its immediate parent to compute the window height. Mounted inside `AppHeader`'s ~32px `rightAction` slot, the sheet sized itself to that slot — hence the collapsed corner box. Affected every sheet triggered from a constrained container, i.e. all top-right accessories.
  - `apps/mobile/components/ui/sheet.tsx`: converted the shared `Sheet` primitive to `<BottomSheetModal>` (portals into a root host, always measures the full window). `open()`/`close()` now map to `present()`/`dismiss()`. Consumers (`EditGymSheet`, `CreateGymSheet`, `CreateSessionSheet`, `TemplateFormSheet`, `ShareProfileSheet`) are unchanged — they only compose `<Sheet>` and inherit the fix.
  - `apps/mobile/components/notifications/notification-panel.tsx`: same non-modal → `<BottomSheetModal>` conversion (`expand()`/`close()` → `present()`/`dismiss()`).
  - `apps/mobile/app/_layout.tsx`: mounted `<BottomSheetModalProvider>` (from `@gorhom/bottom-sheet`) inside `GestureHandlerRootView` / `SafeAreaProvider`, wrapping the app screen tree, so the modal sheets have a full-screen portal host. `OfflineBanner` + `Toaster` stay above it so they stack over an open sheet.

**Mobile: fix dead back chevron on the gym detail (and other deep-link/reload entry routes) (jits-jg4, 2026-06-04)**

**Fixed**
- The gym-detail header's top-left back chevron did nothing when `/gyms/[id]` was the *entry* route (a full JS reload, a `/gyms/*` universal link, or OS state restoration), because the custom `AppHeader` calls `router.back()`, which silently no-ops when the stack has no screen to pop. No nested navigator declared an `initialRouteName`, so the deep screen was the only entry on its stack.
  - `apps/mobile/app/(app)/(tabs)/gyms/_layout.tsx`, `apps/mobile/app/(app)/_layout.tsx`, `apps/mobile/app/(app)/(tabs)/profile/_layout.tsx`: added `export const unstable_settings = { initialRouteName: ... }` anchors (`index` / `(tabs)` / `index`) so the list/tab navigator is always placed beneath the pushed detail screen (`gyms/[id]`, `athlete/[id]`, `session/[id]`, `settings`, `profile/stats`) — back then pops to a real parent even on deep-link/reload entry. No effect on the normal in-app push flow (the anchor is already the first screen there).
  - `apps/mobile/components/layout/app-header.tsx`: hardened the back chevron with a `router.canGoBack()` guard plus an optional `backFallback?: Href` prop — when there is genuinely no history to pop, it `router.replace(backFallback)` instead of being a dead button. `apps/mobile/app/(app)/(tabs)/gyms/[id].tsx` passes `backFallback="/gyms"` on both its headers (main + not-found) as the explicit safety net.

**Match flow: Ready-Check Cancel/Leave so a stuck athlete can abort cleanly (jits-3ie.1, 2026-06-04)**

**Added**
- `jr_be` migration `supabase/migrations/20260604000000_cancel_session_match.sql`: adds `cancelled` to the `matches.status` CHECK constraint and a `cancel_session_match(p_match_id uuid)` RPC (SECURITY DEFINER, `search_path=public`, granted to `authenticated`). A competitor may call it while the match is still `pending`; it verifies the caller is one of the two participants (`auth_athlete_id()`), marks the match `cancelled`, and RELEASES BOTH `session_participants` rows back to `status='available'` / `current_match_id=NULL` so neither athlete is stranded by the `create_session_match` in_match lock. Non-participant -> P0001/`not_participant`; non-pending match -> P0001/`invalid_status`; missing match -> P0001/`not_found`. DB test `supabase/tests/038_cancel_session_match_test.sql` (16 assertions) covers happy path (both released, match cancelled), non-participant rejection (state unchanged), in_progress rejection, and missing-match.
- `packages/shared/src/api/mutations.ts` (`cancelSessionMatch(supabase, matchId): Promise<Result<void>>`): thin wrapper over the RPC, errors mapped via `mapPostgrestError`. `packages/shared/src/api/mutations.test.ts` (4 cases) covers the call shape and `not_participant` / `invalid_status` / unknown error mapping.
- `apps/mobile/components/match-flow/steps/ready-step.tsx`: a "Cancel Match" SECONDARY destructive affordance (Signal-Red `text-negative` text button, below the primary Ready CTA, shown in both the pre-ready and "waiting for opponent" states). Confirms via `Alert` ("Cancel match? Your opponent will be returned to the lobby."), calls `cancelSessionMatch`, broadcasts `match_cancelled` on the match-sync channel, then routes back to `/(app)/session/[id]/lobby`. The opponent's ready step receives the broadcast via a new `onMatchCancelled` callback, shows a toast, and navigates itself back to the lobby. `sessionId` is now threaded through `apps/mobile/components/match-flow/match-step-renderer.tsx`.
- Web parity (minimal): `apps/web/app/(app)/session/[id]/match/[matchId]/steps/ready-check-step.tsx` gains the same "Cancel Match" ghost/Signal-Red secondary button (`window.confirm` -> `cancelSessionMatch` -> broadcast -> `router.replace` to lobby) plus the `onMatchCancelled` opponent handler; `sessionId` threaded through `match-flow-wizard.tsx`.

**Changed**
- `packages/shared/src/hooks/use-session-match-sync.ts`: added a `match_cancelled` broadcast event + `onMatchCancelled` callback and a `broadcastMatchCancelled()` sender. Regenerated `packages/shared/src/types/database.ts` (`db:types`) now includes `cancel_session_match`.

**Shared: stop the "Realtime send() falling back to REST" warning on broadcast (jits-3ie.6, 2026-06-04)**

**Fixed**
- `packages/shared/src/hooks/use-session-match-sync.ts`, `use-match-sync.ts`, `use-lobby-sync.ts`: fire-and-forget broadcasts fired before the channel finished JOIN (`!canPush()`), tripping realtime-js's "send() is automatically falling back to REST API… use httpSend() explicitly" warning. Each hook now tracks the `SUBSCRIBED` status (via the `subscribe` status callback) and routes broadcasts through the websocket `send()` once joined, or the explicit `channel.httpSend(event, payload)` REST path before join. Delivery is unchanged for subscribers; the warning is gone.
- `apps/mobile/components/session/wizard/confirm-step.tsx`: the one-shot `participant_joined` broadcast on a transient channel now uses `channel.httpSend(...)` directly instead of `subscribe()` + `send()` (no JOIN wait, no warning).
- Tests: `use-session-match-sync.test.ts` and `use-lobby-sync.test.ts` mocks now model the `subscribe` status callback + `httpSend`, with new cases asserting pre-join broadcasts use `httpSend` and post-`SUBSCRIBED` broadcasts use `send`. Shared suite green.

**Mobile: chunked SecureStore adapter, kill the ">2048 bytes" auth-token warning (jits-3ie.7, 2026-06-04)**

**Changed**
- `apps/mobile/lib/supabase/secure-storage.ts` (`SecureStoreAdapter`): the Supabase auth session (access + refresh token + user metadata) serialized to one expo-secure-store key crosses the native ~2048-byte soft limit, producing a persistent "Value being stored in SecureStore is larger than 2048 bytes…" runtime warning. The adapter now CHUNKS on the native (iOS/Android) path: `setItem` splits the value into ≤2000-byte UTF-8 chunks (split on code-point boundaries, never mid-character) across `${key}.0`, `${key}.1`, …, writes the chunk count to `${key}.meta` last, and deletes any leftover higher-index chunks from a previously longer value (so token rotation orphans nothing). `getItem` reads the count and reassembles every chunk in order, returning the complete session string (or null if absent or if any chunk is missing, never a partial session). `removeItem` deletes all chunks + the meta key. The web/`localStorage` branch is unchanged. MIGRATION: a legacy single-key value (no meta) is read through by `getItem` so existing signed-in users are not logged out, and the next `setItem` re-chunks and removes the legacy key. Cold-start contract preserved: still a pure drop-in async adapter with the same `getItem`/`setItem`/`removeItem` interface the client consumes; `client.ts` `processLock` + the synchronous `onAuthStateChange` in `auth-context.tsx` (fix 322039e) are untouched, and `getItem` resolves with the full value so the auth gate cannot wedge on a partial read.

**Added**
- `apps/mobile/__tests__/lib/supabase/secure-storage.test.ts` (10 cases): >2KB round-trip with exact reassembly, per-chunk ≤2048-byte assertion, multi-byte (emoji) code-point-boundary round-trip, small/empty values, `removeItem` clears all chunks + meta + legacy key, token-rotation orphan cleanup, legacy single-key migration, missing-chunk returns null, and async-API contract. Targeted mobile typecheck clean; suite green (10/10).

**Shared: fix gym-list "LIVE" vs gym-detail "No Sessions" dead-end (jits-3ie.2, 2026-06-04)**

**Fixed**
- `packages/shared/src/api/queries.ts` (`getGymsWithSessions`): the gym LIST flagged a gym LIVE on `status='active'` alone, while the gym DETAIL (`getGymDetail`) only surfaces sessions with `scheduled_end > now`. A gym whose only active session had already ended therefore showed "LIVE / N in lobby" on the list but "No Sessions Scheduled" in detail (a dead end). Now the list applies the same rule as detail: `status='active' AND scheduled_end > now`. Added `scheduled_end` to the sessions select and gated the active/`hasActiveSession` determination on it, using the identical ISO-string `now` basis (`new Date().toISOString()`) that detail compares against. Both web and mobile consume this query, so both inherit the fix. Added `packages/shared/src/api/queries.test.ts` (4 cases) covering past-end (not LIVE), future-end (LIVE), mixed, and upcoming-scheduled. Targeted typecheck + shared suite green (149 tests).

**Mobile: shipped to TestFlight build 13 (v0.1.0, 2026-06-03)**

Promoted iOS build 13 to TestFlight (EAS build `9951131e`, auto-submitted to App Store Connect app `6774629438`; remote build number 12 → 13). Carries all three of the day's mobile fixes: tap-through icons, un-clipped JetBrains Mono numbers, and the cold-start "Loading…" auth-lock hang. Quality gate green before build: typecheck (all workspaces), 366 tests, iOS `expo export`. Tester "What to Test" note (add: first-open no longer stuck on "Loading…") must be set in App Store Connect; EAS submit does not push it.

**Mobile: fix intermittent cold-start hang on the "Loading…" screen (Supabase auth lock, 2026-06-03)**

User-reported: first open often stuck on a light "Loading…" screen until a force-quit + reopen. Root cause: supabase-js 2.105.4 on React Native has no `navigator.locks`, so auth-js fell back to a no-op lock — the mount-time `getSession()`, the `autoRefreshToken` timer, and the `INITIAL_SESSION` emission raced on the stored session and intermittently stalled the auth gate (`isLoading` never flipped false, so `app/index.tsx` sat on "Loading…" forever). The old `onAuthStateChange` callback also `await`ed a DB query inside the callback (a deadlock footgun once a real lock is active).

**Fixed**
- `apps/mobile/lib/supabase/client.ts`: added `lock: processLock` to the auth config (the required React Native setting; serializes concurrent session access, and its 5s `lockAcquireTimeout` means a stalled storage read now rejects instead of hanging the gate).
- `apps/mobile/lib/auth/auth-context.tsx`: made the `onAuthStateChange` callback synchronous (no awaited Supabase calls inside the lock) and moved the athlete-guard fetch into a separate effect keyed on `user.id`, which runs outside the lock. `isLoading` still gates on the first athlete fetch, so an active athlete never flashes the profile-setup redirect. Relies on auth-js emitting `INITIAL_SESSION` for cold-start hydration (verified in the installed version). Independent review confirmed no deadlock path and `isLoading` reaches false on every route. Quality gate green: typecheck, 366 tests, iOS `expo export`.

**Mobile: shipped to TestFlight build 12 (v0.1.0, 2026-06-03)**

Promoted iOS build 12 to TestFlight (EAS build `e7a2ef8f`, auto-submitted to App Store Connect app `6774629438`; remote build number 11 → 12). Bundles the two mobile fixes below: tap-through icons inside buttons, and un-clipped JetBrains Mono numbers. Quality gate green before build: typecheck (all workspaces), 366 tests, iOS `expo export`. Tester "What to Test" note (icons now tappable + numbers no longer clipped) must be set in App Store Connect; EAS submit does not push it.

**Mobile: fix vertical clipping of JetBrains Mono numbers (lineHeight too tight, 2026-06-03)**

User-reported: big ELO numbers and stat-tile digits ("1000", "0", "0%") were cut off top and bottom on Profile, Rankings, and Athlete screens (and historically Home). Root cause: hand-rolled numeric `<Text>` set `lineHeight` ≈ `fontSize` (1.0–1.09x), and iOS crops the glyph to the line box. The shared `EloTile` primitive already used the correct `fontSize * 1.1`, which is why Home stopped clipping.

**Fixed**
- Bumped `lineHeight` to ~1.2x `fontSize` on every clipping numeric display (12 spots / 10 files): `components/profile/{profile-header,profile-quick-stats}.tsx`, `components/athlete/{competitor-header (x3),head-to-head-card}.tsx`, `app/(app)/(tabs)/profile/stats.tsx`, `components/ui/elo-system/{rank-row,delta-number}.tsx`, `components/share-profile-sheet.tsx`, `components/match-flow/steps/timer-display.tsx`, `components/session/wizard/weight-step.tsx`. Only `lineHeight` changed (fontSize/letterSpacing untouched). Left the already-correct `EloTile` (1.1x) and the tuned splash animation alone. Quality gate green (typecheck + 366 tests).

**Mobile: fix icons swallowing taps inside buttons (SVG hit-test fall-through, 2026-06-03)**

User-reported: bottom-tab icons felt dead, the header back arrow had a "tiny/weird hit radius", and the profile share arrow appeared to do nothing. Root cause: `lucide-react-native` icons render as `react-native-svg`, which hit-tests against the drawn path; a tap landing on the icon's pixels was consumed by the SVG (no `onPress`) instead of bubbling to the parent `Pressable`, so only taps on empty space inside the button registered. The prior touch-target sweep added `hitSlop`/pressed-states but did not address this.

**Fixed**
- Wrapped every decorative icon that sits inside a touchable in `<View pointerEvents="none">` so the tap always falls through to the button. 21 sites across 20 files: `components/layout/{elo-tab-bar,app-header}.tsx`, `components/notifications/{notification-bell,notification-item}.tsx`, `components/session/{session-actions,session-templates,template-card,join-wizard}.tsx`, `components/session/lobby/participant-row.tsx`, `components/profile/account-section.tsx`, `components/auth/auth-form-field.tsx`, `components/share-profile-sheet.tsx`, `components/match-flow/steps/{live-controls,summary-step}.tsx`, `app/(app)/athlete/[id].tsx`, `app/(app)/(tabs)/{gyms/index,gyms/[id],profile/index}.tsx`, `app/(app)/session/[id]/lobby.tsx`, `app/(app)/settings/index.tsx`. Layout unchanged (wrapper shrinks to the icon; Text siblings untouched). Quality gate green (typecheck all workspaces, 366 tests).

**Mobile: leaderboard real-data + navigation + app-wide touch-target/UX polish, shipped to TestFlight build 11 (PR #27, 2026-06-03)**

Merged PR #27 to `development` and promoted iOS build 11 (v0.1.0) to TestFlight (EAS build `fa149447`, auto-submitted to App Store Connect app `6774629438`). Net of three reviewer-agent SHIP passes; quality gate green (typecheck, 366 tests, `expo export`).

**Changed**
- `apps/mobile/components/leaderboard/fighters-list.tsx`, `lib/leaderboard/use-leaderboard-data.ts`: every fighter row + the sticky "You" row now navigate to the athlete profile; removed the FABRICATED ELO trend/delta (was `current_elo` vs `highest_elo` rendered as fake green/red) — rows show a neutral `—`. Rank/ELO/name/gym/gender remain real; a real per-row 30-day delta needs a backend RPC (`jits-4zp.11`).
- `apps/mobile/app/(app)/athlete/[id].tsx`: profile header shows the athlete's name instead of the literal "ATHLETE".
- `apps/mobile/components/ui/elo-system/delta-number.tsx` + web twin: flat placeholder renders a clean `—` (not `— 0`).
- **App-wide touch-target / hit-area + pressed-state sweep** (from a multi-agent audit of all 102 mobile tappables, 60 substandard): primitives `components/ui/button.tsx`, `select.tsx`, `native-select.tsx`, `tabs.tsx`, `elo-system/{participant-row,rank-row,chip}.tsx`, `dialog.tsx`, plus `layout/{app-header,elo-tab-bar}.tsx` and ~24 per-site controls across auth, dashboard, gyms, session/match-flow, profile, settings — all now ≥44pt effective (hitSlop), with reactive `active:` pressed feedback and icon-button accessibility labels. Reactive press states only (no animation). Closes `jits-4zp.1`, `jits-4zp.5`; advances `jits-4zp.6`/`jits-4zp.10`.

**Research: app-wide safe UI/UX polish backlog (jits-4zp, 2026-06-02)**

10-agent audit (8 per-surface scanners + a safety/design critic + a synthesizer) for high-value, client-only, design-system-compliant UI/UX wins that need no backend and no new EAS build, excluding FTUE (jits-r75). No feature code; analysis + tracked work.

**Added**
- `research/013-ux-polish-backlog.md`: 8 prioritized items (4 P1: tappable leaderboard rows, non-red live timer, dead web filter chips + fabricated deltas, branded toasts; plus touch-target/a11y/haptics/red-number sweeps) + 2 deferred P3 batches. Filed as epic `jits-4zp` with 10 children; recommends three batched PRs (hitSlop, a11y labels, design-system numeric/color).

**Research: First-Time User Experience (FTUE) discovery + prioritized roadmap (jits-r75, 2026-06-02)**

Multi-agent discovery (recon both platforms + external best-practice research + a 4-expert consensus panel with an adversarial critic) into the new-user journey from first open to activation. No feature code; deliverable is analysis + tracked work.

**Added**
- `research/012-ftue-discovery-roadmap.md`: the report. Defines the aha moment (first ranked match that moves ELO off 1000) and the instrumentable activation milestone, maps current time-to-value and friction with `file:line` cites, and gives a prioritized roadmap (9 client-only quick wins, 3 medium, 4 bigger bets) with sequencing and open questions. Filed as epic `jits-r75` + 15 children; Apple Sign In cross-referenced to existing `jits-rag`.

**Mobile: Sentry user feedback (shake-to-report + screenshot) for the wider TestFlight rollout (jits-rls, 2026-06-02)**

Finishes the mobile Sentry wiring and turns the existing text-only feedback box into an impactful, screenshot-backed flow that lands in Sentry, where it can drive AI triage (the connected Sentry MCP reads it; Seer can analyze). Decision: Sentry-native User Feedback over a third-party SDK or a custom build (tightest AI loop, no new vendor; tradeoff: the RN form is screenshot-attach only, no freehand annotation). Mobile only. Uses the SDK's built-in shake + screenshot, so no `expo-sensors`/`react-native-view-shot` added.

Shipped as iOS v0.1.0 **build 10** to TestFlight (2026-06-02, EAS build `4a6836c9`, commit `3ea3f9c`). Verified before shipping with a local iOS Release build: the embedded Release bundle (`__DEV__` false, Sentry enabled) launched clean, so `Sentry.init`/`feedbackIntegration`/`Sentry.wrap` run on the release path without the launch crash that hit builds 3-4. Build 10 ships **without** source maps (the `SENTRY_AUTH_TOKEN` was added to EAS after it started); source-map upload activates automatically from the next build (`app.config.js` adds the `@sentry/react-native/expo` plugin once org+project+token are all on EAS).

**Added**
- `apps/mobile/lib/error-tracking/sentry-user-bootstrap.tsx`: side-effect component (mounted in `app/_layout.tsx` alongside the other bootstraps) that keeps Sentry's user context (`id`/`email`/`display_name`) in sync with the signed-in athlete so reports are attributed and the feedback form prefills name/email; clears on sign-out. No-ops until Sentry is initialized.

**Changed**
- `apps/mobile/lib/error-tracking/sentry.ts`: `Sentry.init` now sets `attachScreenshot`/`attachStacktrace` and registers `Sentry.feedbackIntegration({ enableShakeToReport, enableTakeScreenshot, ... })` with on-brand dark styling (Signal Red submit, 4px corners, no Sentry branding). Name/email prefill comes from the Sentry user scope (`setSentryUser()` sets `name` + `username`), NOT the `useSentryUser` option, whose values are used verbatim in 8.11.1 and would have prefilled the literal strings `"email"`/`"username"`. New exports: `isSentryEnabled()`, `showFeedback()` (opens `Sentry.showFeedbackForm()`), `setSentryUser()`/`clearSentryUser()`.
- `apps/mobile/app/_layout.tsx`: root is now wrapped in `Sentry.wrap()` (required: `Sentry.wrap` mounts the feedback form provider, so the shake/manual form can render) and mounts `<SentryUserBootstrap />`.
- `apps/mobile/app/(app)/settings/index.tsx`: the FEEDBACK row opens the Sentry feedback form when Sentry is live (falls back to the existing `/settings/feedback` text screen otherwise); added a tip that shaking the phone reports a bug. The legacy Supabase `feedback.tsx` screen is preserved as the no-DSN fallback.
- `apps/mobile/app.config.js`: conditionally appends the `@sentry/react-native/expo` config plugin only when `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` are all present (the plugin only adds build-time source-map/dSYM upload; the native SDK is autolinked regardless). Requiring the token too means a credential-less build never attempts a (failing) upload. Keeps all secrets/slugs in the environment, nothing in the repo.
- `apps/mobile/.env.example`: documented the runtime `EXPO_PUBLIC_SENTRY_DSN` and the optional build-time `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` (source-map upload).
- `apps/mobile/lib/error-tracking/sentry.ts` + `apps/mobile/app.config.js`: the DSN and `APP_ENV` are now baked into the config manifest (`extra.SENTRY_DSN`/`extra.APP_ENV`) and read from `Constants.expoConfig.extra` first, with a `process.env.EXPO_PUBLIC_*` fallback. Same hardening as `lib/env.ts`: relying on `EXPO_PUBLIC_*` Metro inlining alone silently dropped values from release bundles (builds 3-4), which would have made Sentry no-op on TestFlight.
- `apps/mobile/eas.json`: the `production` build profile now tags Sentry `environment: staging` (`EXPO_PUBLIC_APP_ENV` = `staging`) so the wider TestFlight rollout reports into a non-production Sentry bucket, separate from real users. The EAS `environment: production` scope is unchanged, so production Supabase creds still inject and TestFlight keeps using the production backend. Flip `EXPO_PUBLIC_APP_ENV` back to `production` at the real App Store launch.

**Mobile: native signup pickers, required city, free-agent in gym dropdown (2026-06-02)**

Aligning the native signup flow with web ahead of the first test invite, and replacing the custom bottom-sheet dropdowns with true platform pickers. Shipped as iOS v0.1.0 build 8 to TestFlight (2026-06-02, EAS build `fbfd3a59`).

**Added**
- `apps/mobile/components/ui/native-select.tsx`: reusable native option picker (built on `@react-native-picker/picker`), a pressable field that opens a modal with the native wheel (iOS) / control (Android) and a Done button. A leading placeholder row (value `""`) keeps an un-scrolled "Done" from silently committing a value (no pre-selection). Replaces the custom bottom-sheet `Select` for the gym and city fields.
- Dependencies `@react-native-community/datetimepicker`, `@react-native-picker/picker` (SDK 54 pinned); `apps/mobile/app.json`: added the datetimepicker plugin.

**Changed**
- `apps/mobile/components/profile-setup/date-of-birth-picker.tsx`: replaced the three custom month/day/year dropdowns with native `@react-native-community/datetimepicker` (iOS spinner / Android dialog). Enforces 16+ via `maximumDate`; a `touched` guard stops "Done" from silently committing the default date.
- `apps/mobile/components/profile-setup/training-step.tsx`: gym is now a native picker with "Free agent (no gym)" folded in as a sentinel option (no pre-selection, user must actively pick a gym or free agent), replacing the separate `Switch`. City is now a **required** native picker sourced from active gyms' cities (auto-filled when a gym is chosen). Training is the final wizard step.
- `apps/mobile/lib/profile-setup/{validation.ts,use-setup-submit.ts,use-setup-data.ts}`, `components/profile-setup/{setup-wizard.tsx,types.ts}`: city is required and always written (never null); `free_agent` derived from the gym sentinel (removed the `freeAgent` field from `WizardValues`); added a distinct/sorted `cities` list to the setup bootstrap.

**Removed**
- `apps/mobile/components/profile-setup/optional-step.tsx` and the `skipOptional` path (city moved into the required Training step).
- Sign in with Apple: it was implemented (auth-context + login + signup, `expo-apple-authentication`) but removed before shipping because the package injects the `com.apple.developer.applesignin` entitlement and the App ID's provisioning profile does not support it yet. The full implementation is preserved in commit `844b16d`; re-enable is tracked in jits-rag.

**Web: capture athlete weight in pounds to match the backend canonical unit (jits-7ry, 2026-06-02)**

The backend stores `athletes.current_weight` in pounds (`get_weight_division()` hard-codes IBJJF division boundaries in lbs), but web labeled the field "kg", validated 20-300, and wrote the raw number into the lbs column, so web-created weights were ~2.2x off and corrupted weight-division / ELO-stakes math. Mobile already stored lbs.

**Fixed**
- `apps/web/lib/profile-setup/signup-form-validation.ts`, `components/sign-up-form.tsx`, `components/auth/eua-form.tsx`, `app/(auth)/eua/page.tsx`, `app/(app)/profile/edit/{edit-profile-form.tsx,edit-profile-content.tsx}`, `app/(app)/profile/profile-hero.tsx`, `components/domain/compare-stats-modal.tsx`: relabeled weight inputs kg -> lbs, widened validation to 50-400 (matching mobile), with no conversion math (the raw value was always written to the lbs column). Renamed `weightKg` -> `weight` and `isWeightKgValid` -> `isValidWeight` across web consumers. Existing web-created rows still need a one-time data backfill (tracked in jits-1qj).

**Mobile: adopt the "Podium Tiers" (B3-11) app icon (2026-06-01)**

**Changed**
- `apps/mobile/assets/icon.png` + `apps/mobile/assets/adaptive-icon.png`: replaced the red "F" monogram with concept B3-11 "Podium Tiers" (from `design/icon-options/batch3/svg/theme4-ascend-b.svg`): three ascending podium tiers (Void → gray → Signal Red) on a `#0D0F14` Void field, with a gold breakthrough cap and a knocked-out up-arrow crowning the winner tier. Rendered to 1024×1024 via `rsvg-convert` and flattened to opaque RGB (no alpha) for App Store compliance.
- `apps/mobile/app.json`: Android `adaptiveIcon.backgroundColor` `#bf1212` -> `#0D0F14` to match the new icon's Void field (was tuned for the old red mark). Requires a native rebuild to take effect.

**Mobile: dark theme by default (2026-06-01)**

**Changed**
- `apps/mobile/app/_layout.tsx`: call NativeWind's `colorScheme.set("dark")` at module scope (before first paint) so the app is dark-first instead of following the OS scheme (which defaulted light). A stored user preference is still re-applied at launch by `ThemeProvider`'s `restore()`.
- `apps/mobile/tailwind.config.js`: `darkMode` `"media"` -> `"class"`. Required so NativeWind's `setColorScheme()` works: under `"media"` it throws, which silently broke `ThemeProvider`'s `restore()` and the profile Light/Dark/System toggle (they had never actually worked). The app uses no `dark:` variants, so the change is invisible to rendering but makes the in-app theme toggle functional and the dark default reversible. Verified on the simulator: default launch is dark, a stored "light" preference is honored, and switching themes no longer throws.

**Mobile: smooth "The Statement" launch splash hand-offs (2026-06-01)**

A screen recording showed two ungraceful seams in the launch sequence: after the native F-logo splash dissolved there was a ~150ms dead-black gap before "WE ARE" appeared, and at the end the statement vanished in a single hard-cut frame straight to the home screen. The reduced-motion fallback also popped the statement in at full opacity.

**Changed**
- `apps/mobile/components/ui/elo-system/splash-statement.tsx`: the overlay now cross-dissolves into the live app underneath (new `farewell` shared value drives the whole overlay's opacity 1->0 over `FADEOUT_MS`) instead of unmounting on a hard cut. `onDone()` now fires from the fade's completion callback (via `runOnJS`), in both the full-motion and reduced-motion paths. The outer overlay is now an `Animated.View` so its Void backdrop fades with it. Reduced-motion now fades the resting frame IN via a new `intro` (text-group opacity) value — opacity only, no transform/scale/glow motion — then dwells and cross-fades out, instead of popping in.
- `packages/shared/src/constants.ts` (`SPLASH_STATEMENT`): shifted the whole choreography 100ms earlier (`WEARE_DELAY_MS` 250->150, `IGNITE_DELAY_MS` 430->330, `AREYOU_DELAY_MS`/`HAPTIC_DELAY_MS` 1180->1080) so "WE ARE" rises right as the native splash finishes dissolving, closing the dead-black gap while preserving the internal rhythm; added `FADEOUT_MS: 300` for the dissolve; `TOTAL_MS` 2140->2040 now marks when the fade-out begins (onDone fires `FADEOUT_MS` later); added `REDUCED_MOTION_FADEIN_MS: 260` and set `REDUCED_MOTION_HOLD_MS` to 700 (readable dwell before the reduced-motion cross-fade).

**Mobile: fix TestFlight launch crash from missing Supabase env (2026-06-01)**

Production/TestFlight builds 0.1.0 (3) and (4) crashed ~400ms after launch with `EXC_CRASH (SIGABRT)`: a native TurboModule exception (`ObjCTurboModule::performVoidMethodInvocation -> objc_exception_rethrow -> std::terminate`). Root cause recovered by reproducing the crash in a local Release simulator build: `lib/env.ts` threw `Missing env var: EXPO_PUBLIC_SUPABASE_URL` at module-load (read by `lib/supabase/client.ts` during expo-router boot); RN surfaced it via `ExceptionsManager.reportException` (a void TurboModule method) which rethrew uncaught -> abort. The Supabase URL/anon key were not embedded in the release JS bundle (confirmed: 0 occurrences in build 4's `main.jsbundle`). Debug builds were unaffected because Metro inlines `.env` at serve-time; release bundles need the value baked in at build-time.

**Added**
- `apps/mobile/app.config.js`: dynamic Expo config that reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the build environment and writes them to `extra` (`SUPABASE_URL` / `SUPABASE_ANON_KEY`), which `lib/env.ts` reads first and which is embedded via the config manifest, independent of the flaky `EXPO_PUBLIC_*` Metro inlining. Fails the EAS build loudly (throws) when a required var is missing instead of shipping a binary that crashes on launch. Preserves the full `app.json` config (incl. `extra.eas.projectId`).
- `apps/mobile/__tests__/lib/env.test.ts`: guards the resolution order `extra` -> `process.env.EXPO_PUBLIC_*` -> clear throw.

**Changed (EAS infra, not in repo)**
- Consolidated the duplicate-named EAS environment variables `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (previously a `production`-only var plus a separate `preview,development` var of the same name) into a single var each spanning `production, preview, development` (PUBLIC) -- structurally identical to the `EXPO_PUBLIC_GOOGLE_*` vars, which were injecting correctly. The duplicate-named variables are the most likely reason EAS skipped injecting the Supabase values into the build. Values are kept in the EAS environment only (the repo's secret-scan hook intentionally blocks committing the anon-key JWT).

**Web: App Icon Concepts design section (2026-06-01)**

**Added**
- `apps/web/app/design/app-icon-concepts/page.tsx`: new design-system section, a gallery of 18 candidate ELO RATED app-icon concepts grouped into six creative territories (E / rising-rating chart, typographic monogram, BJJ belt, grappling lock, rating climb, brutalist "Statement"). Server component, data-array driven, mirrors `style-guide/page.tsx` conventions; each icon shown under an iOS-style `rounded-[22%]` mask to preview how it reads as a home-screen icon.
- `apps/web/public/design/icons/team{1-6}-*.svg`: the 18 concept SVGs (vector, full-bleed 1024×1024, flat-color brand palette), copied from the working set at `design/icon-options/svg/`.
- `design/icon-options/`: working directory for the icon exploration (18 source SVGs, rendered PNGs, rounded previews, `contact-sheet.png`, `home-preview.png`, and `BRIEF.md`).

**Changed**
- `apps/web/app/design/layout.tsx`: added an "App Icons" tab to the design-system nav.
- `apps/web/app/design/page.tsx`: added an "App Icon Concepts" card to the design overview grid.
- `apps/web/app/design/app-icon-concepts/page.tsx`: now data-driven from a generated `icons.data.ts` module (rather than a hand-written array) so the gallery can be regenerated by rerunning the workflow; each tile now also shows the concept caption.

**Added (icon-generation workflow + batches)**
- `.claude/workflows/generate-app-icons.js`: reusable multi-agent workflow that generates 18 app-icon SVGs across 6 themes (one designer per theme, 3 distinct SVGs each), then an *independent* curator per theme renders, validates, brand-scores (1-5), and repairs any broken SVG. Parameterized by `batch` (and optionally `themes`) via `args`; output goes to `design/icon-options/<batch>/`.
- `design/icon-options/batch1/` + `batch2/`: the two icon batches so far, each a normalized working dir (`svg/`, `manifest.json` with `batch`/`num`/`label`/`date`/`themes`/`icons`). Batch 2 also has rendered PNGs + `contact-sheet.png`.
- `design/icon-options/build-registry.py`: idempotent, additive generator. Scans every `batch*/manifest.json`, copies each batch's SVGs to `apps/web/public/design/icons/<batch>/`, assigns each icon a stable stakeholder ID (`B<num>-NN`, numbered in theme-display order), sanitizes banned em-dashes out of concept text, and regenerates `icons.data.ts`. Rerunning after a new workflow batch appends it as a new section; nothing is removed.
- `design/icon-options/finalize-batch.py`: promotes a staged workflow run (`design/icon-options/_incoming/svg/`) into the next `batch<N>/` (moves SVGs, writes its `manifest.json` from the workflow result, runs `build-registry.py`). Makes reruns one safe command.
- `design/icon-options/batch1/` + `batch2/` + `batch3/`: the three icon batches (Foundations / Themed Territories / Round 3), each a normalized working dir (`svg/`, `manifest.json`); batches 2 and 3 also have rendered PNGs + `contact-sheet.png`.
- `apps/web/app/design/app-icon-concepts/icons.data.ts` (auto-generated) + `apps/web/public/design/icons/batch{1-10}/*.svg`.
- Ten batches (180 icons): B1 Foundations, B2 Themed Territories, B3 Round 3; subject themes B4 Grappling, B5 Wrestler, B6 Historic Gods; and radical-style explorations B7 Monoline, B8 Glossy Gradient, B9 Retro Pixel, B10 Vintage Crest. Themed/style batches were generated by per-run workflow variants (`design/icon-options/_workflows`-style scripts) that override the flat-brutalist brief; each ran a designer-then-independent-curator pass that renders, scores, and repairs every icon.

**Changed (accumulating, ID-labeled gallery)**
- `apps/web/app/design/app-icon-concepts/page.tsx`: an accumulating, multi-batch gallery. Renders `BATCHES`; the Foundations batch is pinned at the top as the reference set and every other batch follows newest-first. Each batch is its own dated `<section>` (batch number + label + formatted date + icon count + ID range) above its six theme sub-groups laid out in a 2-3 column grid of theme blocks. Icons render as compact ~96px tiles; each tile shows a stable ID chip (e.g. `B2-07`), the name, and an optional `QA n/5` curator score, with the full concept on hover. Ten batches preserved (180 icons).
- `.claude/workflows/generate-app-icons.js`: output now defaults to a neutral `_incoming/` staging dir instead of an existing batch, so a rerun whose `batch` arg does not propagate (it does not when launched by name) can never overwrite a published batch. Promotion to a numbered batch is handled by `finalize-batch.py`.

**Web: Persistent Sidebar authed shell (2026-05-29)**

**Added**
- `apps/web/components/layout/nav-config.ts`: single source of truth for the authed-shell nav, shared by both navs so they cannot drift. Exports `NAV_TABS` (Home `/`, Gyms `/gyms`, Rankings `/leaderboard`, Profile `/profile`), `isImmersiveRoute(pathname)` + the underlying `HIDE_PATTERNS` (extracted verbatim from `bottom-nav-bar.tsx`, scope unchanged), and `isActiveTab(href, pathname)`.
- `apps/web/components/layout/sidebar-rail.tsx`: new client component rendering the persistent left rail at `>= lg` only (`hidden lg:flex`, sticky full-height). `Wordmark` + the 4 `NAV_TABS` links (concept "01 Persistent Sidebar" active styling: Signal Red left accent + elevated bg) + a server-rendered footer slot. Returns `null` on immersive routes (same list as the bottom nav).
- `apps/web/components/layout/sidebar-footer.tsx`: `SidebarFooter` (async) fetches the active athlete null-safely via `getActiveAthlete()` (never `requireAthlete`; the shell wraps `/eua` and `/signup` and must not redirect), rendering a circular shadcn `Avatar` link to `/profile` + name + `current_elo` in `font-mono tabular-nums`. Renders nothing when there is no active athlete. Ships with `SidebarFooterSkeleton` for its Suspense fallback.

**Changed**
- `apps/web/app/(app)/layout.tsx`: wires the rail beside `{children}` in a `lg:flex` row so immersive routes (rail returns `null`) reflow to full width with no gutter. The footer fetch lives inside its own `<Suspense fallback={<SidebarFooterSkeleton/>}>`, and the rail itself is wrapped in `<Suspense>` (its `usePathname` is dynamic under Next 16 `cacheComponents`, same as `BottomNavBar`). Layout stays synchronous; all existing bootstraps and their Suspense boundaries (incl. the bare `DeploymentCheckBootstrap`) are unchanged. The shell root now paints the brand dark surface (`var(--bg-primary)`) instead of the shadcn `bg-background bg-gradient-subtle`, which resolved to a light gray with no `.dark` class active: with the desktop rail and a centered, width-capped column, that light layout background showed through the gutters and below short pages as a gray "box" around the dark content column. Painting the brand surface keeps the whole authed shell uniformly dark at every breakpoint (the content column was already `var(--bg-primary)`).
- `apps/web/components/layout/bottom-nav-bar.tsx`: now imports `NAV_TABS`/`isActiveTab`/`isImmersiveRoute` from `nav-config.ts` (rendered output unchanged) and gains `lg:hidden` so the bottom nav and the rail are never shown together.
- `apps/web/components/layout/page-container.tsx`: opt-in `wide?: boolean` prop. Default is unchanged (`max-w-md`; the ~24 other consumers are untouched); when set, the column widens to `lg:max-w-3xl lg:px-6` at `>= lg` while keeping the comfortable mobile column below `lg`.
- Widened only the 4 in-scope page bodies at `>= lg`: `apps/web/app/(app)/page.tsx`, `/leaderboard/page.tsx`, `/gyms/page.tsx` pass `wide` to `PageContainer`; `apps/web/app/(app)/profile/profile-content.tsx` (no `PageContainer`) gets `lg:max-w-3xl lg:mx-auto` on its content wrapper. No page internals were restructured (the Bento home redesign remains out of scope).
- `apps/web/components/layout/page-container.test.tsx`: adds assertions that the default stays narrow (no `lg:max-w-3xl`) and that `wide` adds the responsive widening classes while preserving the below-`lg` column.
- Design board freshness (now that concept 01 shipped): `apps/web/app/design/web-layouts/page.tsx` replaces the stale "the shipping app is currently a centered `max-w-md` mobile column" intro with the real adopted-shell description, adds a `shipped` flag + a neutral "Shipped" badge on the concept-01 tab and caption; `apps/web/app/design/page.tsx` corrects the Web Layouts card from "Six" to "Seven" concepts and notes concept 01 has shipped. Mock files (`web-layouts/concepts/*`, `_data.ts`) are pure layout and left untouched.

**Mobile launch reveal: "The Statement" splash + splash-variant flag (2026-05-29)**

**Added**
- `apps/mobile/components/ui/elo-system/splash-statement.tsx`: the new default cold-start
  brand reveal ("The Statement"). On the Void background, `WE ARE` (gray eyebrow) rises in,
  `ELO RATED` (white Bebas `Wordmark`, centered) locks in with a fade + subtle scale (no
  flash), then settles into a gentle, even glow breathe; `ARE YOU?` (Signal Red) rises in at
  the wordmark's right edge on the same beat as a Heavy haptic. Reanimated; honors
  `AccessibilityInfo.isReduceMotionEnabled()` (static resting frame, no haptic, then
  dismisses). The wordmark glow is the RN-faithful port of the CSS `brightness`/`text-shadow`
  glow (which don't animate on RN `Text`): a pixel-aligned pure-white duplicate `Wordmark`
  with a static halo, whose *opacity* is animated on the UI thread. Approved design reference:
  `research/assets/splash-statement-locked.html`.
- `packages/shared/src/constants.ts`: `SPLASH_VARIANT` (`climb` | `statement`),
  `DEFAULT_SPLASH_VARIANT` (`statement`), and `SPLASH_STATEMENT` timing block (single source
  of truth for the reveal sequence; reuses `SPLASH_REVEAL.EASING_BEZIER`).
- `apps/mobile/lib/splash/splash-variant.ts` (`getSplashVariant` / `setSplashVariant`):
  best-effort AsyncStorage device override (key `elo-rated:splash-variant`, validates against
  `SPLASH_VARIANT`, falls back to the default), mirroring the elo-cache pattern. Unit-tested
  (`apps/mobile/__tests__/lib/splash/splash-variant.test.ts`). A future Settings toggle can
  call `setSplashVariant()` to switch variants.

**Changed**
- `apps/mobile/app/_layout.tsx`: resolves the splash variant on cold start (settle-once with a
  short fallback so the native splash never hangs) and renders `<SplashStatement/>` (default,
  catch-all for any non-Climb value) or the parked `<SplashReveal/>` ("The Climb", still wired
  and ELO-fed). The Climb is parked, never deleted.

**Mobile: fix TestFlight launch crash from missing EAS build env (2026-05-29)**

**Fixed**
- `jits-00q` — cloud EAS builds (preview/production → TestFlight) crashed on app open. The Supabase client is constructed at module load (`apps/mobile/lib/supabase/client.ts`) and `apps/mobile/lib/env.ts` throws when `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` are absent. The `apps/mobile/eas.json` profiles defined only `EXPO_PUBLIC_APP_ENV`, and `.env` (the sole place the creds live) is gitignored and not uploaded to cloud builds → uncaught startup throw → instant crash. Worked in dev because the local `.env` is present.

**Changed**
- `apps/mobile/eas.json`: added an `environment` (`development`/`preview`/`production`) to each build profile so the build loads that EAS environment's server-side variables. The Supabase + Google `EXPO_PUBLIC_*` credentials are provisioned as EAS Environment Variables (server-side, not committed — honors the repo JWT secret-scan guard), not hardcoded in `eas.json`.
- `apps/mobile/app.json`: corrected `updates.url` from the `PLACEHOLDER_PROJECT_ID` placeholder to the real EAS projectId (`146416ac-…`) so `expo-updates` targets the actual project (secondary correctness fix; not the crash cause).

**Web bug batch: build prerender, video pre-flight, video-progress hook (2026-05-29)**

**Fixed**
- `jits-v0n` — production `build:web` failed prerendering `/` (and, once `/` was fixed, `/leaderboard`, `/notifications`, `/settings`, `/settings/notifications`): each page's default export was `async` and awaited `requireAthlete()`/`requireAuth()` in the page body, outside `<Suspense>`, which violates Next 16 `cacheComponents` ("Uncached data accessed outside of <Suspense>"). All five pages are now synchronous; the guard already runs inside their Suspense'd content components, so auth/activation enforcement is unchanged. Verified: `build:web` generates all 51 pages; unauthed `/leaderboard`/`/notifications`/`/settings`/`/settings/notifications` return 307→`/login` (middleware) and unauthed `/` redirects to `/login` in-browser (page-level redirect streams correctly through Suspense — no 500).
- `jits-3ng` — `apps/web/hooks/use-video-recorder.ts`: the 2 GiB `MAX_UPLOAD_BYTES` cap was only checked after recording stopped, so a user could record for minutes then be rejected. Now tracks recorded bytes live in `ondataavailable`, exposes `nearingLimit` (≥90%), and auto-stops recording at the cap with a clear error (parity with mobile's pre-flight check). The post-record check remains as a backstop. `nearingLimit` is an additive, non-breaking field on the hook's return.
- `jits-02w` / `jits-5q6` / `jits-c67` / `jits-5uc` — `packages/shared/src/hooks/use-video-progress.ts`: (02w) the `rpcMissing→ref` mirror moved out of the render body into a `useEffect`; (5q6) removed `fetchSnapshot`/`scheduleRefresh` from the realtime-channel effect deps (version-gated via `versionRef`) so a non-memoized `supabase` no longer rebuilds the channel every render; (c67) `rpcMissing` now resets on `videoId` change and on `refresh()`, so degraded "Realtime-only" mode recovers after the RPC ships; (5uc) a transient fallback miss now signals via `error` ("Progress temporarily unavailable") instead of silently keeping stale data. Exported API unchanged.

**Mobile launch reveal: "The Climb" animated splash (2026-05-29)**

**Added**
- `apps/mobile/components/ui/elo-system/splash-reveal.tsx`: new cold-start brand reveal (concept "The Climb"). On a dark Void background, the logo's bars rise one-by-one like a rating climbing, an ELO odometer rolls up (JS rAF + easeOutCubic), the gold "breakthrough" peak pops, the `Wordmark` locks in, and a Signal Red accent rule wipes left→right. Reanimated (mirrors the LIVE-pill idiom) + `expo-haptics` heavy impact on the lock beat. Honors `AccessibilityInfo.isReduceMotionEnabled()` (renders a static resting frame, no motion, then dismisses). Theme-independent (always the Void "arena" palette).
- `packages/shared/src/constants.ts` `SPLASH_REVEAL`: single source of truth for the reveal timings/sequence (bar stagger/rise, peak pop, number roll, wordmark/rule timing, holds, `DEFAULT_ELO = 1481`, brand `EASING_BEZIER`). Consumed by mobile now; reserved for the future web intro.
- `apps/mobile/lib/splash/elo-cache.ts` (`getCachedElo` / `setCachedElo`): best-effort AsyncStorage cache (key `elo-rated:last-elo`) so a returning user watches *their own* rating climb. Falls back to `DEFAULT_ELO` on any miss/failure.
- `expo-splash-screen` dependency (SDK-pinned) wired in `apps/mobile/app/_layout.tsx`: `preventAutoHideAsync()` keeps the native splash up until `SplashReveal` paints and calls `hideAsync()`, for a seamless native→JS hand-off. The overlay mounts once per cold start after the cached ELO resolves.

**Changed**
- `apps/mobile/app.json`: native splash `backgroundColor` `#bf1212` → `#0D0F14` (Void) so the static native splash matches the reveal's background (no seam). Launcher adaptive-icon background stays Signal Red.
- `apps/mobile/lib/auth/auth-context.tsx`: persists `athlete.current_elo` to the device cache whenever it changes, feeding the next launch reveal.

**Mobile gym detail: wire Avg Session stat + Signal Red accent bar (2026-05-29)**

**Changed**
- `apps/mobile/app/(app)/(tabs)/gyms/[id].tsx`: `useGymDetailData` now fetches `getGymManagerStats` inside the existing `fetchAll` `Promise.all` and returns a ready-to-render `avgPerSession` string, replacing the hardcoded `"—"` placeholder. Uses the exact web-parity formula (`totalSessions > 0 ? (totalParticipants / totalSessions).toFixed(1) : "0"`, see `apps/web/app/(app)/gyms/[id]/gym-detail-content.tsx`). The stats fetch is wrapped in `.catch(() => null)` so a slow/failed analytics query degrades the tile to `"0"` and never blocks the gym render. Avg ELO stays `"—"` (its backing query is unbuilt; tracked in jits-ycq).
- `apps/mobile/components/gyms/gym-detail-parts.tsx`: `StatsGrid` now renders the wireframe E2 Signal Red `accentBar` on the populated Avg Session tile only. Per the brand "no decorative color" rule, the still-placeholder Avg ELO tile gets no accent until its data lands.

**Web parity: EloTile Signal Red accent bar (2026-05-29)**

**Added**
- `apps/web/components/ui/elo-system/elo-tile.tsx`: optional `accentBar` prop matching the mobile EloTile and the canonical `.elo-tile::after` wireframe spec (3px Signal Red bottom bar via `var(--accent-cta)`, with `position: relative` + `overflow: hidden`). Enabled on the web Home "Current ELO Rating" hero (`apps/web/app/(app)/page.tsx`); the design-system showcase (`apps/web/app/design/elo-system/page.tsx`) now demonstrates the `accentBar` variant.

**Web: fix /eua dead-end for incomplete (Google-SSO/seed) accounts (2026-05-29)**

**Fixed**
- `apps/web/components/auth/eua-form.tsx`: pending athletes with an incomplete profile (every Google-SSO and seed account) were stuck in an invisible loop at `/eua`. The form tried to activate via `update athletes set status='active'`, but the backend `guard_athlete_columns` BEFORE-UPDATE trigger silently reverts any client status write (`NEW.status := OLD.status`), so the UPDATE returned success with no error, `router.push("/")` ran, and `requireAthlete()` bounced the still-`pending` athlete straight back to `/eua` ("nothing happens"). Activation is owned by the `handle_athlete_activation` trigger, which flips `pending -> active` only when an `athletes` UPDATE supplies `current_weight` + (`primary_gym_id` OR `free_agent`). The form now collects the missing profile fields (weight, gender, DOB, city, gym/free-agent) when needed and writes them (triggering activation) instead of writing `status`; the dead `status` write is removed. The app-liability waiver ack insert is now idempotent (guarded by a prior select, since its `session_id` is NULL and the unique constraint won't catch repeats).
- `apps/web/app/(auth)/eua/page.tsx`: now a server component that fetches the current athlete (via `getCurrentAthlete`, not `requireAthlete`, to avoid the redirect loop), computes `needsProfile`, and passes the profile values + active gyms/cities to `EuaForm`.

**Mobile cleanup: silence dev warnings, dedupe athlete-photo URL helper (2026-05-29)**

**Changed**
- Moved `apps/mobile/app/(app)/(tabs)/gyms/gym-detail-parts.tsx` to `apps/mobile/components/gyms/gym-detail-parts.tsx` (it is a named-export helper, not a route; living under `app/` made expo-router warn "missing the required default export"). Import in `gyms/[id].tsx` updated to `@/components/gyms/gym-detail-parts`.
- New `apps/mobile/lib/athlete-photo.ts` (`athletePhotoSource`): single source of truth that resolves a bare Supabase storage key to a public URL, passes through absolute URLs, or returns null. `Avatar32` now routes `photoUrl` through it (previously it handed a bare key straight to `<Image>`, producing a `file://…/profile.png` "could not find image" warning). `match-card.tsx` and `profile-header.tsx` now import the shared helper instead of each carrying a private copy.

**Home hero ELO tile: vertical clip fix + Signal Red accent bar (2026-05-29)**

**Fixed**
- `apps/mobile/components/ui/elo-system/elo-tile.tsx`: the hero number was vertically clipped because `lineHeight` equalled `fontSize` (React Native crops the glyph box, unlike CSS `line-height: 1`); bumped `lineHeight` to `1.1x` for breathing room and added the brand-required `fontVariant: ["tabular-nums"]` (was missing on mobile).

**Added**
- `apps/mobile/components/ui/elo-system/elo-tile.tsx`: optional `accentBar` prop that renders the 3px Signal Red bottom accent bar from the canonical `.elo-tile::after` wireframe spec (with `overflow-hidden` so it follows the rounded corner). Enabled on the Home "Current ELO Rating" hero in `apps/mobile/app/(app)/(tabs)/(home)/index.tsx`.

**Profile tab: SWR cache + skeleton loading state (2026-05-29)**

**Changed**
- `apps/mobile/lib/profile/use-profile-data.ts`: the composed `{ stats, gymName, eloThisMonth, history }` payload now flows through `useCachedResource` (cache key `profile:${athleteId}`). The fetcher keeps the single `Promise.all([getAthleteStatsRpc, gymLookup, getMatchHistory])` (all three keyed only by `athleteId`, mutually independent) and derives `eloThisMonth` from that same history array. Errors surface via the existing `toast.error` while any stale payload stays on screen; `refreshing` maps to `isStale` and `onRefresh` is `refetch()` (the 600ms `setTimeout` is gone, no manual refresh state). Same public return shape (`{ stats, gymName, eloThisMonth, history, isLoading, refreshing, onRefresh }`).
- `apps/mobile/app/(app)/(tabs)/profile/index.tsx`: the cold-load `<ActivityIndicator>` is replaced by `ProfileSkeleton` (`<SkeletonProvider>` with a header `SkeletonPlate` (64px `SkeletonAvatar` + `SkeletonText lines={2}`), a 3-tile stat strip of `SkeletonBlock`s in a flex-row, then four `<SkeletonParticipantRow/>` under the "Recent Matches" `MetaTag`). `recent` continues to be served from the cached `history.slice(0, 5)` (no second round-trip). The remaining `<ActivityIndicator>` is the pre-auth `!athlete` guard only.

**Mobile Home tab: SWR cache + skeleton loading state (2026-05-29)**

**Changed**
- `apps/mobile/app/(app)/(tabs)/(home)/index.tsx`: rewrote the inline `useDashboardData()` hook on top of `useCachedResource` (cache key `dashboard:${athleteId}`), wrapping the existing parallel `Promise.all([getDashboardSummary, getActiveSession])` as the fetcher body (shared queries untouched). Cold start now renders a `DashboardSkeleton` (a hero `SkeletonBlock` h140 rounded-md for the ELO tile, an accent `SkeletonPlate` with `SkeletonText lines={2}` for the active-session slab, and a `SkeletonPlate` holding 3 `SkeletonParticipantRow` for recent activity) that mirrors the real layout, replacing the bare `<ActivityIndicator>` branch. The real header (Wordmark/NotificationBell/Avatar32) and Welcome-back block render above the skeleton since they don't depend on dashboard data. Pull-to-refresh now calls `refetch()` and drops the artificial 600ms `setTimeout` (SWR keeps stale data on screen while revalidating; `RefreshControl.refreshing` is driven by `isStale`). Fetch errors surface via the existing toast while stale data stays on screen.

**Rankings tab: SWR cache + list-body skeleton loading state (2026-05-29)**

**Changed**
- `apps/mobile/lib/leaderboard/use-leaderboard-data.ts`: routes the composed `{ athletes, gyms }` payload through `useCachedResource` (cache key `leaderboard:athletes`; the gender filter is client-side over the same payload, so it is NOT part of the key). The athletes-table SELECT and `getAthletesStatsRpc(ids)` stay strictly sequential inside the fetcher (the stats RPC genuinely depends on the returned IDs) with no wasted await between them; the fetcher checks the `CancelToken` before post-processing. Errors surface via the existing per-tab `toast.error` while any stale payload stays on screen. Hook still returns `{ athletes, gyms, isLoading, isRefreshing, refresh }` (`isRefreshing` now mapped from `isStale`).
- `apps/mobile/app/(app)/(tabs)/leaderboard/index.tsx`: the full-screen `<ActivityIndicator>` now gates on auth only (`authLoading || !athlete`). Once the athlete resolves, the header + Fighters/Gyms chips + gender filter paint immediately and the list body carries a `RankingsSkeleton` (`<SkeletonProvider>` with 8 static `<SkeletonRankRow/>`) until BOTH the athletes and stats land — never a half-empty list. The skeleton covers both the Fighters and Gyms views; `FightersList`/`GymsList` receive real data only when not loading.

**Parallelize independent sequential round-trips (latency, no behavior change) (2026-05-29)**

**Changed**
- `packages/shared/src/api/queries.ts` `getActiveSession()`: in both priority paths the gym-name lookup and the participant-count query (and, in Priority 2, the athlete check-in row) are now awaited together via `Promise.all` instead of serially. Each batched call depends only on the already-resolved session row (and `athleteId`), so none feeds another. Function signature, return shape, and every query (selects, filters, FK shapes) are unchanged.
- `apps/mobile/lib/profile/use-profile-data.ts`: collapsed the parallel `Promise.all([getAthleteStatsRpc, gymLookup])` + sequential `getMatchHistory` leg into a single `Promise.all([getAthleteStatsRpc, gymLookup, getMatchHistory])` (all three keyed only by `athleteId`, mutually independent). `eloThisMonth` is derived from that history array; the hook now also returns `history` (typed `getMatchHistory` wrapper, replacing the prior raw `supabase.rpc`).
- `apps/mobile/app/(app)/(tabs)/profile/index.tsx`: removed the duplicate `getMatchHistory` `useEffect` (a redundant network round-trip); `recent` is now sliced from the single cached `history` payload returned by `useProfileData`.

**Mobile: first/last name at signup, native elo-system restyling, Google SSO (2026-05-29)**

**Added**
- `apps/mobile/components/ui/elo-system/`: native ELO design-system primitive set (Plate, EloTile, Wordmark, Avatar32, LivePill, MetaTag, Chip, DataRow, DeltaNumber, OutcomeTag, ParticipantRow, RankRow), mirroring `apps/web/components/ui/elo-system/`.
- `apps/mobile/components/layout/`: `app-header.tsx`, `elo-tab-bar.tsx`, `page-container.tsx` layout primitives.
- `apps/mobile/components/auth/auth-buttons.tsx` (`CtaButton`/`TertiaryButton`) and `apps/mobile/components/profile-setup/elo-form-field.tsx` (`EloField`/`EloTextInput`).
- Native Google SSO: `signInWithGoogle` in `apps/mobile/lib/auth/auth-context.tsx` via `@react-native-google-signin/google-signin` (`GoogleSignin.signIn` -> `supabase.auth.signInWithIdToken`), wired into `apps/mobile/app/(auth)/login.tsx`. `apps/mobile/app.json` gains the google-signin config plugin (`iosUrlScheme`).
- `apps/mobile/app/(app)/(tabs)/gyms/gym-detail-parts.tsx`.

**Changed**
- Profile setup collects structured `first_name`/`last_name` (replacing single `display_name`); `display_name` kept in sync as a derived "First Last" label. Validation, submit payload, and the athlete read updated. Aligns with `jr_be` migration `20260529120000`.
- Mobile screens/components rebuilt on the elo-system primitives + ELO tokens (home, gyms, leaderboard, profile, sessions, match-flow, settings, auth, notifications). `apps/mobile/lib/tokens.ts` adds `textSecondary`/`textTertiary` + ELO palette; `apps/mobile/tailwind.config.js` gains the ELO radius/font scale; `apps/mobile/lib/theme/theme-provider.tsx` maps the new vars.
- `packages/shared/src/api/mutations.ts`: `createSessionTemplate` now sets `created_by` (via `auth_athlete_id`); `createInSessionMatch` timekeeper param aligned with the regenerated `database.ts`.

**Removed**
- `apps/mobile/components/athlete-card.tsx`, `athlete-card-parts.tsx`, `elo-badge.tsx` (superseded by elo-system primitives).

**Internal founders Kanban board at /design/board (2026-05-29)**

**Added**
- Backend (`/Users/msponagle/code/experiments/jr_be/supabase/migrations/20260529000000_admin_cards.sql`): new `public.admin_cards` table (`id`, `title`, `notes`, `status` checked `todo|doing|done`, `created_by` defaulting to `auth.uid()`, `created_at`, `updated_at`). Reuses the existing `set_updated_at()` trigger; RLS grants any authenticated user full CRUD (internal/undiscoverable for now). Self-contained and idempotent so it can be published to the remote project unchanged. **Applied to the LOCAL Supabase DB only** (this `jr_be` checkout has no migrations dir / git / config.toml, so `psql` was used directly; remote/prod application is a separate manual step).
- `packages/shared/src/api/queries.ts`: `AdminCard`/`AdminCardStatus` types and `getAdminCards()` query.
- `packages/shared/src/api/mutations.ts`: `createAdminCard()`, `updateAdminCard()`, `deleteAdminCard()` (all return `Result<T>`).
- `apps/web/app/design/board/page.tsx`: new `/design/board` route. Synchronous page wraps an async `BoardContent` (server-side fetch via `getAdminCards`) in `<Suspense>` per the cacheComponents pattern.
- `apps/web/app/design/board/kanban-board.tsx`: client board (To Do / Doing / Done columns) with add, move-between-columns, and delete, persisting via the shared mutations on the browser Supabase client.
- `apps/web/app/design/board/kanban-card.tsx`, `apps/web/app/design/board/add-card-input.tsx`: card and quick-add primitives.
- `apps/web/app/design/board/card-dialog.tsx`: click a card to open a detail dialog (shadcn `Dialog`) that edits the title and a description (the `notes` column) and shows `Created`/`Updated` relative times. Card faces are now clickable and show a compact "updated" timestamp.

**Changed**
- `packages/shared/src/api/queries.ts` + `mutations.ts`: `AdminCard` now exposes `updated_at` (added to the type and the select column lists) so the board can show last-updated times.
- `apps/web/app/design/page.tsx`: added "Founders Board" card to the design hub.
- `apps/web/app/design/layout.tsx`: added "Board" link to the design nav.
- `apps/web/lib/supabase/proxy.ts`: removed `/design` from `publicPaths`, so the entire design section (including the board) is now gated behind login via the existing `proxy.ts` middleware (unauthenticated requests 307 to `/login`). This is also what makes the board's authenticated-only RLS write path work without weakening the policy.
- `packages/shared/src/types/database.ts`: regenerated (`npm run db:types`) to include `admin_cards`.

**Web layout concepts: full-screen desktop directions for team preview (2026-05-29)**

**Added**
- `apps/web/app/design/web-layouts/page.tsx`: new `/design/web-layouts` route. A client-side switcher (segmented tabs) previewing seven full-screen desktop layout directions, each demonstrated on a different screen, in a full-bleed faux-browser frame with per-concept caption (blurb + pros/cons). Built to explore alternatives to the shipping app's centered `max-w-md` mobile column.
- `apps/web/app/design/web-layouts/_data.ts`: shared hardcoded placeholder data (athlete, rankings, gyms, profile stats, activity feed, fixtures/news, arena) so concepts render with no Supabase/auth and stay visually consistent.
- `apps/web/app/design/web-layouts/_frame.tsx`: `ConceptFrame` (full-bleed breakout + browser chrome) and `SectionLabel` shared primitives.
- `apps/web/app/design/web-layouts/concepts/`: seven concept components built from real `elo-system`/shadcn components and brand tokens: `sidebar-home` (persistent left sidebar, Home), `topnav-rankings` (top nav + wide centered, Rankings), `three-col-gyms` (nav, list, detail rail, Gyms), `bento-profile` (asymmetric bento grid, Profile), `split-arena` (55/45 immersive split, Arena), `strava-feed` (Strava-style social activity feed, Home/Activity), `espn-scores` (ESPN-style live scores ticker + news, Home/Live).

**Changed**
- `apps/web/app/design/page.tsx`: added "Web Layouts" card between "Canonical Wireframe" and "Web Screens".
- `apps/web/app/design/layout.tsx`: added "Web Layouts" link to the design nav.

**Public design assets synced with upstream SharePoint brand kit (2026-05-19)**

**Added**
- `apps/web/public/design/tokens.css`: canonical brand tokens copied from `outside_assets/Jits Arena SharePoint/Brand/design-system/tokens.css`. Static HTML in `/public/design/` now references a single source of truth instead of duplicating raw values.
- `apps/web/public/design/wireframe.html`: alpha wireframe (light + dark) synced from `outside_assets/.../activation-kit/app-screens/wireframe.html`. Expanded from 28 to **39 screens** to reach parity with the shipped app surface.
- `apps/web/app/design/wireframe/page.tsx`: new `/design/wireframe` route that iframes the canonical wireframe; linked from the design hub.
- Upstream `outside_assets/.../wireframe.html` and the synced `apps/web/public/design/wireframe.html`: 12 new screen sections added to close the gap between the wireframe and the shipped app: **A4** Forgot Password, **A5** Setup, Identity step, **A6** Setup, Training step (with Free Agent toggle), **F2** Global Ladder, Gyms tab, **G5** Profile Stats (win rate, streak, weekly activity chart, submission breakdown), **H1** Notification Center, **H2** Notification Preferences (push toggles by category), **H3** Feedback (form with category + screenshot), **H4** Video Settings (auto-record toggle, upload quality, storage), **I1** Offline Banner overlay, **I2** Error Boundary overlay, **I3** Toast overlay. Picker dropdown gains three new optgroups (Activation, Notifications, Overlays) and one renamed optgroup (Settings).

**Changed**
- `apps/web/app/design/page.tsx`: added "Canonical Wireframe" card between "UI Kit" and "Web Screens".
- `apps/web/app/design/layout.tsx`: added "Wireframe" link to the design nav.
- `apps/web/public/design/elo-rated-style-guide.html`: replaced inline `:root` raw-color block with `<link>` to `./tokens.css`, plus a bridge layer mapping the page's legacy names (`--void`, `--signal-red`, `--ease-out`, ...) onto canonical tokens (`--color-void`, `--color-signal-red`, `--easing-default`, ...). Eliminates drift risk against the brand system.
- `outside_assets/.../activation-kit/app-screens/wireframe.html`: removed a stray leading `S` character before the `<!DOCTYPE html>` declaration that prevented the page from validating; updated screen-count caption from "28 Screens" to "39 Screens".

**Removed**
- `apps/web/public/design/elo-rated-rebrand.html`: 100KB pre-rebrand Visual Review comparison doc (titled "2026-05-01"). Orphan (not referenced by any route); the rebrand shipped 2026-05-06 so the comparison is no longer load-bearing. Recoverable via git history if needed.

**Verified**
- `apps/web/app/globals.css`, `apps/web/app/design-system/tokens.css`, and `apps/mobile/lib/tokens.ts` already mirror the canonical brand tokens 1:1 (HSL form on web, hex form on mobile). No app-code changes were needed to bring web and native implementations into alignment.

**Match flow two-browser fixes (2026-05-16)**

**Fixed**
- Web `apps/web/hooks/use-session-lobby-realtime.ts`: stop passing the acceptor as `timekeeperId` on `respondToChallenge`. `create_session_match` rejects when the timekeeper is one of the competitors (`HINT invalid_timekeeper`), so accepting a challenge always failed silently for 2-fighter session matches.
- Web `apps/web/app/(app)/session/[id]/match/[matchId]/match-flow-content.tsx` + `match-flow-wizard.tsx`: thread `hasTimekeeper` (`!!match.timekeeper_id`) through the wizard.
- Web `steps/ready-check-step.tsx`: only require the assigned timekeeper to call `startMatch` when one actually exists. With no timekeeper (2-fighter session match), either competitor can start; `start_match` is idempotent and the broadcast `timer_started` event syncs the loser forward.
- Web `steps/fighter-live-step.tsx`: show the "End Match" button when `timekeeperEnabled` is true but the match has no assigned timekeeper.
- Web `steps/result-recording-step.tsx`: only lock the result form behind the timekeeper when one actually exists.
- Web `apps/web/components/sign-up-form.tsx`: switch from `athletes.insert` to `athletes.update`. The auth `on_auth_user_created` trigger already inserts a pending athlete row, so the prior insert always hit RLS (403) and the profile fields (gym, weight, gender, DOB) were never saved — leaving every new user stranded as `pending` after signup.
- Backend (jr_be `supabase/migrations/20260516000000_start_match_accept_session_statuses.sql`): `start_match` now accepts `pending`, `awaiting_timekeeper`, and `weight_check`. `create_session_match` parks 2-fighter session matches in `awaiting_timekeeper`, so the prior `pending`-only check made startMatch unreachable from the ready-check step.

**Gyms wireframe pass (2026-05-15)**

**Changed**
- Web gym detail (`apps/web/app/(app)/gyms/[id]/gym-stats.tsx`): replaced "Matches" stat tile with "Avg ELO" to match wireframe E2 (line ~1440). Placeholder "—" rendered until `getGymManagerStats` exposes `avgElo`.
- Web gym detail (`apps/web/app/(app)/gyms/[id]/gym-detail-content.tsx`): added "Last Session" plate (4-cell DataRow grid: Attendees, Avg Matches, ELO Range, Median) below the stats tiles, per wireframe E2 lines 1444-1450. Values are "—" placeholders pending `getGymDetail` last-session aggregates.
- Web gym list (`apps/web/components/domain/gym-card.tsx`): per-row schedule label now renders next upcoming session day+time (e.g. "Sun 11AM") via `Intl.DateTimeFormat` instead of "N upcoming". Falls back to "No sessions" when none. Live sessions still take precedence.
- Shared (`packages/shared/src/types/session.ts`, `packages/shared/src/api/queries.ts`): `GymListItem` gains `nextSessionStart: string | null`; `getGymsWithSessions` computes the earliest future scheduled-session timestamp per gym.

**Phase 6C: Mobile Gym Management (2026-05-06)**

**Added**
- Mobile: gym creation sheet, gym edit sheet, session templates section with full CRUD.
- Mobile: template-card, template-form-sheet with day/time/duration pickers.
- Gym list "Create" button and gym detail edit button (managers only).

**Phase 10: Analytics + Insights (2026-05-06)**

**Added**
- Analytics queries: `getWeeklyMatchActivity`, `getSubmissionBreakdown`, `getWeightClassStats`, `getGymManagerStats`.
- Rating milestones: 7-tier system (Newcomer to Legend) with `getCurrentMilestone`, `getNextMilestone`, `getMilestoneProgress`.
- Web: athlete insights tab (weekly activity chart, submission breakdown, weight class stats) with CSS-only visualizations.
- Web: gym manager stats dashboard (sessions, check-ins, matches, members) on gym detail page.
- Mobile: submission breakdown, weekly activity, milestone progress on profile stats screen.
- Analytics types: `WeeklyActivity`, `SubmissionBreakdown`, `WeightClassStats`, `GymManagerStats`.

**Phase 6: Gym Manager Onboarding (2026-05-06)**

**Added**
- Gym creation: any active athlete can create a gym and auto-becomes its first manager (backend trigger + web dialog).
- Gym profile editing: managers can update gym name/city via edit dialog on web.
- Session templates: managers can save recurring session configs (day, time, duration, capacity). One-tap "Create Session" from template.
- Backend migration: `session_templates` table, `gyms_insert_active_athlete` policy, `gyms_update_manager` policy, `auto_add_gym_manager` trigger, `create_session_from_template` RPC.
- Shared mutations: `createGym`, `updateGym`, `createSessionTemplate`, `updateSessionTemplate`, `deleteSessionTemplate`, `createSessionFromTemplate`.
- Web components: `create-gym-dialog`, `edit-gym-dialog`, `session-templates`, `template-card`, `template-form-dialog`.

**Phase 9: Notifications + Social (2026-05-06)**

**Added**
- Push notification preferences: dedicated settings page (web) and screen (mobile) with per-channel toggles (challenges, matches, chat).
- Notification center: full notification history built from challenges + match results. Web: `/notifications` route with date grouping. Mobile: enhanced bottom sheet panel with grouped feed.
- Social sharing utilities: `buildShareUrl()` and `buildShareText()` in `@jits/shared/utils/share`.
- Match result sharing: "Share Result" button on match summary (web + mobile) via native share APIs.
- Session invite sharing: "Invite" button on session lobby (web + mobile).
- Existing share-profile sheets migrated to shared utilities and `elorated.com` URLs.

**Changed**
- Web notification bell now links to `/notifications` page instead of opening a sheet panel.
- Mobile notification panel rewritten to show full feed (challenges + match results) grouped by date.
- Web settings page: notification prefs moved to dedicated `/settings/notifications` route.

**Removed**
- `apps/web/components/domain/notification-panel.tsx` (replaced by notifications page).
- `apps/mobile/components/notifications/challenge-item.tsx` (replaced by notification-item).

**Phase 7: Mobile Typography + Polish (2026-05-06)**

**Added**
- Mobile Tailwind font families: `font-display` (Bebas Neue), `font-heading` (DM Sans Bold), `font-body` (Inter), `font-mono` (JetBrains Mono).
- 15 extracted component/hook files from oversized components and screens.

**Changed**
- ~100 raw `font-bold`/`font-semibold` instances replaced with semantic `font-heading`, `font-mono`, or `font-display` across 45+ mobile files.
- 6 Stack layout files updated with themed header styles via `useThemedTokens()`.
- Component splits: `compare-stats-modal` (184->100), `match-flow-wizard` (182->104), `recent-activity-section` (164->110), `notification-panel` (158->119), `athlete-card` (145->110).
- Screen splits: `leaderboard/index` (330->71), `athlete/[id]` (297->108), `profile/index` (236->96).

**Phase 8: Test Coverage + Auth Dedup (2026-05-06)**

**Added**
- 171 new tests across 13 new test files (27 suites, 346 total tests):
  - Match flow: step-router (14), format-elapsed (14), parse-finish-time (17).
  - Session: validate-weight (14), haversine distance (20).
  - Realtime: session-match-sync (15), lobby-sync (13), pending-challenges (8), global-notifications (11).
  - Offline: mutation-queue (17), use-unread-count (9).
  - Mobile: CreateSessionSheet (8), SessionActions (4).
  - Web: session-actions (8), session-list (6).
  - Shared: GymDetail type assertions (5).

**Changed**
- Auth forms deduplicated: extracted 4 shared primitives (`auth-form-shell`, `email-input`, `password-input`, `google-oauth-button`). Forms reduced from 466 to 228 total lines (51%).

**Alpha Build Verification & Hardening (2026-05-06)**

**Added**
- Automation scripts: `scripts/verify-alpha.sh` (full CI verification), `scripts/setup-supabase-env.sh` (staging/prod provisioning), `scripts/seed-gym-manager.sh` (initial manager seeding).
- Mobile tests: `CreateSessionSheet` (8 tests) and `SessionActions` (4 tests) at `apps/mobile/__tests__/components/session/`.
- Web tests: 6 new tests for session list gym manager gating and type assertions.
- Shared tests: `GymDetail.isGymManager` type assertion test.
- Backend: 17 pgTAP tests for `gym_managers` table, RLS policies, `is_gym_manager()` function, and session creation gating.
- Total test count: 16 suites, 175 tests (up from 11/144).

**Changed**
- CLAUDE.md updated: alpha status, app identity, gym manager docs, resolved tech debt items, new directory structure.

**Alpha Build Phase 3: Gym Manager Feature (2026-05-06)**

**Added**
- Gym manager role support: `isGymManager` check in `getGymDetail` query, `gym_managers` table type in `database.ts`.
- Web: session creation gated behind gym manager role (was member-only). Session actions visible to gym managers and creators.
- Mobile: `CreateSessionSheet` (`apps/mobile/components/session/create-session-sheet.tsx`) with title, time presets, duration, capacity, notes.
- Mobile: `SessionActions` (`apps/mobile/components/session/session-actions.tsx`) with activate, end, cancel via native Alert menus.
- Mobile: gym detail screen shows "Start Session" for gym managers and management controls on session cards.

**Alpha Build Phase 4: Build Pipeline (2026-05-06)**

**Added**
- Universal link verification files: `public/.well-known/apple-app-site-association` and `assetlinks.json` for `elorated.com`.
- EAS setup guide (`docs/eas-setup.md`): step-by-step for EAS Build, secrets, TestFlight, Play Console.
- Universal links setup guide (`docs/universal-links-setup.md`).
- EAS submit config for iOS (App Store Connect) and Android (Play Console internal track).

**Changed**
- EAS build profiles use `EXPO_PUBLIC_APP_ENV` (aligned with env setup docs).
- All legal docs (PRIVACY_POLICY.md, TERMS.md) updated: "JITS" to "ELO RATED", domain to `elorated.com`.
- STORE_LISTING.md updated: app name, bundle ID, domain, all user-facing text to ELO RATED branding.

**Alpha Build Phase 1: Infrastructure (2026-05-06)**

**Added**
- GitHub Actions CI/CD pipeline (`.github/workflows/ci.yml`): typecheck, test, build-web, and bundle-mobile jobs on push/PR.
- Sentry error tracking wired for mobile: `apps/mobile/lib/error-tracking/sentry.ts` with guarded init, error boundary forwarding, and `@sentry/react-native/expo` config plugin.
- Multi-environment configuration: `docs/environment-setup.md` covering development/staging/production Supabase project isolation.
- Web `.env.example` with full variable list (`apps/web/.env.example`).

**Changed**
- App identity updated to ELO RATED: bundle ID `com.elorated.mobile`, slug `elo-rated`, scheme `elorated://`, associated domains `elorated.com`.
- Deep link handler and auth redirect updated from `jits://` to `elorated://`.
- Mobile `.env.example` updated with `EXPO_PUBLIC_APP_ENV` and `EXPO_PUBLIC_SENTRY_DSN`.

**Fixed**
- Supabase realtime "Cannot add 'postgres_changes' callbacks after 'subscribe'" error caused by async `removeChannel` race with React 19 Strict Mode effect re-firing. Added unique mount-ID channel names to all affected hooks: `use-pending-challenges` (shared), `use-global-notifications` (shared), `use-session-lobby-realtime` (web), `use-chat-channel` (web), `use-online-presence` (mobile).
- `joinSessionLobby` now uses upsert instead of insert, preventing 23505 duplicate key errors when re-joining a session (`packages/shared/src/api/mutations.ts`).
- Suppress noisy `[push] registration failed not_a_device` console warning on iOS Simulator (`apps/mobile/lib/notifications/push-registration-bootstrap.tsx`).

**Mobile Route Restructure (2026-05-01)**

**Fixed**
- Phantom tab bar items (athlete/[id], session/[id], settings) eliminated by moving tab routes into a dedicated `(tabs)` group under `(app)/`. `href: null` alone did not hide them in expo-router v6.
- Session join/lobby header now uses themed dark background instead of default white.
- Mobile profile and home screens now wrap content in `SafeAreaView` so headers no longer overlap the status bar/notch.

**Changed**
- `apps/mobile/app/(app)/_layout.tsx` converted from `Tabs` to `Stack` navigator.
- Tab routes (`(home)`, `gyms`, `leaderboard`, `profile`) moved to `apps/mobile/app/(app)/(tabs)/`.
- New `apps/mobile/app/(app)/(tabs)/_layout.tsx` holds the tab bar configuration.
- `apps/mobile/app/(app)/session/[id]/_layout.tsx` now applies themed header styles.

**All Matches Ranked (2026-05-01)**

**Removed**
- Casual/Ranked match type selection from web session challenge sheet, direct challenge sheet, and challenge response sheet.
- Casual/Ranked match type selection from mobile challenge action sheet (now simple "Challenge?" confirmation).
- "Ranked"/"Casual" filter tabs from recent activity sections (web + mobile).
- "Ranked"/"Casual" labels from match cards (web + mobile).
- "Casual match (no ELO change)" conditional message from mobile match summary step; ELO delta always shown.
- Separate `looking_for_casual` / `looking_for_ranked` toggles from mobile settings; collapsed to single "Looking for matches" toggle.
- Separate casual/ranked preference display from web dashboard hero subtitle; simplified to "Looking for matches".

**Changed**
- All challenge sheets now hardcode `matchType: "ranked"` and always show ELO stakes preview.
- Web arena toggle collapsed from two badges to single on/off toggle.

**Demo Prep Wave 6: Setup + Branding Polish (2026-05-01)**

**Added**
- Web: "Train independently" free agent toggle on profile setup wizard. Users without a gym can now complete activation (mirrors mobile setup flow).

**Changed**
- Version string updated from "JITS v0.1.0" to "JITS Beta" on both web and mobile profile screens.

**Demo Prep Wave 5: Web Parity Fixes (2026-05-01)**

**Fixed**
- Web: Opponent now navigates to match screen via postgres_changes fallback (same fix as mobile wave 2).
- Web: match_started broadcast handler now navigates participants when matchId is present.
- Web: Session cards show "Return to Lobby" and route directly to lobby for active participants (eliminates join-to-lobby redirect flash, matching mobile).

**Demo Prep Wave 4: Final Polish (2026-05-01)**

**Fixed**
- Leaderboard ranks now recalculate after gender filtering (web + mobile). Filtered views show sequential #1, #2, #3 instead of gaps from the full population ranking.

**Demo Prep Wave 3: Consistency + Resilience (2026-05-01)**

**Fixed**
- Web: Leave session now checks result and shows error toast on failure instead of navigating blindly.
- Web: Confirm result now checks RPC response; resets confirmed state and shows error toast on failure.
- Web: Profile stats now include draws in total match count (consistent with mobile and RPC).
- Mobile: Match confirm step auto-advances after both athletes confirm (1.5s delay), matching web behavior.
- Mobile: EndStep `onAdvance` callback wrapped in `useCallback` for stable reference (prevents timeout restart on re-render).
- Mobile: SessionCard routes directly to lobby when user is already a participant (eliminates join-to-lobby redirect flash).

**Demo Prep Wave 2: Functional Fixes (2026-05-01)**

**Fixed**
- Mobile: Opponent now navigates to match screen when challenged in session lobby (added postgres_changes, challenge_accepted, and match_started navigation paths).
- Mobile: Double-tap guard on challenge button prevents duplicate match creation.
- Web: Match confirm step now auto-advances to summary after both athletes confirm (1.5s delay).
- Web: Login now redirects to dashboard (`/`) instead of `/profile`.
- Web: Auth callback error redirect now includes error param for friendly error messages.
- Web: Achievements "Find a match" link points to `/gyms` instead of hidden `/arena` route.
- Web: Match card links removed from dashboard and profile (pointed to hidden `/match/*/results` route).
- Web: Weight validation on session join tightened to 50-400 lbs range (consistent with mobile).
- Web: Error toasts added for result recording, session creation, and RSVP failures (previously silent).
- Mobile: Gym detail hook now uses cancellation guard on unmount.

**Demo Prep Wave 1: Polish (2026-05-01)**

**Fixed**
- Mobile Jest tests now pass: fixed `react` moduleNameMapper to resolve from workspace root instead of non-existent local `node_modules/react`.
- Web bottom nav bar now hides on `/match/*/live`, `/match/*/results`, and `/profile/setup` routes.
- Auth error page (`apps/web/app/(auth)/error/page.tsx`) shows friendly messages instead of raw Supabase error codes, with a "Back to sign in" button.

**Changed**
- Gym detail pages (web + mobile) now show actual member count (e.g., "12 Members") instead of generic "Members at this gym" text. Added `memberCount` to `GymDetail` type and count query to `getGymDetail`.
- Web empty states (`recent-activity-section`) now include actionable hint text guiding users to join sessions.
- Mobile ELO history placeholder shows "N rating points recorded" or "No matches yet" instead of referencing "polish phase" or "placeholder".
- Mobile rank display shows "Unranked" instead of em dash when rank is 0.
- Mobile auth form fields now show red border (`border-destructive`) on validation errors.
- Mobile "coming soon" text updated: removed outdated phase references (profile editing, video settings, notification toggles).
- Mobile challenge button on athlete profile now looks visibly disabled (secondary variant, reduced opacity).
- Mobile empty states (dashboard recent activity) now include actionable guidance text.

### Added

**Phase 5 Track B2 -- Mobile EAS Build, Sentry, Store Listing Prep**
- Mobile dependency: `@sentry/react-native` (~7.2.0) for error tracking. Config plugin auto-registered in `apps/mobile/app.json` via `npx expo install`.
- `apps/mobile/eas.json` -- EAS Build configuration with `development` (developmentClient + iOS simulator), `preview` (internal distribution, APK on Android), and `production` (autoIncrement, AAB) profiles. Channel names match profile names so EAS Update OTA targeting works out of the box.
- `apps/mobile/lib/error-tracking/sentry-init.ts` -- Sentry initialization driven by `EXPO_PUBLIC_SENTRY_DSN`. No-op when DSN absent (local dev). Exports `captureError(err, context?)` for use from non-React contexts. `tracesSampleRate: 0.1` for beta to keep volume low until we have signal.
- `STORE_LISTING.md` (repo root) -- App Store Connect + Play Store listing draft, beta distribution plan, 18-item pre-launch checklist.
- `PRIVACY_POLICY.md`, `TERMS.md` (repo root) -- placeholder content noting legal review is required before publishing.

**Phase 5 Track A -- Mobile Video Recording, Wake-Lock, Haptics**
- Mobile dependencies: `expo-camera`, `expo-av`, `expo-keep-awake`, `expo-haptics`, `expo-file-system` (the latter required for the upload helper's streaming `FileSystem.uploadAsync` call -- `expo-av` installed for forward compatibility although the live recorder only uses `expo-camera`).
- `apps/mobile/lib/video/use-video-recorder.ts` -- Native video recorder hook (`useVideoRecorder`). Wraps `expo-camera`'s `CameraView` ref + `recordAsync`/`stopRecording` lifecycle, exposes a 6-state machine (`idle`/`recording`/`stopping`/`uploading`/`uploaded`/`error`), retries failed uploads once, and surfaces camera + microphone permission state.
- `apps/mobile/lib/video/upload-recording.ts` -- Streams the local file URI to Supabase Storage via `FileSystem.uploadAsync` (BINARY_CONTENT) instead of base64-loading. Bucket `match-videos`, path `matches/{matchId}/{timestamp}.mp4` -- mirrors web's bucket + path convention (web uses `.webm` because `MediaRecorder` produces WebM; native produces MP4).
- `apps/mobile/components/match-flow/camera-overlay.tsx` -- 16:9 camera preview thumbnail mounted above the timer. Renders a permission-gate fallback when access hasn't been granted (or has been denied) so the match flow keeps running.
- `apps/mobile/components/match-flow/upload-progress-banner.tsx` -- Compact status pill showing recording/upload state (spinner + label, success checkmark, or error). No incremental progress because `FileSystem.uploadAsync` does not emit progress for binary uploads.
- `apps/mobile/lib/match-flow/use-keep-awake.ts` -- Wake-lock during the live match step via `expo-keep-awake`'s imperative `activateKeepAwakeAsync` / `deactivateKeepAwake` pair (keyed on an `active` flag so the lock releases on unmount).
- `apps/mobile/lib/match-flow/use-haptics.ts` -- Centralised haptic vocabulary (`matchStart`, `matchEnd`, `resultRecorded`, `error`, `timeWarning`) wrapping `expo-haptics`. All errors silently swallowed since haptics are pure feedback.

**Phase 5 Track B1 -- Mobile Deep Links, Error Boundary, Offline Handling**
- Mobile dependency: `@react-native-community/netinfo`.
- `apps/mobile/lib/network/use-network-status.ts` -- Network state hook (isConnected / isInternetReachable / type).
- `apps/mobile/lib/network/mutation-queue.ts` -- In-memory queue for critical mutations (match result + confirm). Flushes on reconnect.
- `apps/mobile/components/offline-banner.tsx` -- Top-of-screen banner shown when offline.
- `apps/mobile/components/error-boundary.tsx` -- Root error boundary with retry + sign-out.
- `apps/mobile/lib/deep-links/handler.ts` -- Central deep link parser routing `jits://...` and `https://jits.app/...` URLs to Expo Router.

### Changed

- `apps/mobile/lib/match-flow/use-record-result.ts` and `apps/mobile/components/match-flow/steps/confirm-step.tsx` -- Critical match-result writes (`recordMatchResult`, `confirmMatchResult`) now route through the offline-tolerant mutation queue from `lib/network/mutation-queue.ts`. When offline, the wizard advances optimistically and the result syncs on reconnect. Resolves Phase 5 W3.
- `apps/mobile/lib/network/mutation-queue.ts` -- Added a tiny `subscribe(listener)` API so the new banner can react to queue size changes without polling. Notifies on enqueue (offline path), flush, and clear.
- `apps/mobile/components/match-flow/queue-status-banner.tsx` (new) -- Amber warning banner mounted at the top of `match-flow-wizard.tsx`. Shows when one or more critical writes have been queued for offline replay; auto-dismisses when the queue drains on reconnect.

**Phase 5 Track B2 -- Mobile EAS Build, Sentry, Store Listing Prep**
- `apps/mobile/app.json` -- Sets `name` to `JITS`, `slug` to `jits`, `version` to `0.1.0`. Adds `ios.bundleIdentifier` (`com.jits.mobile`, placeholder), `ios.buildNumber` (`1`), `android.package` (`com.jits.mobile`, placeholder), `android.versionCode` (`1`), `runtimeVersion.policy: "appVersion"`, `updates.url` (`https://u.expo.dev/PLACEHOLDER_PROJECT_ID`), `extra.eas.projectId` (`PLACEHOLDER_PROJECT_ID`). Splash + adaptive-icon background updated to brand red `#bf1212`. `@sentry/react-native` config plugin auto-registered.
- `apps/mobile/assets/{icon,adaptive-icon,favicon,splash-icon}.png` -- Replaced default Expo placeholders with branded EloRated logo rendered from `apps/web/public/logo.svg` via `rsvg-convert` (icon + adaptive: 1024x1024 RGBA on rounded brand-red square; favicon: 48x48; splash-icon: 1024x1024 transparent so the splash background colour shows through).
- `apps/mobile/components/error-boundary.tsx` -- `componentDidCatch` now forwards uncaught errors to Sentry via `captureError(error, { componentStack })`. No-op when Sentry isn't initialized. No fallback-UI behaviour changes.
- `apps/mobile/app/_layout.tsx` -- Calls `initSentry()` at module load (single line, additive only) so JS-bootstrap errors are captured.
- `apps/mobile/.env.example` -- Adds `EXPO_PUBLIC_SENTRY_DSN` placeholder.

**Phase 5 Track B1 -- Mobile Deep Links, Error Boundary, Offline Handling**
- `apps/mobile/app/_layout.tsx` -- Wraps app in ErrorBoundary; mounts OfflineBanner + deep link listener (additive only).
- `apps/mobile/app.json` -- Adds iOS `associatedDomains` and Android `intentFilters` for `jits.app` universal/app links.
- `apps/mobile/app/(app)/settings/index.tsx` -- Removes `Link href={href as never}` casts in favor of a typed `SettingsRoute` union; routes simplified to root paths.
- `apps/mobile/lib/auth/auth-context.tsx` -- `resetPassword` now passes `redirectTo: "jits://reset-password"` so the email lands back inside the app via the new deep-link handler.

### Fixed

- Workspace hoisting fix for `npx expo export` -- simplified `apps/mobile/metro.config.js` to use Expo SDK 52+ automatic monorepo configuration. Removed manual `watchFolders`, `nodeModulesPaths`, and `disableHierarchicalLookup: true` overrides. The previous config blocked Metro from walking nested `node_modules`, so transitive deps like `react-native-reanimated`'s `semver@^7.7.2` (which exposes `semver/functions/satisfies`) failed to resolve when an older `semver@6.3.1` was hoisted at the workspace root. `getDefaultConfig(projectRoot)` now discovers the workspace root and watch folders itself, with hierarchical lookup enabled so nested transitives resolve cleanly. Mobile bundle now compiles cleanly on iOS and Android. Unblocks Phase 5 EAS build setup.

**Phase 4 Track A2 -- Mobile Live Match Wizard**
- `apps/mobile/app/(app)/session/[id]/match/[matchId].tsx` -- Live match wizard replacing the Phase 3 stub. 8-step state machine (wait, weight, ready, live, end, result, confirm, summary) using shared `use-session-match-timer` and `use-session-match-sync` hooks.
- `apps/mobile/components/match-flow/*` -- Step components and orchestrator. Each step under 100 lines.
- `apps/mobile/lib/match-flow/*` -- Format/parse helpers and pure step-routing logic. `useMatchDetails` (cancellation-gated fetch), `useLiveControls` (pause/resume/end mutations + debounce), `useMatchCompletion` (postgres_changes listener for completed/disputed status), and `useRecordResult` (record + broadcast wrapper) split mutation logic out of step components.

**Phase 4 Track A1 -- Mobile Session Join Wizard & Lobby**
- `apps/mobile/app/(app)/session/[id]/join.tsx` -- 4-step session join wizard: geo check (expo-location), waiver acceptance, weight confirmation, summary. Uses shared `getSessionForJoin`, `acceptSessionWaiver`, `joinSessionLobby`. Replaces Phase 3 stub.
- `apps/mobile/app/(app)/session/[id]/lobby.tsx` -- Realtime session lobby with participant list, "Find Random Match" button, leave session, challenge participant. Uses native `postgres_changes` + broadcast subscriptions on `session-participants:{id}` and `session:{id}` channels (mobile-local; the shared `useLobbySync` is challenge-scoped, not session-scoped). Replaces Phase 3 stub.
- `apps/mobile/components/session/join-wizard.tsx` -- Wizard orchestrator: builds the step list dynamically (skips geo when gym lacks coords; skips waiver when already signed) and renders progress dots + Back button.
- `apps/mobile/components/session/wizard-progress.tsx` -- Reusable horizontal-dots step indicator (sibling of profile-setup's wizard-progress).
- `apps/mobile/components/session/wizard/{geo-step,waiver-step,weight-step,confirm-step}.tsx` -- Wizard step components mirroring `apps/web/app/(app)/session/[id]/join/steps/*`. Toast-based error surface; cancellation-safe state.
- `apps/mobile/components/session/lobby/{lobby-header,leave-button,participant-row,challenge-action-sheet}.tsx` -- Lobby sub-components. `challenge-action-sheet` uses RN `Alert.alert` (renders as native iOS action sheet) for casual/ranked selection.
- `apps/mobile/lib/session/distance-from-gym.ts` -- 2km proximity threshold helper wrapping `haversineKm` (matches web's lenient threshold).
- `apps/mobile/lib/session/validate-weight.ts` -- 50-400 lbs weight validator (matches profile-setup wizard).
- `apps/mobile/lib/session/use-session-for-join.ts` -- Hydrates `getSessionForJoin` + active waiver id + already-participant check. Cancellation-gated state writes per Phase 3 W3-4 review.
- `apps/mobile/lib/session/use-session-lobby.ts` -- Hydrates `getSessionLobbyData` with refresh and a participants setter so realtime can mutate locally.
- `apps/mobile/lib/session/use-session-lobby-realtime.ts` -- Mobile-local realtime hook for session lobby (postgres_changes + broadcast). Mirrors web's `apps/web/hooks/use-session-lobby-realtime.ts` pattern.

**Phase 4 Track B -- Push Notifications, Online Presence, Settings (Mobile)**
- Mobile dependencies: `expo-notifications`, `expo-device` (push notification token + device info).
- `apps/mobile/lib/notifications/register-push.ts` -- Push registration helper. Requests permission, fetches Expo push token (requires physical device), reads `Device.osName` / `Device.modelName` for the device label, and calls shared `registerPushDevice`. Returns a discriminated `RegisterPushResult` so callers can react to permission denial vs. actual failure.
- `apps/mobile/lib/notifications/handlers.ts` -- `setupNotificationHandlers()` wires `Notifications.setNotificationHandler` (foreground banner display) and `addNotificationResponseReceivedListener` (tap deep-link via `router.push(payload.data.route)`).
- `apps/mobile/lib/notifications/push-registration-bootstrap.tsx` -- Side-effect bootstrap component (renders null) mounted inside `<AuthProvider>` to register on athlete login.
- `apps/mobile/lib/presence/use-online-presence.ts` -- AppState-aware online presence hook on the `app:online` Supabase Presence channel. Subscribes only when foreground; untracks on background to avoid phantom presence. Exposes `useOnlineStatus(athleteId)` consumer hook backed by `useSyncExternalStore` (mirrors web's pattern).
- `apps/mobile/lib/presence/online-presence-bootstrap.tsx` -- Renders null; mounted inside `<AuthProvider>` to start the channel for the current athlete.
- `apps/mobile/components/notifications/notification-bell.tsx` -- Bell icon with unread badge (consumes shared `usePendingChallenges`). Tapping opens `NotificationPanel`.
- `apps/mobile/components/notifications/notification-panel.tsx` -- Bottom-sheet (gorhom) listing pending challenges. Mirrors `apps/web/components/domain/notification-panel.tsx`.
- `apps/mobile/components/online-indicator.tsx` -- Small green dot rendered only when `useOnlineStatus` returns true.
- `apps/mobile/hooks/use-unread-count.ts` -- AppState-aware unread polling (30s + foreground refresh + manual `refreshUnreadCounts()`). Mobile equivalent of web's window-event hook.

**Phase 3 Track A -- Mobile Dashboard & Profile**
- `apps/mobile/app/(app)/(home)/index.tsx` -- Dashboard with stat overview, active session card, recent matches, and recent activity. Pull-to-refresh via `RefreshControl`. Fetches `getDashboardSummary` + `getActiveSession` in parallel from `@jits/shared`.
- `apps/mobile/app/(app)/profile/index.tsx` -- Profile screen with header (avatar via `expo-image`, name, gym, ELO, record), View Stats / Share buttons, quick stats row, and account section (Edit Profile placeholder, Settings link, Sign Out).
- `apps/mobile/app/(app)/profile/stats.tsx` -- Match history list (FlatList with ranked/casual filter, W-L-D summary) and ELO history placeholder card. Pull-to-refresh.
- `apps/mobile/components/match-card.tsx` -- Native MatchCard mirroring web API. Outcome badges (success/destructive/secondary), ELO delta with color, formatted relative date, optional match-type label, optional `onPress` for navigation.
- `apps/mobile/components/elo-badge.tsx` -- ELO display with `getEloTierBorderClass()` helper porting web's tier thresholds (1400+/1200/1000/<1000). Variants: `display`, `compact`, `stakes`.
- `apps/mobile/components/share-profile-sheet.tsx` -- Bottom-sheet share dialog using gorhom + RN `Share.share`. Builds `https://jits.app/athlete/{id}` URL.
- `apps/mobile/components/dashboard/stat-overview.tsx` -- 2x2 stat grid (ELO, Rank, Record, Win Streak) with peak labels.
- `apps/mobile/components/dashboard/active-session-card.tsx` -- Active/scheduled session card with check-in CTA; falls back to "Find a session" prompt when no active session.
- `apps/mobile/components/dashboard/recent-activity-section.tsx` -- Filterable activity feed with scope (All/Me) and type (All/Ranked/Casual) pills, mirroring web's variant.
- `apps/mobile/components/profile/profile-header.tsx` -- Profile avatar (`expo-image`) with tier-colored ring, name, gym, ELO badge, W-L record, win rate.
- `apps/mobile/components/profile/profile-quick-stats.tsx` -- 2x2 quick stats grid (Total Matches, Current Streak, Best Streak, ELO This Month).

**Phase 3 Track B -- Gyms, Leaderboard, Competitor Profile (Mobile)**
- `apps/mobile/app/(app)/gyms/index.tsx` -- Gym finder list with text filter, location-aware distance (opt-in `expo-location`), pull-to-refresh.
- `apps/mobile/app/(app)/gyms/[id].tsx` -- Gym detail screen with upcoming sessions list. Tapping a session navigates to the join wizard (Phase 4 stub).
- `apps/mobile/app/(app)/leaderboard/index.tsx` -- Leaderboard with fighter/gym tabs and gender filter pills (defaults to the athlete's own gender when set).
- `apps/mobile/app/(app)/athlete/[id].tsx` -- Competitor profile with header (avatar, ELO, record), head-to-head stats card, and Compare Stats modal. Challenge button is a Phase 4 stub (toast info).
- `apps/mobile/components/athlete-card.tsx` -- Athlete row card with rank icon, avatar (`expo-image`), ELO trend, record, and gym (mirrors web).
- `apps/mobile/components/session-card.tsx` -- Session row card with start time, capacity, host name; tap routes to session join.
- `apps/mobile/components/gyms/gym-card.tsx` -- Gym row card with city, member/session counts, optional distance label.
- `apps/mobile/components/compare-stats-modal.tsx` -- Side-by-side stats comparison built on the existing `Dialog` primitive, with All/Ranked/Casual filters.
- `apps/mobile/lib/location/use-location.ts` -- `expo-location` permission + position hook (opt-in, no auto-request) plus `haversineKm` and `formatDistanceKm` helpers.

### Changed

**Phase 5 Track A -- Live Step Integration (Mobile)**
- `apps/mobile/components/match-flow/steps/live-step.tsx` -- Mounts the `<CameraOverlay />` thumbnail above the timer, auto-starts recording when permission flips to granted, auto-stops on end-match (both local end and opponent broadcast), activates the wake-lock for the duration of the step, and fires haptics on match start, time-warning (<= 10s remaining), and match end. Recording is best-effort: a permission-denied user still progresses through the wizard normally.
- `apps/mobile/app.json` -- Adds the `expo-camera` plugin entry with iOS camera + microphone permission strings (`NSCameraUsageDescription` + `NSMicrophoneUsageDescription`) and Android `CAMERA` + `RECORD_AUDIO` permissions plus `recordAudioAndroid: true`.

**Phase 4 Track B -- Settings & Bell Placement (Mobile)**
- `apps/mobile/app/(app)/settings/index.tsx` -- Real settings menu replacing Phase 2 stub. Match Preferences (looking-for-casual, looking-for-ranked toggles via `toggleMatchPreferences`), Notifications placeholder card, General links (Video / Feedback / Help), Account (Sign Out with confirm), and dev-gated Realtime smoke test. Preserves the `__DEV__` developer entry.
- `apps/mobile/app/(app)/settings/feedback.tsx` -- Feedback form mirroring web's flow (Bug / Feature / General categories, multiline message, char counter, success state). Inserts into `feedback` table with the same row shape as `apps/web/app/(app)/settings/feedback/feedback-form.tsx`.
- `apps/mobile/app/(app)/settings/help.tsx` -- FAQ ported from web (6 items, expandable rows). Email Support button via `Linking.openURL("mailto:...")`.
- `apps/mobile/app/(app)/settings/video.tsx` -- Placeholder mirroring web's minimal video settings page.
- `apps/mobile/app/_layout.tsx` -- Mounts `<PushRegistrationBootstrap />` and `<OnlinePresenceBootstrap />` inside the existing `<AuthProvider>` (additive only).
- `apps/mobile/app/(app)/(home)/index.tsx` -- Surgical addition: `<NotificationBell athleteId={athlete.id} />` in the existing greeting header.
- `apps/mobile/app.json` -- Adds the `expo-notifications` plugin (notification color, default channel) and iOS `UIBackgroundModes: ["remote-notification"]` for background push.

**Phase 3 Track A**
- `apps/mobile/app/(app)/_layout.tsx` -- Tab bar now uses `lucide-react-native` icons (Home, Dumbbell, Trophy, User) with theme-aware active/inactive tint via `useThemedTokens()`.

**Phase 1 -- Dark Mode + Phase 3 Native Dependencies**
- Mobile dependencies: `lucide-react-native`, `expo-image`, `expo-image-picker`, `expo-location`. Used by Phase 3 screens (profile photo upload, gym distance, tab icons, performant images).
- `apps/mobile/lib/theme/theme-provider.tsx`, `use-theme.ts`, `index.ts` -- Theme provider + hook wiring system color scheme into NativeWind dark variants. `ThemeProvider` mounts at the root and applies `vars()` overrides on dark mode; `useThemedTokens()` returns the right runtime token map for RN APIs that can't take className.

**Phase 1 -- Monorepo + Expo Scaffold**
- `apps/mobile/` -- Expo React Native app scaffold (`@jits/mobile`) on Expo SDK 54 with Expo Router, NativeWind v4, and `@gorhom/bottom-sheet`.
- `apps/mobile/metro.config.js` -- Metro configured to watch the workspace root and resolve hoisted `node_modules` (`watchFolders` + `nodeModulesPaths` + `disableHierarchicalLookup`); wraps the config with `withNativeWind`.
- `apps/mobile/babel.config.js`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts` -- NativeWind v4 setup using `babel-preset-expo` with `jsxImportSource: "nativewind"`, `nativewind/babel` preset, and `react-native-reanimated/plugin` last.
- `apps/mobile/tsconfig.json` -- Extends root `tsconfig.base.json`, adds `@jits/shared`/`@jits/shared/*` path aliases and `expo-router/types`.
- Root scripts: `start:mobile`, `typecheck:mobile`.
- `apps/mobile/app.json` -- Adds `scheme: "jits"` for deep linking, `plugins: ["expo-router"]`, and `web.bundler: "metro"`.
- `apps/mobile/components/ui/*` -- Native UI primitives (Button, Card, Input, Label, Avatar, Badge with success variant, Separator, Tabs, Switch, Sheet, Dialog, Select, Toast). NativeWind v4 + class-variance-authority. API mirrors shadcn/ui where reasonable.
- `apps/mobile/lib/cn.ts` -- `cn()` helper for conditional classNames (clsx + tailwind-merge).
- `apps/mobile/lib/tokens.ts` -- semantic color tokens (mirrors web globals.css).
- `apps/mobile/tailwind.config.js` -- Theme extends with light/dark semantic tokens.
- `apps/mobile/app/**` -- Expo Router navigation skeleton with stub screens. Auth group (login/signup/forgot-password), app tab navigator (Home/Gyms/Rankings/Profile), nested session and match routes, athlete profile, settings, profile-setup wizard.

**Phase 2 -- Realtime Hooks & Smoke Test (Track B)**
- `packages/shared/src/hooks/*` -- Ported six platform-agnostic realtime hooks from `apps/web/hooks/`: `use-session-match-timer`, `use-session-match-sync`, `use-match-sync`, `use-lobby-sync`, `use-pending-challenges`, `use-global-notifications`. Hooks now accept the Supabase client as a parameter so the same code runs on web and React Native. `use-lobby-sync` parameterizes navigation via an `onMatchStarted` callback (web `router.push`, mobile expo-router); `use-global-notifications` parameterizes toast (`notify`), current-route lookup (`getCurrentRoute`), unread refresh (`onUnreadRefresh`), and deep-link builders (`buildMessageHref`, `buildLobbyHref`).
- `packages/shared/package.json` -- Adds `./hooks` and `./hooks/*` exports plus `react` peerDependency so the package can house React hooks.
- `apps/mobile/app/(app)/settings/realtime-test.tsx` -- Developer-only smoke-test screen exercising all four Supabase realtime patterns (channel subscribe, presence on `app:online`, broadcast self-echo, postgres-changes on `gyms`) plus `AppState` foreground/background logging. Cleans up channels on unmount.
- `apps/mobile/app/(app)/settings/index.tsx` -- Adds a "Realtime smoke test" entry gated by `__DEV__` so it never ships to production.

**Phase 2 -- Auth Foundation**
- `apps/mobile/lib/supabase/client.ts` -- Supabase mobile client using `expo-secure-store` for token persistence; realtime configured with `heartbeatIntervalMs: 15_000` (no Web Worker on RN). Imports `react-native-url-polyfill/auto` for URL support.
- `apps/mobile/lib/supabase/secure-storage.ts` -- async storage adapter wrapping `expo-secure-store` for Supabase auth (matches `SupportedStorage` interface).
- `apps/mobile/lib/auth/auth-context.tsx` -- `AuthProvider` Context exposing `user`, `session`, `athlete`, `isLoading`, `isAthleteActive`, `signIn`, `signUp`, `signOut`, `resetPassword`, `refreshAthlete`. Subscribes to `onAuthStateChange` and keeps the athlete row in sync via inline Supabase query (mirrors `apps/web/lib/guards.ts` select list).
- `apps/mobile/lib/auth/hooks.ts` -- `useAuth`, `useRequireAuth`, `useRequireAthlete` guard hooks. Mirrors web's `lib/guards.ts` but client-side via Expo Router `router.replace()`.
- `apps/mobile/lib/env.ts` -- typed env access via `expo-constants` and `process.env.EXPO_PUBLIC_*`. Lazy getters so `expo export` can bundle without env vars set.
- `apps/mobile/.env.example` -- documents `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Mobile dependencies: `@supabase/supabase-js@^2.94.1`, `expo-secure-store@~15.0.8`, `@react-native-async-storage/async-storage@2.2.0`, `react-native-url-polyfill@^3.0.0`.
- `apps/mobile/components/auth/auth-form-field.tsx` -- Shared label + input + inline error component used by login, signup, and forgot-password screens.
- `apps/mobile/components/profile-setup/*` -- Native multi-step setup wizard: `setup-wizard.tsx` (orchestrator), `wizard-progress.tsx`, `tos-step.tsx`, `identity-step.tsx`, `training-step.tsx`, `optional-step.tsx`, plus `types.ts`. Mirrors `apps/web/app/profile/setup/*`.
- `apps/mobile/lib/profile-setup/*` -- Wizard helpers: `validation.ts` (DOB/age/weight rules), `use-setup-data.ts` (loads athlete/gyms/waiver state), `use-setup-submit.ts` (TOS acknowledgement insert + athlete upsert + `refreshAthlete()` + redirect).
- `packages/shared/src/utils/tos-content.ts` -- Shared `TOS_TEXT` consumed by both web and mobile setup flows. Re-exported from `@jits/shared/utils`.

### Changed

- Extracted `getCurrentAthlete(supabase, authUserId)` and `ATHLETE_GUARD_SELECT` constant to `@jits/shared/api/queries`. Web's `lib/guards.ts` and mobile's `lib/auth/auth-context.tsx` now share the same source of truth, eliminating drift risk.

**Phase 1 -- Dark Mode Wiring**
- `apps/mobile/app.json` -- `userInterfaceStyle: "automatic"` (was `"light"`). Adds `expo-image-picker` (`photosPermission`, `cameraPermission`) and `expo-location` (`locationWhenInUsePermission`) plugin entries with iOS permission descriptions.
- `apps/mobile/tailwind.config.js` -- Semantic color tokens now resolve to `var(--<token>)`; light values are declared on `:root` via an `addBase` plugin and `darkMode` is set to `"media"`. NativeWind classes (`bg-background`, `text-foreground`, etc.) automatically follow the system color scheme via the root `ThemeProvider`. Resolves Phase 1 W1, W5.
- `apps/mobile/app/_layout.tsx` -- Wraps the app in `<ThemeProvider>` so dark-mode CSS variables propagate to all descendants.
- `apps/mobile/lib/tokens.ts` -- Both `lightTokens` and `darkTokens` now share an explicit `ColorTokens` type so the dark map is assignable wherever the light map is expected (used by `useThemedTokens()`).
- `apps/mobile/components/ui/switch.tsx` -- Reads system color scheme via `useThemedTokens()` to pick the light/dark token map for `trackColor`, `thumbColor`, and `ios_backgroundColor` (resolves Phase 1 W3).
- `apps/mobile/components/ui/sheet.tsx` -- `BottomSheet.backgroundStyle` and `handleIndicatorStyle` now driven by `useThemedTokens()` (replaces the hardcoded `hsl(0,0%,100%)` background).
- `apps/mobile/components/ui/input.tsx` -- `placeholderTextColor` defaults to the themed `mutedForeground` token instead of the hardcoded light HSL string.

**Phase 1 -- Monorepo Restructure**
- Restructured repo into npm monorepo: web app moved to `apps/web/`, shared data layer extracted to `packages/shared/` (`@jits/shared`).
  - Files moved: `lib/api/*`, `lib/constants.ts`, `types/*`, pure functions from `lib/utils.ts` (`getInitials`, `extractGymName`, `formatRelativeDate`, `formatRelativeTime`).
  - Web app imports updated to reference `@jits/shared`.
  - Web-specific utilities (`cn`, `hasEnvVars`, `getEloTierClass`, `getProfilePhotoUrl`) remain in `apps/web/lib/utils.ts`.
  - `db:types` script moved to root and now writes to `packages/shared/src/types/database.ts`.
  - Husky `prepare` hook moved to root; pre-commit delegates to workspace scripts.
  - Next.js `turbopack.root` set in `apps/web/next.config.ts` to silence multi-lockfile warning.
  - Post-merge tidy: removed dead `outside_assets` from `apps/web/tsconfig.json` exclude, made `.husky/pre-commit` executable, removed stale root-level build artifacts (`.next/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`).

**Phase 2 -- Realtime Hooks (Track B)**
- `apps/web/components/layout/global-notifications-provider.tsx`, `apps/web/components/domain/notification-bell.tsx`, `apps/web/components/domain/notification-panel.tsx`, `apps/web/app/(app)/match/lobby/[id]/lobby-actions.tsx`, `apps/web/app/(app)/match/[id]/live/match-timer.tsx`, `apps/web/app/(app)/match/[id]/results/record-result-form.tsx`, `apps/web/app/(app)/session/[id]/match/[matchId]/{match-flow-wizard,steps/*}.tsx` -- Updated imports from `@/hooks/<name>` to `@jits/shared/hooks/<name>`. Now pass the Supabase client (memoized via `useMemo(() => createClient(), [])`) and platform-specific callbacks (`onMatchStarted`, `notify`, `getCurrentRoute`, `onUnreadRefresh`, `buildMessageHref`, `buildLobbyHref`) into the shared hooks. Behavior is unchanged.

**Phase 2 -- Auth Wiring**
- `apps/mobile/app/_layout.tsx` -- Wraps app in `AuthProvider`; mounts `Toaster` for in-app notifications (resolves Phase 1 W2).
- `apps/mobile/app/index.tsx` -- Auth-aware routing: redirects to `/login`, `/profile-setup`, or `/(app)/(home)` based on auth state. First runtime use of `@jits/shared/types/database` and `@jits/shared/constants` from mobile (resolves Phase 1 W4).
- `apps/mobile/app/(auth)/login.tsx`, `signup.tsx`, `forgot-password.tsx` -- Replace B3 stubs with email/password forms wired to AuthProvider. Use UI primitives (Card, Input, Label, Button) and Toaster for errors. Inline validation, loading states, KeyboardAvoidingView. OAuth deferred.
- `apps/mobile/app/profile-setup.tsx` -- Replace B3 stub with multi-step setup wizard. Step 1: TOS acceptance writes to `waiver_acknowledgements`. Step 2: identity/training/optional sub-steps with display_name, gender, DOB, weight, primary gym (picker) or free agent toggle, city. Calls `refreshAthlete()` after activation, then redirects to `/`.
- Moved `apps/web/lib/tos-content.ts` to `packages/shared/src/utils/tos-content.ts` for use by both web and mobile setup flows. Web import path updated to `@jits/shared/utils`.

### Beta Hardening Pass (2026-04-23)

**Added**
- `app/(app)/settings/help/page.tsx` -- Static FAQ page at `/settings/help` with 6 common questions covering sessions, ELO, match types, results, weight, and issue reporting. Uses native `<details>` elements with support contact section.
- `app/(app)/settings/feedback/page.tsx` + `feedback-form.tsx` -- Real feedback form replacing placeholder. Client component with category selector (Bug Report, Feature Request, General Feedback), textarea with character counter, Supabase insert, success/error states.

**Changed**
- `app/(app)/leaderboard/page.tsx` -- Adds `highest_elo` to query, computes real `eloTrend` per athlete (up/down/neutral based on current vs peak ELO); zero new RPC calls.
- `app/(app)/leaderboard/leaderboard-content.tsx` -- Passes computed `eloTrend` through to `AthleteCard`.
- `components/domain/athlete-card.tsx` -- Renders `TrendingUp`, `TrendingDown`, or `Minus` icon next to ELO value using semantic color tokens.

**Fixed**
- `lib/api/queries.ts` -- All 12 query functions now check for Supabase errors, log via `console.error`, and return safe fallbacks (`null`, `[]`, `new Map()`, or `false`). Previously errors were silently swallowed.
- `lib/api/chat-queries.ts` -- Same fix for `getConversations`, `getUnreadCounts`, and `getMessages`.

**Removed**
- `messagesEnabled` flag from `lib/feature-flags.ts` -- never checked anywhere in codebase
- `hooks/use-feature-flag.ts` -- unused hook wrapper; flags accessed via `getFlag()` directly

### Claude Design Prep + EloRated Rebrand (2026-04-20)

**Added**
- `DESIGN.md` -- Design system reference for Claude Design onboarding: brand identity (EloRated), color token usage rules, full component inventory (15 shadcn primitives, 29 domain components, 5 layout components), interaction patterns, and layout constraints
- `public/logo.svg` -- Geometric E icon mark with ascending bars (rising ELO chart) and gold peak accent. Brand red container, white letterform, gold step. Three colors, ~700 bytes.

### Conversational Design Feedback Tool (2026-04-17)

**Added**
- `specs/visual-review/feedback-server.mjs` -- Zero-dependency Node bridge server (port 3847) that proxies between the browser-based screen inventory and Claude CLI. Endpoints: `POST /api/chat` (SSE-streamed Claude responses via `--output-format stream-json --include-partial-messages`), `GET /api/diff` (git diff of Claude's changes), `POST /api/accept` (selective git commit), `POST /api/reject` (selective file revert using pre-chat snapshot), `POST /api/cancel` (kill active process), `GET /api/status` (busy/idle state). Serves static files from `specs/visual-review/` so the HTML works at `http://localhost:3847/`. Multi-turn conversations via `--session-id` + `--resume`. Snapshot-based revert only touches files Claude changed (not pre-existing uncommitted work).

**Changed**
- `specs/visual-review/feedback-server.mjs` -- Rewrote stream-json parser to handle `stream_event` wrapper format (content_block_delta for incremental text, content_block_start for tool_use). Added stdout line buffer to fix JSON splitting across chunk boundaries. Added `--include-partial-messages` for real token-by-token streaming. Safety: accept/reject guarded during active Claude process (409); snapshot preserved across multi-turn (only taken when no pending changes); getDirtyFiles includes staged files; reject unstages before reverting; per-file try/catch in unlinkSync.
- `specs/visual-review/screen-inventory.html` -- Styled error messages (red block instead of inline text), cost/duration footer after responses, friendly 409 busy message, better tool_use display ("Editing file..." / "Reading file...").
- `specs/visual-review/screen-inventory.html` -- Reconstructed 19-screen wireframe inventory with v2 feedback overlay: chat panel with threaded messages, streaming text display, inline diff preview (colored unified diff), Accept/Reject buttons per response, pin status badges (open/accepted/rejected), server connection indicator with 10s polling, graceful offline fallback to static pin editing. Data model v2 adds `status`, `sessionId`, `messages[]` per pin with backward-compatible migration from v1 `text` field. Enter to send, Shift+Enter for newline, auto-scroll, cancel button.
- `specs/visual-review/apply-feedback.mjs` -- Updated CLI: launcher mode (no args) starts the bridge server + opens browser; legacy CLI mode preserved for batch processing exported JSON files.

### Screen Inventory Updates (2026-04-15)

**Changed**
- `specs/visual-review/screen-inventory.html` -- Match flow routes (screens 10-17) updated from `/match/[id]/*` to `/session/[id]/match/[matchId] (step: <name>)`. Session Lobby header changed to "Session Lobby", removed planned-but-unshipped timer bar and Timekeeper button. Dashboard "Pending Challenges" renamed to "Recent Activity". Bottom nav corrected across all wireframes (Home/Gyms/Rankings/Profile). Gym Detail notes flag shipped vs planned components.

### UX/UI Full-Pass Review (2026-04-13)

Three-team review (PM + design + implementation). 14 ship-now items plus 6 design decisions.

**Added**
- `components/domain/session-unavailable.tsx` — shared "session not available" UI with `reason?: "not-found" | "ended"`
- `app/profile/setup/setup-wizard.tsx` — multi-step profile-setup stepper (replaces single `setup-form.tsx`)
- `app/profile/setup/wizard-progress.tsx` — reusable dot-progress indicator matching join-wizard pattern
- `app/profile/setup/use-setup-submit.ts` — hook extracting TOS accept + submit logic
- `app/profile/setup/steps/identity-step.tsx`, `training-step.tsx`, `optional-step.tsx`
- Match timer end-of-round signals in `fighter-live-step.tsx`: 800Hz/300ms Web Audio beep, `navigator.vibrate([200,100,200])`, and a visual pulse (`.animate-timer-expired` keyframe in `globals.css`). Single-fire guard via ref, respects `prefers-reduced-motion`.
- `sr-only` `aria-live="polite"` regions in lobby (participant join/leave, challenge received) and match (paused/resumed/expired)
- `role="progressbar"` + `aria-value*` + "Step X of Y — {name}" caption on join-wizard and setup-wizard progress dots
- Back button on join-wizard steps 2+ and setup-wizard steps 2+
- `isCheckedIn` field on `ActiveSessionInfo` (extends `getActiveSession` with a light `session_participants` existence check for RSVP path)

**Changed**
- `app/globals.css` — `--success` light-mode lightness `42% → 37%` for WCAG AA contrast on `--background`; added `@keyframes timer-expired-pulse` under `prefers-reduced-motion: no-preference`
- CLAUDE.md Principle 9 — inline win/loss text now recommends `text-success` / `text-destructive` tokens (was `text-green-500` / `text-red-500`)
- Inline W/L/ELO stat text switched to `text-success` / `text-destructive` tokens across 15+ domain components (match-card, elo-badge, athlete-card, profile-header, stat-overview, challenge-sheet, challenge-response-sheet, compare-stats-modal, session-challenge-sheet, match-history-list, stats-tabs, editable-profile-header, match-summary-step)
- `components/domain/challenge-badge.tsx` — added `dark:text-amber-400 dark:bg-amber-500/15` for dark-mode contrast
- `app/(app)/profile/stats/elo-sparkline.tsx` — hardcoded RGB stroke/fill replaced with `hsl(var(--success))` / `hsl(var(--destructive))`
- `app/(app)/session/[id]/join/steps/weight-confirm-step.tsx` — added `<Label htmlFor="weight">`, `id="weight"`, `inputMode="decimal"`, `autoComplete="off"`; heading now "Confirm your weight (lbs)"
- `app/(app)/session/[id]/join/steps/waiver-step.tsx` — loading label "Signing..." → "Accepting..."
- `app/(app)/session/[id]/join/steps/geo-check-step.tsx` — "Continue anyway" → "Continue"; softer explanatory copy for out-of-geo/denied cases
- `app/(app)/session/[id]/match/[matchId]/steps/result-recording-step.tsx` — "Submit Result" → "Record Result"; 60s timekeeper lock shows live countdown ("Waiting for timekeeper... {n}s")
- `app/(app)/session/[id]/match/[matchId]/steps/ready-check-step.tsx` — added subtitle "Both athletes must tap Ready to start."
- `components/domain/recent-activity-section.tsx` — dead `/arena` empty-state link replaced with `/gyms` ("Find a session")
- `components/domain/active-session-card.tsx` — primary button now shows "Check In" (→ `/session/{id}/join`) when `!isCheckedIn`, else "Go to Lobby" (→ `/session/{id}/lobby`)
- `app/(app)/leaderboard/leaderboard-content.tsx` — gender filter and mode toggle now URL-backed via `useSearchParams`; defaults stripped from URL; preserved other params
- `app/(app)/session/[id]/lobby/session-challenge-sheet.tsx` — stake rows get `aria-label="Win/Draw/Loss: ±N ELO"` and icons get `aria-hidden`
- `app/(app)/session/[id]/lobby/session-lobby-content.tsx` — silent redirect on missing session replaced with `<SessionUnavailable reason="not-found" />`; existing ended branch reuses the component
- `app/(app)/session/[id]/join/join-content.tsx` — `notFound()` replaced with `<SessionUnavailable reason="not-found" />` for friendlier messaging
- `lib/api/queries.ts` — `getActiveSession` returns `isCheckedIn`; `types/session.ts` `ActiveSessionInfo` extended
- `hooks/use-session-lobby-realtime.ts` — emits `announcement` state for aria-live consumers
- Auth forms (`login-form.tsx`, `sign-up-form.tsx`, `forgot-password-form.tsx`) — added `autoComplete` (`email`, `current-password`, `new-password`)

**Removed**
- `app/profile/setup/setup-form.tsx` — superseded by `setup-wizard.tsx`

### Phase 9: Leaderboard Updates (2026-04-13)

**Added**
- Gender filter pills (All/Male/Female) on leaderboard for client-side athlete filtering
- `eloTrend` prop on `AthleteCard` for ELO trend indicators (hardcoded neutral for now)

**Changed**
- Leaderboard data fetch now includes `gender` column from athletes table
- `AthleteCard` ELO display updated to support inline trend icon

### Phase 10: Settings and Profile (2026-04-13)

**Added**
- Video Settings stub page at `app/(app)/settings/video/page.tsx`
- Feedback stub page at `app/(app)/settings/feedback/page.tsx`
- Help & Support stub page at `app/(app)/settings/help/page.tsx`
- Settings "General" section with navigation links to Video, Feedback, and Help pages

**Note**
- City display and editing in profile header was already implemented in Phase 1
- City is already included in `ATHLETE_GUARD_SELECT` from Phase 1

### Phase 7-8: Confirmation/Dispute + Dashboard Cleanup (2026-04-13)

**Added**
- "Sessions" section header with Calendar icon on dashboard

**Changed**
- Dashboard `ActiveSessionCard` now wrapped in styled section matching other dashboard sections

**Note**
- `confirmMatchResult`, `disputeMatchResult` mutations and `ALREADY_CONFIRMED`/`ALREADY_DISPUTED` error codes were already implemented in Phase 6
- `ActiveSessionCard` and `getActiveSession` were already implemented in Phase 3
- Challenge sections were already removed in Phase 2

### Phase 6: Session Match Flow (2026-04-12)

**Added**
- Match flow wizard at `/session/[id]/match/[matchId]` with 8-step state machine (`app/(app)/session/[id]/match/[matchId]/`)
- Timer hook (`hooks/use-session-match-timer.ts`) with pause/resume awareness and broadcast sync
- Match sync hook (`hooks/use-session-match-sync.ts`) for 7 broadcast events (timer, ready, result, confirm)
- Video recorder hook (`hooks/use-video-recorder.ts`) with MediaRecorder, codec negotiation, Supabase Storage upload
- 8 step components: timekeeper-wait, weight-verify, ready-check, fighter-live, timekeeper-live, result-recording, match-summary, match-recorded
- 5 mutations: `pauseMatch`, `resumeMatch`, `endMatch`, `confirmMatchResult`, `disputeMatchResult`
- 3 error codes: `MATCH_NOT_PAUSED`, `ALREADY_CONFIRMED`, `ALREADY_DISPUTED`
- Dual confirmation flow with Postgres Changes auto-advance on both-confirm
- Timekeeper disconnect fallback (60s timeout) in result recording

**Changed**
- `lib/api/queries.ts` extended `MatchDetails` with session fields (`session_id`, `paused_at`, `total_paused_duration`, `timekeeper_id`)

### Phase 5: Session Lobby (2026-04-12)

**Added**
- Session lobby page at `/session/[id]/lobby` with real-time participant list (`app/(app)/session/[id]/lobby/`)
- Realtime hook (`hooks/use-session-lobby-realtime.ts`) with Postgres Changes (participant INSERT/UPDATE/DELETE) and Broadcast (ephemeral challenges, match_started, participant_joined)
- Participant card with avatar, ELO, weight, and challenge button (`participant-card.tsx`)
- In-session challenge sheet with match type toggle and ELO stakes preview (`session-challenge-sheet.tsx`)
- Incoming challenge sheet with accept/decline (`session-challenge-received-sheet.tsx`)
- Random match button calling `random_match` RPC (`random-match-button.tsx`)
- `getSessionLobbyData` query wrapping `get_session_lobby` RPC
- `createInSessionMatch`, `leaveSessionLobby`, `requestRandomMatch` mutations
- Broadcast of `participant_joined` from join wizard confirm step for real-time lobby updates

**Changed**
- `types/session.ts` extended `SessionLobbyData` with `gymName` and `status` fields
- `app/(app)/session/[id]/join/confirm-step.tsx` now broadcasts participant info on join

### Phase 4: Session Lobby Entry (Join Wizard) (2026-04-12)

**Added**
- Session join wizard at `/session/[id]/join` with 4 steps: geo check, waiver, weight confirm, lobby entry (`app/(app)/session/[id]/join/`)
- Geo check step with soft location validation using Haversine formula (`steps/geo-check-step.tsx`)
- Waiver signing step with scrollable text and checkbox (`steps/waiver-step.tsx`)
- Weight confirmation step pre-filled from athlete profile (`steps/weight-confirm-step.tsx`)
- Confirm and join step with session summary and lobby entry (`steps/confirm-step.tsx`)
- `requireSessionParticipant` guard in `lib/guards.ts` for lobby page access control
- `getSessionForJoin` query in `lib/api/queries.ts` for fetching session, gym coords, waiver status, and athlete weight
- `joinSessionLobby` and `acceptSessionWaiver` mutations in `lib/api/mutations.ts`
- Context-aware unique constraint mapping in `lib/api/errors.ts` for `session_join` context

### Phase 3: Gym Finder, Sessions & Dashboard Card (2026-04-12)

**Added**
- Gym Finder page at `/gyms` with search and session indicators (`app/(app)/gyms/`)
- Gym Detail page at `/gyms/[id]` with session list and RSVP (`app/(app)/gyms/[id]/`)
- Session card domain component (`components/domain/session-card.tsx`)
- Gym card domain component (`components/domain/gym-card.tsx`)
- Active session card on dashboard (`components/domain/active-session-card.tsx`)
- "Start Session" button for gym members (prototype testing)
- Session types (`types/session.ts`)
- Session queries: `getGymsWithSessions`, `getGymDetail`, `getActiveSession` (`lib/api/queries.ts`)
- Session mutations: `rsvpToSession`, `cancelRsvp`, `createSession` (`lib/api/mutations.ts`)
- Session error codes in `lib/api/errors.ts`: `SESSION_NOT_FOUND`, `SESSION_FULL`, `ALREADY_JOINED`, `SESSION_NOT_ACTIVE`, `NOT_SESSION_PARTICIPANT`, `WAIVER_REQUIRED`

**Changed**
- Dashboard: replaced Challenges section with Active Session card

### Phase 2: Navigation and hidden features (2026-04-12)

**Added**
- `lib/feature-flags.ts` — Hardcoded feature flag utility with `getFlag()` and `FeatureFlag` type. Initial flags: `timekeeperEnabled`, `messagesEnabled` (both false).
- `hooks/use-feature-flag.ts` — Client hook wrapper for `getFlag()`.
- `app/(app)/gyms/page.tsx` — Placeholder Gyms page ("Coming soon") for bottom nav link.

**Changed**
- `components/layout/bottom-nav-bar.tsx` — Replaced 5-tab nav with 4 tabs: Home, Gyms (MapPin icon), Rankings, Profile. Removed Messages tab, unread badge, and `useUnreadCount` hook. Updated `HIDE_PATTERNS` for session sub-routes.
- `components/layout/bottom-nav-bar.test.tsx` — Updated tests for new 4-tab configuration.
- `app/(app)/page.tsx` — Removed Challenges section from dashboard. Updated HeroSubtitle CTA: "/arena" to "/gyms", "Start looking for matches" to "Find a session", Swords icon to MapPin.
- `app/(app)/arena/page.tsx` — Added `redirect("/")` to hide route.
- `app/(app)/arena/swipe/page.tsx` — Added `redirect("/")` to hide route.
- `app/(app)/match/pending/pending-challenges-content.tsx` — Added `redirect("/")` to hide route.
- `app/(app)/match/lobby/[id]/lobby-content.tsx` — Added `redirect("/")` to hide route.
- `app/(app)/athlete/[id]/challenges/challenges-content.tsx` — Added `redirect("/")` to hide route.

### Phase 1: Registration and onboarding updates (2026-04-12)

**Added**
- `app/profile/setup/theme-picker.tsx` — Extracted theme picker into standalone client component (~40 lines).
- `app/profile/setup/tos-step.tsx` — Terms of Service acceptance step with scrollable text, checkbox, and continue button.
- `lib/tos-content.ts` — Placeholder TOS text constant covering risk acknowledgement, liability release, facility rules, health/insurance, and code of conduct.
- Gender (Select, M/F, required), Date of Birth (date input, required, age >= 16), and City (text, optional) fields added to setup form.
- TOS acceptance stored via `waiver_acknowledgements` table (waiver slug `app-liability-v1`); setup form is now a two-step wizard (TOS first, then profile fields).
- City field added to `EditableProfileHeader` with inline edit support (new `CityField` sub-component).

**Changed**
- `app/profile/setup/setup-form.tsx` — Replaced inline theme grid with `<ThemePicker />` import; added gender/DOB/city state, validation, and Supabase payload fields; added TOS step state. TOS insert has error handling with retry support.
- `app/profile/setup/page.tsx` — Fetches `gender`, `date_of_birth`, `city` from athlete record; queries `waivers` and `waiver_acknowledgements` for TOS status; passes new props to `SetupForm`.
- `lib/guards.ts` — Added `gender`, `date_of_birth`, `city` to `ATHLETE_GUARD_SELECT`.
- `types/database.ts` — Updated generated types to include `gender`, `date_of_birth`, `city` on athletes table, plus `waivers`, `waiver_acknowledgements`, and other new tables from Phase 0 migrations.
- `components/profile/editable-profile-header.tsx` — Added `city` to athlete prop Pick type, `EditingField` union, cancel/save logic, and render tree. Note: component is now ~430 lines (tech debt, already tracked).

### Code quality audit fixes (2026-03-06)

**Fixed**
- `components/domain/conversation-card.tsx` — Unread timestamp used `text-primary` (brand color); changed to `text-foreground` per color token conventions.
- `lib/api/mutations.ts` — `createChallenge()` had unsafe `.data!` non-null assertion on `auth_athlete_id` RPC; replaced with proper null check and early error return.
- `app/(app)/arena/looking-for-match-toggle.tsx` — Used raw `supabase.from("athletes").update()` instead of `toggleMatchPreferences()` mutation from API layer; now uses mutation with optimistic rollback on failure.

### Arena toggle defaults to both match types (2026-02-21)

**Changed**
- `app/(app)/arena/looking-for-match-toggle.tsx` — "Looking for Match" toggle now enables both Casual and Ranked by default (was Casual only).

### Version label on profile (2026-02-21)

**Added**
- `package.json` — Added `name` ("jits-web") and `version` ("0.1.0") fields.
- `app/(app)/profile/profile-content.tsx` — Small "JITS v0.1.0" label at bottom of profile page.

### Backend integration: get_match_details RPC, challenge expiration, canCreateChallenge (2026-02-20)

**Changed**
- `types/database.ts` — Regenerated to include `get_match_details` RPC from BE migration.
- `lib/api/queries.ts` — `getMatchDetails()` now uses single `get_match_details` RPC call instead of two-query workaround (match + challenge join with JS merge). Same return type, no consumer changes needed.
- `hooks/use-global-notifications.ts` — Added "Challenge Expired" toast notifications for both challenger (`challenger_id` filter) and opponent (`opponent_id` filter) when pg_cron auto-expires challenges.
- `components/domain/challenge-sheet.tsx` — ChallengeSheet now validates `canCreateChallenge(opponentId)` when opened; shows loading spinner, then error state if at 3-challenge limit or opponent unavailable.

**Fixed**
- `app/(app)/match/[id]/live/match-timer.tsx` — Removed `remaining` from timer interval effect deps; was tearing down and re-creating the interval every second instead of once.
- `app/(app)/match/lobby/[id]/lobby-actions.tsx` — Weight validation uses `isNaN()` instead of falsy check; Decline button now shows spinner instead of "...".
- `components/domain/challenge-sheet.tsx` — Weight validation uses `isNaN()` instead of falsy check; `canCreateChallenge` async call now uses cleanup flag to prevent state update after unmount.
- `hooks/use-global-notifications.ts` — `resolveSender()` no longer caches failed athlete lookups (prevents permanently showing "Someone").

### Push notifications — device registration, service worker, preferences UI (2026-02-20)

**Added**
- `public/sw.js` — Service worker for Web Push notifications (push event → showNotification, notificationclick → navigate to challenge/chat/match).
- `hooks/use-push-registration.ts` — Hook that registers the service worker and subscribes to Web Push on app launch. Silently no-ops if push isn't supported or VAPID key is missing.
- `components/layout/push-registration-bootstrap.tsx` — Side-effect bootstrap component mounted in app layout to trigger push registration.
- `app/(app)/settings/page.tsx` — New settings page with back navigation.
- `app/(app)/settings/settings-content.tsx` — Server component that fetches notification preferences.
- `app/(app)/settings/notification-preferences.tsx` — Client component with three Switch toggles for challenge/chat/match notification preferences.
- `lib/api/mutations.ts` — `registerPushDevice()`, `removePushDevice()`, `getNotificationPreferences()`, `updateNotificationPreferences()` mutations for push subscriptions and notification preferences tables.
- `types/push-subscription.ts` — Type aliases for `PushSubscription`, `PushSubscriptionInsert`.
- `types/notification-preference.ts` — Type aliases for `NotificationPreference`, `NotificationPreferenceUpdate`.

**Changed**
- `types/database.ts` — Regenerated to include `push_subscriptions` and `notification_preferences` tables from BE migration 010.
- `app/(app)/layout.tsx` — Added `PushBootstrap` Suspense wrapper alongside existing bootstrap components.
- `app/(app)/profile/profile-content.tsx` — "Settings & Privacy" button now links to `/settings` (was a dead button).

### Skeleton loading states, guard optimization, realtime optimization (2026-02-19)

**Changed**
- `app/(app)/match/[id]/live/page.tsx` — Replaced generic inline skeleton with named `LiveMatchSkeleton` component matching actual page layout (name vs name text, badge, timer, button).
- `app/(app)/match/[id]/results/page.tsx` — Replaced generic inline skeleton with named `ResultsSkeleton` component matching results card layout (heading, participant rows with avatars/badges, action buttons).
- `app/(app)/match/lobby/[id]/page.tsx` — Replaced generic inline skeleton with named `LobbySkeleton` component matching VS header layout (two athlete columns with avatars/ELO, badge, stakes card, action buttons).
- `app/(app)/match/pending/page.tsx` — Replaced generic `PendingChallengesSkeleton` with layout-accurate version (header, tabs bar, challenge cards with avatar/name/badge, info card).
- `lib/guards.ts` — `requireAthlete()` and `getActiveAthlete()` now use explicit column select (12 columns) instead of `select("*")` (15 columns), reducing payload on every authenticated page load. Excludes unused `created_at`, `push_token`, and `role`.
- `components/domain/stat-overview.tsx` — Props type narrowed from `Athlete` to `Pick<Athlete, "current_elo" | "highest_elo">` to match guard's explicit select.
- `components/profile/editable-profile-header.tsx` — Props type narrowed from `Athlete` to `Pick<Athlete, ...>` (7 fields) to match guard's explicit select.
- `hooks/use-pending-challenges.ts` — Replaced full-refetch-on-every-event with optimistic state patching: INSERT appends new challenge to state (with lightweight name lookup), UPDATE removes non-pending challenges. Full refetch only on initial mount.

### UI: dashboard challenges section + achievements card restyle (2026-02-19)

**Changed**
- `app/(app)/profile/achievements-section.tsx` — Restyled achievement cards to match dashboard stat-overview layout: icon circle floats top-right, label/value stacked vertically on the left, larger text sizing.
- `app/(app)/page.tsx` — Challenges section header is now a tappable link to pending page with chevron, count badge next to title, limited to 3 visible cards with "+N more" overflow link.

### Fix: match results — winner names + auto-fill finish time (2026-02-19)

**Fixed**
- `lib/api/queries.ts` — `getMatchDetails()` FK join `athletes!fk_participants_athlete` returns an object (many-to-one), not an array. Was doing `[0]` on an object which returned `undefined`, causing both participants to show as "Unknown" in the winner dropdown.

**Added**
- `app/(app)/match/[id]/results/results-content.tsx` — Computes elapsed seconds from `match.started_at` and passes to form as default finish time.
- `app/(app)/match/[id]/results/record-result-form.tsx` — Accepts `elapsedSeconds` prop, initializes `finishTime` state with it.
- `app/(app)/match/[id]/results/submission-fields.tsx` — Accepts `defaultElapsedSeconds` prop, pre-fills min/sec inputs from elapsed match time.

### Fix: Start Match RPC response mismatch (2026-02-19)

**Fixed**
- `lib/api/mutations.ts` — `startMatchFromChallenge()` no longer checks for a `success` field that the backend RPC doesn't return. The RPC returns match data directly; errors come as PostgreSQL exceptions (already handled). This was causing every successful "Start Match" click to show "Unknown error".
- `types/composites.ts` — `StartMatchResponse` fields updated from optional to required, removed phantom `success`/`error` fields to match actual backend contract.
- `app/(app)/match/lobby/[id]/lobby-actions.tsx` — Removed non-null assertion on `match_id` (now typed as required).
- `lib/api/errors.ts` — `mapPostgrestError()` now maps `P0001` business logic errors using `error.hint` (e.g. `not_participant`, `invalid_status`) to clean domain error messages instead of falling through to "Unknown error".

### Cleanup: match flow & chat tech debt (2026-02-19)

**Fixed**
- `hooks/use-chat-channel.ts` — Copied `typingTimers.current` to local variable in cleanup to fix React lint warning about stale ref values.
- `app/(app)/match/lobby/[id]/lobby-actions.tsx` — `handleCancel` now checks mutation result and shows errors instead of fire-and-forget navigation.
- `lib/api/mutations.ts` — Removed dead `!response.success` checks from `startMatch()` and `recordMatchResult()` (errors come as PostgreSQL exceptions, not response bodies). Removed unused `mapRpcError` import.

**Changed**
- `lib/utils.ts` — Added `formatRelativeTime()` (minute/hour granularity: "now", "5m", "3h", "2d", "Jan 15") extracted from `conversation-card.tsx`.
- `components/domain/conversation-card.tsx` — Now imports `formatRelativeTime` from `lib/utils` instead of defining its own copy.

### Dashboard Query Consolidation + Dead Code Cleanup (2026-02-18)

**Changed**
- `app/(app)/page.tsx` — Dashboard now uses a single `get_dashboard_summary` RPC call instead of 3-4 separate queries. Accepted challenges, pending challenge photos, and platform-wide recent activity are all included in the RPC response.
- `types/composites.ts` — Extended `DashboardSummary` type with `accepted_challenges`, `recent_activity`, and photo URL fields on pending challenges.

**Backend dependency**
- `get_dashboard_summary` RPC extended (backend migration `20260218100000_dashboard_summary_v2`) to include accepted challenges, platform-wide recent activity, and profile photo URLs on pending challenges. Deploy backend before this frontend.

**Removed**
- `lib/api/queries.ts` — Removed 5 dead functions superseded by RPCs: `getAthleteProfile()`, `getAthleteStats()`, `getLeaderboard()`, `getAthleteRank()` (all used direct `match_participants` queries blocked by RLS), and `getRecentActivity()` (now embedded in dashboard summary). Also removed `ATHLETE_WITH_GYM_SELECT`, `AthleteWithGym`, `AthleteProfile` types.
- `lib/utils.ts` — Removed `computeStats()` and `computeWinStreak()` (only used by the dead query functions; stats are now computed server-side by RPCs).
- `lib/utils.test.ts` — Removed test blocks for `computeStats` and `computeWinStreak`.

### Challenge → Match Flow Fixes (2026-02-18)

**Fixed**
- `components/domain/challenge-response-sheet.tsx` — Broadcast `challenge_accepted` to `lobby:{challengeId}` channel after acceptance so the challenger's lobby page auto-refreshes.
- `components/domain/challenge-sheet.tsx` — Replaced raw `supabase.from("challenges").insert()` with `createChallenge()` mutation. Removes `currentAthleteId` prop (mutation derives it from auth). Error messages now go through domain error mapping.
- `app/(app)/match/pending/sent-challenges-list.tsx` — Replaced raw `supabase.from("challenges").update()` with `cancelChallenge()` mutation for consistent error handling.
- `app/(app)/match/[id]/live/match-timer.tsx` — Timer broadcast now uses `started_at` from `start_match()` RPC response (server clock) instead of client `new Date()`, preventing timer desync between devices.
- `types/composites.ts` — Added `started_at` field to `StartMatchTimerResponse` interface.

**Changed**
- `app/(app)/athlete/[id]/athlete-profile-actions.tsx` — Removed `currentAthleteId` prop from `ChallengeSheet` call site.

### Prototype-to-Production Guide (2026-02-18)

**Added**
- `research/010-prototype-to-production-guide.md` — Comprehensive guide documenting how the JITS Arena project was built from a Figma Make prototype + Supabase backend in 5 days. Covers project setup, governance layer, Figma audit workflow, 6-phase build cycle, Claude Code prompt patterns, cross-repo coordination, and branching strategy.

### Challenge → Match Flow Bug Spec (2026-02-18)

**Added**
- `specs/challenge-match-flow-fixes.md` — E2E flow analysis documenting 4 bugs: missing lobby broadcast on accept, ChallengeSheet/SentChallengesList bypassing mutations layer, timer client-vs-server timestamp desync. Includes exact file locations, prescribed fixes, and manual test scenario.

### PWA Safe Area Fix (2026-02-18)

**Fixed**
- `components/layout/app-header.tsx` — Added `pt-[env(safe-area-inset-top)]` so the header clears the status bar/notch in standalone PWA mode (Add to Home Screen).

### Demo Video Recording System (2026-02-18)

**Added**
- `demo/record.ts` — Playwright test orchestrator that records 12 per-scene video clips with per-scene browser contexts (no dead time between scenes).
- `demo/scenes/01-login.ts` through `demo/scenes/12-profile.ts` — 12 scene scripts covering login, dashboard, arena, swipe, athlete profile, send/accept challenge, live match, record results, leaderboard, messages, and profile.
- `demo/scenes/types.ts` — Scene interface with `shouldRun` pre-check gates and `skipAuth` for login scene.
- `demo/helpers/auth.ts` — `saveAuthState()` for off-screen auth capture, `createSceneContext()` for per-scene video-recording contexts.
- `demo/helpers/nav.ts` — `navigateTo()` and `tapNavItem()` with `waitUntil: "commit"` to handle Next.js streaming.
- `demo/helpers/pause.ts` — Speed-adjustable pause system (`DEMO_SPEED` multiplier) with per-type overrides.
- `demo/playwright.config.ts` — iPhone 14 viewport (390x844, 3x scale), loads `.env.demo` manually.
- `demo/post-process.sh` — Docker-based ffmpeg pipeline (`jrottenberg/ffmpeg:5-alpine`) for webm-to-mp4 conversion, concatenation, and side-by-side dual-account clips.
- `.env.demo.example` — Template for demo account credentials and speed settings.
- `package.json` — Added `demo:record` and `demo:process` scripts.
- `.gitignore` — Added `.env.demo` and `demo/output/` exclusions.

### Stat Cards Redesign (2026-02-17)

**Changed**
- `components/domain/stat-overview.tsx` — Moved icons into the decorative corner circles (top-right), promoted labels to standalone left-aligned `text-sm`, and added subtle 70% opacity to icons for a cleaner look.

### SSO Avatar Support (2026-02-17)

**Changed**
- `lib/utils.ts` — `getProfilePhotoUrl()` now handles absolute URLs (SSO avatars from Google/Apple) in addition to relative Supabase storage paths. Absolute URLs are returned as-is; relative paths still resolve from the `athlete-photos` bucket.

### Premium Features Teaser (2026-02-17)

**Added**
- `components/domain/premium-features-modal.tsx` — Gold gem icon button that opens a "Coming Soon" modal showcasing future premium features (Video Analysis, ELO Tournaments, Advanced Analytics, Gym Leaderboards, AI Match Insights).
- `components/layout/page-header-actions.tsx` — Premium button added to header alongside notification bell on all main nav pages.

### Dynamic Dashboard Hero Subtitle (2026-02-17)

**Changed**
- `app/(app)/page.tsx` — Hero subtitle is now context-aware: shows pulsing green "Looking for Ranked/Casual matches" when active, or a tappable CTA banner linking to Arena when not looking. Removed `bg-gradient-hero` background.

### Modernize UI/UX Design (2026-02-17)

**Changed**
- **Theme refresh** (`app/globals.css`) — Warmer color palette with blue-tinted dark mode (was pure black). Richer borders using proper HSL values instead of alpha-channel opacity. Increased default border radius from `0.5rem` to `0.75rem` for softer, rounder feel.
- **New animations** (`tailwind.config.ts`) — Added `scale-in`, `slide-up-fade`, `shimmer`, and `glow-pulse` keyframes. Stagger animation support for child elements via `.stagger-children` class.
- **Floating bottom nav** (`components/layout/bottom-nav-bar.tsx`) — Floating pill-style navigation with rounded corners, card-style glass background, and active tab indicator with icon highlight bubble. Increased bottom margin for "floating" effect.
- **Glass header** (`components/layout/app-header.tsx`) — Softer backdrop blur with semi-transparent border for modern frosted glass look.
- **Card component** (`components/ui/card.tsx`) — Cards now use `rounded-2xl` globally. Added `glass` variant for frosted glass cards. `interactive` variant uses `shadow-card-hover` on hover instead of accent background. Added `shadow-card` base utility for consistent elevation.
- **Stat overview cards** (`components/domain/stat-overview.tsx`) — Each stat card gets a colored icon pill (rounded-lg with tinted background), decorative background circle element, and staggered entry animation.
- **Profile header** (`components/domain/profile-header.tsx`) — Stats section uses colored tinted backgrounds (green for wins, red for losses) with rounded-2xl pill containers. Wider avatar outline offset, larger looking-for pulse dot, improved spacing.
- **Athlete card** (`components/domain/athlete-card.tsx`) — Colorized W/L record display (green wins, red losses with dot separator). "You" badge uses primary-tinted background. Slightly smaller avatar (h-11) for better proportion.
- **Match card** (`components/domain/match-card.tsx`) — Slightly larger avatar (h-9). Badges use `rounded-lg`. Match type text uses `font-medium` for emphasis.
- **Dashboard hero** (`app/(app)/page.tsx`) — Gradient hero greeting section with `text-gradient-primary` on athlete name and subtitle. Section headers use icon pills (rounded-lg with tinted background).
- **Recent activity** (`components/domain/recent-activity-section.tsx`) — Filter pills have more padding, `shadow-sm` on active state, softer inactive background. Section header uses icon pill. Empty states use `rounded-2xl`.
- **Arena content** (`app/(app)/arena/arena-content.tsx`) — Section headers use colored icon pills. Badges use `rounded-full`. Competitor cards use `border-border` instead of accent.
- **Leaderboard podium** (`app/(app)/leaderboard/leaderboard-content.tsx`) — Podium slots use translucent gradient backgrounds with colored borders instead of opaque gradients. Trophy icons in rounded-2xl containers with glow effects on gold. Toggle labels use `font-medium` with `transition-colors`.
- **Achievements section** (`app/(app)/profile/achievements-section.tsx`) — Each achievement card gets a colored icon pill (rounded-xl, 9x9) with tinted background. Decorative background circle. Section header uses icon pill. Stagger animation on grid.
- **Profile page** (`app/(app)/profile/profile-content.tsx`) — Buttons use `rounded-xl`. Ghost buttons in account section use `rounded-xl`.
- **App layout** (`app/(app)/layout.tsx`) — Background uses `bg-gradient-subtle` for subtle gradient wash.
- **All skeleton loaders** — Updated from `rounded-lg` to `rounded-2xl` to match new card radius.
- **Badge component** (`components/ui/badge.tsx`) — Default border radius changed from `rounded-md` to `rounded-lg`.
- **Page container** (`components/layout/page-container.tsx`) — Bottom padding increased from `5rem` to `6rem` to accommodate floating nav bar.

**Added**
- `bg-gradient-hero` utility — Subtle primary-tinted top gradient for hero sections (light and dark mode variants)
- `bg-gradient-subtle` utility — Vertical gradient wash for page backgrounds
- `text-gradient-primary` utility — Red-to-orange gradient text effect
- `shadow-glow-primary`, `shadow-glow-success`, `shadow-glow-gold` utilities — Colored glow effects for emphasis
- `shadow-card` and `shadow-card-hover` utilities — Consistent card elevation system
- `.glass` component class — Frosted glass card effect with backdrop blur
- `.stagger-children` component class — Auto-staggered fade-in-up animation for child elements (60ms delay per child)

### Challenge Versus Card Navigation (2026-02-17)

**Changed**
- `components/domain/challenge-versus-card.tsx` — Added optional `href` prop; card now wraps in a Link with hover/active feedback when provided.
- `app/(app)/athlete/[id]/challenges/challenges-content.tsx` — Active challenges pass `href` to navigate to lobby on card tap.

### Challenge & Activity UX Improvements (2026-02-17)

**Changed**
- `components/domain/challenge-sheet.tsx` — Challenge sheet now accepts `defaultMatchType` prop and defaults to Ranked when the opponent has `looking_for_ranked` enabled.
- `app/(app)/athlete/[id]/athlete-profile-actions.tsx` — Threads `lookingForRanked` flag to ChallengeSheet.
- `app/(app)/athlete/[id]/athlete-profile-content.tsx` — Passes `competitor.looking_for_ranked` to AthleteProfileActions.
- `components/domain/recent-activity-section.tsx` — Reordered scope filter: "All" is now the default first option instead of "Me".

### Lobby Presence & Unified Challenge Lobby (2026-02-17)

**Added**
- `hooks/use-lobby-presence.ts` — `lobby:online` Supabase Presence channel (tier 2 of two-tier model). External store pattern with `useLobbyStatus(athleteId)`, `useLobbyIds()`, and imperative `joinLobby()`/`leaveLobby()` API for toggle integration without channel teardown.
- `components/layout/lobby-presence-bootstrap.tsx` — Side-effect client component in app layout. Conditionally tracks if `looking_for_casual` or `looking_for_ranked` is true; everyone subscribes to read.
- `components/domain/lobby-active-indicator.tsx` — Pulsing green dot + "Active now" text. Uses `useLobbyStatus()`, renders nothing when athlete is not in lobby.
- `challenge_accepted` broadcast event in `use-lobby-sync.ts` — when opponent accepts a challenge, the challenger's lobby page auto-refreshes to show "Start Match" state.

**Changed**
- `app/(app)/match/lobby/[id]/lobby-actions.tsx` — Rewritten to handle 3 challenge states:
  - **Pending (challenger):** "Waiting for opponent to respond..." with pulsing clock + Cancel button
  - **Pending (opponent):** Weight input + Accept/Decline buttons
  - **Accepted:** Start Match/Cancel buttons (previous behavior)
- `lib/api/queries.ts` — `getLobbyData()` now accepts `pending` and `accepted` challenges (was `accepted` only)
- All challenge card links updated to point to `/match/lobby/[challengeId]` instead of `/athlete/[id]`:
  - `app/(app)/page.tsx` (dashboard pending challenges)
  - `app/(app)/match/pending/received-challenges-list.tsx`
  - `app/(app)/match/pending/sent-challenges-list.tsx`
- `app/(app)/arena/arena-content.tsx` — Removed "Competitors" section. Split `lookingCompetitors` into "Ready to Fight" (online + in lobby) and "Looking for Match" (interested but offline) with descriptive subtitles. Uses `useLobbyIds()` for real-time filtering.
- `app/(app)/arena/looking-for-match-toggle.tsx` — Wired `joinLobby()`/`leaveLobby()` imperative API after DB toggle update.
- `app/(app)/page.tsx` — Dashboard now fetches accepted challenges in parallel and shows them at top of Challenges section with green "Accepted" badge + "Go to Lobby" text.
- `components/domain/match-card.tsx` — Added `variant="success"` badge for accepted status and "Go to Lobby" text below badge.
- `app/(app)/layout.tsx` — Added `LobbyBootstrap` async component in Suspense boundary alongside existing presence bootstrap.

### Profile Photos (2026-02-17)

**Added**
- `components/profile/profile-photo-upload.tsx` — Photo upload component with Supabase storage integration
- Profile photo upload on setup screen (`app/profile/setup/setup-form.tsx`)
- Editable profile photo on Profile tab header (`components/profile/editable-profile-header.tsx`)

### Compare Stats Modal Enhancement (2026-02-16)

**Added**
- Draws row in compare stats modal
- Ranked/Casual filter pills that recompute stats from head-to-head match history

### Arena Weight Display (2026-02-16)

**Changed**
- Arena competitor cards now show weight alongside gym name (e.g., "Gym Name · 185 lbs") using `current_weight` from `get_arena_data` RPC

### Success Color Token (2026-02-16)

**Added**
- `--success` CSS variable (`hsl(145 63% 42%)` light / `hsl(145 63% 49%)` dark)
- `bg-success`/`text-success`/`text-success-foreground` Tailwind tokens
- Badge `variant="success"` for win badges

**Changed**
- Win badges use green (`variant="success"`), loss badges use red (`variant="destructive"`)
- ELO numbers use default foreground (not `text-primary`)

### Match Type Labels (2026-02-16)

**Changed**
- `MatchCard` shows "Ranked"/"Casual" inline with date via `matchType` prop
- All 6 call sites updated: dashboard matches, dashboard challenges, match history, head-to-head, received challenges, sent challenges

### Single-Header Navigation & Profile Redesign (2026-02-16)

**Changed**
- Consolidated app header navigation pattern
- Profile hero section redesigned
- Match history filters added to stats sub-page

### UI Fixes (2026-02-16)

**Fixed**
- Athlete profile action buttons no longer overflow on mobile — Challenge is now full-width primary CTA with Message and Compare side-by-side below
- Gym names showing "Unknown" everywhere — `extractGymName()` now handles PostgREST's to-one FK join shape (single object) instead of incorrectly treating it as an array. Fixes gym leaderboard, arena, and swipe pages.

### Online Presence Indicators (2026-02-16)

**Added**
- `hooks/use-online-presence.ts` — Core Supabase Presence hook for the `app:online` channel. Uses an external store pattern (`useSyncExternalStore`) so any client component can check online status without a React Context provider. Tracks `{ athlete_id, display_name, profile_photo_url }` per the BE contract.
- `components/layout/online-presence-bootstrap.tsx` — Side-effect client component mounted in app layout. Sets up the presence channel on app open (same pattern as `GlobalNotificationsProvider`).
- `components/domain/online-indicator.tsx` — Green dot component. Uses `useOnlineStatus(athleteId)` from the store. Renders nothing when offline, shows an absolutely-positioned green circle when online. Supports `className` override for size variants.
- Online indicators added to 4 avatar locations: leaderboard athlete cards, arena competitor cards, chat conversation list (DMs only), and competitor profile header.

**Changed**
- `app/(app)/layout.tsx` — Added `PresenceBootstrap` async component in a Suspense boundary.
- `CLAUDE.md` — Added Realtime & Presence architecture section documenting the two-tier model, external store pattern, and all realtime hooks.

### Chat UI Polish — Modern Messaging UX (2026-02-16)

**Added**
- **Message grouping** — consecutive messages from the same sender within 2 minutes cluster together with tight spacing (0.5) and larger gaps (12px) between groups, creating a visual conversation rhythm
- **Date separators** — "Today", "Yesterday", weekday names, or "Feb 14" dividers between message groups from different days (`components/domain/date-separator.tsx`)
- **Sender avatars in thread** — received messages show a small avatar (bottom of each group), with initials fallback; group chats also show sender display names above the first message in each group
- **Adaptive bubble corners** — border radius adjusts based on group position (rounded corners flatten where messages connect, matching iMessage/WhatsApp style)
- **"You:" prefix in inbox** — last message preview shows "You: message text" when the current user sent it, using the existing `last_message_sender_id` from the RPC
- **Enhanced thread header** — avatar + name in header bar; taps through to the other athlete's profile page for direct chats; gym chats show a Users icon
- **Unread visual emphasis** — conversations with unread messages show bold name, darker preview text, and primary-colored timestamp
- Participant profiles fetched server-side in thread page (parallel query) for avatar/name data

**Changed**
- `MessageBubble` — new props: `isFirstInGroup`, `isLastInGroup`, `senderName`, `senderPhotoUrl`, `showAvatar`; timestamps only shown on last message in group
- `ChatThread` — extracted `ThreadHeader` and `MessageList` sub-components; receives `participants` map and `conversationType`
- `ConversationCard` — now receives `currentAthleteId` for "You:" prefix; uses `cn()` for conditional unread styling
- Thread page (`messages/[id]/page.tsx`) — fetches all participant profiles in a single query for the participants map

### Step 12: Match Flow — Lobby → Live → Results (2026-02-14)

**Added**
- Match Lobby page (`app/(app)/match/[id]/page.tsx`) — VS screen with both athletes, ELO stakes for ranked, start match via `start_match_from_challenge()` RPC
- Live Match page (`app/(app)/match/[id]/live/page.tsx`) — countdown timer, start/end match controls, `start_match()` RPC for pending → in_progress transition
- Match Results page (`app/(app)/match/[id]/results/page.tsx`) — dual-purpose: records result via `record_match_result()` RPC or displays completed results with ELO changes
- `record-result-client.tsx` — submission type picker (grouped by category), winner selection, finish time from timer
- `results-display.tsx` — victory/defeat/draw display with ELO delta for ranked matches
- `MATCH_STATUS` and `MATCH_RESULT` constants in `lib/constants.ts`
- Unit tests: `lib/constants.test.ts` (9 tests), `results-display.test.tsx` (8 tests), `live-match-client.test.tsx` (9 tests) — 49 total tests now

**Match Flow Lifecycle**
- Challenge accepted → Match Lobby (VS screen + ELO stakes)
- Start Match → creates match via RPC → redirects to Live page
- Live page → Start Timer (pending → in_progress) → countdown → End Match
- End Match → Results page → record submission/draw → ELO updates (ranked only)
- Results display → Back to Arena / Home navigation

### Phase 1 — Safety Net (2026-02-14)

**Added**
- Error boundaries at root (`app/error.tsx`), app (`app/(app)/error.tsx`), and athlete profile (`app/(app)/athlete/error.tsx`) — graceful error UI instead of raw Next.js error page
- Custom 404 pages at root and app levels (`not-found.tsx`)
- Suspense fallback skeletons for Dashboard, Arena, and Leaderboard pages — loading placeholders instead of blank screens
- Pre-alpha codebase audit (`research/006-pre-alpha-codebase-audit.md`)

**Fixed**
- Removed unused `opacity` variable in swipe-discovery-client
- Removed unused `Badge` import in challenge-sheet
- Removed unused `gyms` query in leaderboard page (gym stats already computed from athlete FK joins)
- Excluded `outside_assets/` from ESLint to eliminate 30+ irrelevant warnings

### Phase 2 — Tooling & Test Foundation (2026-02-14)

**Added**
- Unit tests for `lib/utils.ts` — 17 tests covering `getInitials`, `computeStats`, `computeWinStreak`, `extractGymName` (23 total tests now)
- Husky pre-commit hook running `tsc --noEmit`, `eslint`, and `vitest run` on every commit

**Changed**
- Pinned `@supabase/ssr` (^0.8.0), `@supabase/supabase-js` (^2.94.1), and `next` (^16.1.6) — removed `"latest"` tags
- Rewrote E2E smoke tests for auth-aware routes (public pages + redirect assertions instead of guarded pages)
- Playwright config: increased webServer timeout, `reuseExistingServer: true`

**Known Issue**
- Playwright browser launch hangs in current environment — E2E tests need `npx playwright install` and may require system dependencies

### Phase 3 — Type Safety & Data Patterns (2026-02-14)

**Added**
- `lib/constants.ts` — centralized `MATCH_TYPE`, `CHALLENGE_STATUS`, `MATCH_OUTCOME`, `ATHLETE_STATUS` constants with TypeScript types
- `types/composites.ts` — shared FK join shapes (`ChallengerJoin`, `OpponentJoin`, `GymJoin`, `MatchJoin`), `ComputedStats`, and `EloStakes` types

**Changed**
- Replaced `as unknown as Array<...>` casts with proper FK join array types in `pending-challenges-content.tsx` and `athlete-profile-content.tsx`
- Moved gym fetch from client-side `useEffect` in `setup-form.tsx` to server-side in `setup/page.tsx` — gyms now passed as prop
- Challenge sheet and challenge response sheet now use shared `EloStakes` type and `MATCH_TYPE` constants instead of local duplicates
- Match card uses `MATCH_OUTCOME` constants for result config
- Guards use `ATHLETE_STATUS.PENDING` instead of string literal

### Step 1: Layout Shell + Layout Migration (004-plan)

**Added**
- `components/layout/app-header.tsx` — sticky header with title, optional back button, icon, and right action slot
- `components/layout/bottom-nav-bar.tsx` — fixed 4-tab bottom nav (Home / Rankings / Arena / Profile) with active state highlighting
- `components/layout/page-container.tsx` — mobile-width content wrapper (`max-w-md mx-auto px-4 pb-20`)
- `components/layout/header-user-button.tsx` — server component showing user avatar with initials, linked to profile
- `components/ui/avatar.tsx` — installed shadcn avatar primitive
- `app/(app)/profile/profile-content.tsx` — extracted async profile content for Suspense boundary

**Changed**
- `app/(app)/layout.tsx` — replaced desktop nav bar, footer, and `max-w-5xl` container with mobile app shell (app-header + page-container + bottom-nav-bar)
- `app/(app)/profile/page.tsx` — wrapped in Suspense boundary to fix Next.js 16 prerender error; uses `requireAthlete()` guard instead of inline auth check
- `lib/guards.ts` — fixed `requireAthlete()` column name from `user_id` to `auth_user_id` to match database schema

**Removed**
- `EnvVarWarning` from app layout (dev bootstrapping artifact)
- `ThemeSwitcher` from app layout footer (will move to profile settings in Step 4)
- Desktop top nav bar with Home/Challenges/Gyms links (replaced by bottom nav)
- Footer section from app layout

### Test Suite Setup

**Added**
- Vitest configured with React Testing Library and jsdom environment
  - `vitest.config.ts` — path aliases, jsdom, setup file
  - `vitest.setup.ts` — jest-dom matchers
  - `components/layout/bottom-nav-bar.test.tsx` — 3 tests (renders tabs, active state, correct routes)
  - `components/layout/page-container.test.tsx` — 3 tests (renders children, constraint classes, custom className)
- Playwright configured for E2E testing
  - `playwright.config.ts` — chromium + mobile-chrome projects, auto-start dev server
  - `e2e/smoke.spec.ts` — 3 tests (layout shell renders, nav links correct, login form renders)
- npm scripts: `test`, `test:watch`, `test:e2e`, `test:e2e:ui`, `typecheck`

### Constitution Update (v1.0.0 → v1.1.0)

**Added**
- Principle VI: Testing Discipline — Vitest for unit/component, Playwright for E2E, build gates
- Component Architecture subsection in Tech Stack — three-tier layer rules (ui/domain/layout)
- "Database schema management" added to Out of Scope (separate backend repo)

**Changed**
- Principle II: Added component layer table and install-on-demand rules for shadcn
- Principle III: Added `requireAthlete()` guard standardization rule
- Tech Stack table: Updated UI Components entry, added test framework rows
