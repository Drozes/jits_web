# Timekeeper mode: coordinator brief (2026-10-15)

Input for the PM, designers and reviewer of the canvas page "Proposed (Oct 15 Timekeeper)" on
"ELO RATED Native Screens" (https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D). Everything below is
either an OWNER DECISION (binding) or RECON (verified against code on 2026-10-15; FE line numbers are
`origin/development` of jits_web, BE line numbers are jr_be `supabase/migrations/`).

## 1. Owner decisions (2026-10-15, binding)

| # | Decision |
|---|---|
| D1 | Feature flag `timekeeper_role` is the switch for "timekeeper mode". When ON, every NEW match requires a timekeeper. When OFF, today's two-athlete flow must work exactly as now. Flipping the flag must never break a match already in flight (snapshot per match). |
| D2 | The timekeeper is an on-platform, signed-in ELO RATED user, never one of the two competitors. Their own weight has nothing to do with the match: they are a pseudo referee. |
| D3 | The timekeeper is PICKED from the athletes' **friends and nearby athletes**, and the pick happens **after the challenge is accepted**. Invitations to off-platform people are NOT required for the first build, but the owner (2026-10-15, follow-up) wants to extend to off-platform timekeepers in the near term: the design and backend asks must not paint us into a corner (e.g. leave a clear slot in the picker for "Invite someone not on ELO RATED", reuse the 016 invites system, `invites` / `invite_attributions`), and the spec should sketch that extension as a phase 2 section. (The existing code/QR join `get_match_timekeeper_code` / `join_match_as_timekeeper` exists on the backend; the owner asked for friends and nearby as the picker. Whether code/QR stays as a secondary path is for the PM to propose, not required.) |
| D4 | The timekeeper RUNS the match: they are the only one who can START it, they run the clock (pause, resume, end), and they are the only one who RECORDS the result. This reverses the 2026-10-04 "record-only" decision (jr_be-1qz.6) for timekeeper-mode matches only. |
| D5 | The timekeeper confirms EACH athlete's weight. This is IN ADDITION to the athletes confirming each other's weight (the athlete opponent check stays). |
| D6 | Athletes still confirm their opponent's weight and mark ready. These may be merged into one step if recommended. The timekeeper drives the match once all athletes have said they are ready. |
| D7 | Athletes still confirm or dispute the recorded result (unchanged confirm / dispute / 24 h auto-confirm). |
| D8 | All athletes can still record video (unchanged). The timekeeper can also record. |
| D9 | If the timekeeper is not there yet, or drops out, the match WAITS. After a 10-minute wait it is CANCELLED. |
| D10 | Alpha in 2 days (2026-10-17). Timekeeper mode should be ON for the alpha only if the team is certain of it; otherwise it ships dark and the alpha runs flag OFF. Nothing in this work may block anyone with the flag OFF. |
| D11 | If changes to the NON-timekeeper (flag OFF) flow are recommended (for example merging weight and ready), the proposal may show them, clearly marked as optional and separate from timekeeper mode. |

Coordinator assumption pending owner confirmation (mark as such on the page): a timekeeper "doesn't look right" on an athlete's weight blocks start until that athlete re-weighs and the timekeeper confirms again, same as today's athlete flag.

## 2. Flag state

- `timekeeper_role` was seeded TRUE in 2026-04 (session prototype) and nothing reads it. jr_be PR #38 (`20261015200000_timekeeper_role_flag_off.sql`) sets it false with a new description; prod flip is a manual admin toggle.
- Web hardcodes `timekeeperEnabled: true` for the retired session wizard (jits-1m4); web `(app)` is locked behind `NEXT_PUBLIC_WEB_APP_ENABLED`. Mobile reads no timekeeper flag.
- Client flag pattern to copy: `invites_enabled` / `match_location_required` (`apps/mobile/lib/invites/use-invites-enabled.ts`, `apps/mobile/lib/arena/match-location-flag.ts`): fail-closed, `known` tri-state, refetch on foreground, server HINT flips it.

## 3. Today's Arena match flow (RECON)

Status enum (`20260604000000:25-27`): `pending, in_progress, completed, disputed, voided, cancelled`. There is no `started_by`, `recorded_by` or ready column on `matches`. Clients cannot INSERT `matches` and `guard_match_columns` (`20261013100000_rating_v9_schema.sql:356-393`) silently reverts client writes to control columns.

1. **Challenge sent / accepted** (Arena, `apps/mobile/lib/arena/use-arena-challenge.ts`): `createChallenge` :1700, `acceptChallenge` :1850 (direct table UPDATE, opponent only, carries `opponent_weight`), then `start_match_from_challenge` :1887 (either side, idempotent; latest `20261007100000_instant_go_live.sql:1096`) inserts `matches` `pending` with two `competitor` rows in `match_participants`. Invite bookings go through `_start_invite_booking` (`20261001300500:61-129`). Navigation to `app/(app)/match/[matchId].tsx` which mounts `MatchFlowWizard`.
2. **Face-off** (wizard steps `weight` then `ready`; `components/match-flow/faceoff/faceoff-body.tsx`): `WeighIn` ("Confirm X lbs") and `ReadyCheck` ("I'm ready", "BOTH READY"). Weigh-in and ready are **broadcast only** (channel `session-match:<matchId>`, repeated every 3 s, `lib/match-flow/use-faceoff.ts:149-235`); the server does not know who is ready. Opponent weight check: table `match_weight_checks` PK `(match_id, checker_id)`, `check_opponent_weight` (competitor checks opponent only, `pending` only), `reweigh_for_match`, flag `opponent_weight_check_required` (default false); "Doesn't look right" flags block start until withdrawn or re-weigh plus re-confirm. UI `faceoff/faceoff-weight-check.tsx:40-102`. Recording intent `set_match_recording_intent` (competitor or timekeeper).
3. **Start**: not a button. Both devices auto-call `start_match` once `myReady && opponentReady && canStart` (`use-faceoff.ts:279-281`); loser of the race reads details. `start_match` (latest `20261005100500:25-123`): caller must be a participant (timekeeper not allowed), status `pending`, weight gate; no readiness/timekeeper/location check. Writes `in_progress`, `started_at`. "Match Started" push.
4. **Live** (`components/match-flow/steps/live-step.tsx`): client-side clock; pause/resume via `pause_match` / `resume_match` guarded by `can_control_match` (participants only, timekeeper excluded since `20261006100000:676`). "End" is broadcast only (`match_ended`); match stays `in_progress` until a result is recorded.
5. **Result** (`steps/result-step.tsx`, `use-result-claim.ts` advisory claim, `use-record-result.ts` via offline `mutationQueue`): `record_match_result` (latest `20261013100200_rating_v9_rpcs.sql:21-241`) participant only, `in_progress` only, derives loser as "the other participant", writes `submissions`, outcomes, `completed`, applies rating v9 at record time, auto-confirms the recorder if a competitor.
6. **Confirm / dispute** (`steps/confirm-step.tsx`, `steps/dispute-form.tsx`): `confirm_match_result`, `auto_finalize_match` counts ALL confirmed rows vs competitor count, `dispute_match_result` (24 h window), `auto_confirm_locked_results` cron after 24 h, `resolve_dispute` (service role, rating replay).
7. **Cancel**: pending only, any participant, `cancel_session_match` (Leave). No cancel in progress. No cron expires stale `pending` matches.

Mobile state machine `lib/match-flow/step-router.ts`: `weight, ready, live, end, result, confirm, summary` (`pending` maps to `weight`). The wizard rejects non-participants ("Not a participant", `match-flow-wizard.tsx:107-110, 247-253`). No timekeeper UI exists in the match wizard; the only timekeeper UI is the film view (`components/match-detail/timekeeper-film.tsx`).

Existing timekeeper backend (`20261006100000_match_timekeeper_join.sql`, shipped 2026-10-05): `matches.timekeeper_id`, join codes (`get_match_timekeeper_code`, `join_match_as_timekeeper`, `remove_match_timekeeper`, `leave_match_as_timekeeper`), record-only media rights, `timekeeper_film_ready` push. Old unmerged prototype (May 2026, session era) on jr_be branch `feat/match-timekeeper-and-weight-confirm`: reference only.

## 4. Hook points (RECON, for the PM's backend/mobile asks on the map board)

0. Snapshot `matches.requires_timekeeper` (default false) at creation in `start_match_from_challenge` and `_start_invite_booking`; add to `guard_match_columns`; expose in `get_match_details`. Every new rule keys off this column, never off the global flag.
1. Timekeeper assignment after accept: new RPC to pick a friend or nearby athlete (reuse `get_my_friends`, `get_arena_nearby`), an accept step for the picked timekeeper (they must agree), and a replace/remove path.
2. Server-side ready: new `mark_match_ready` (ready columns or table), reset on re-weigh or flag. Required because ready is broadcast only today and broadcasts are on a public channel.
3. `start_match`: when `requires_timekeeper`, caller must be `timekeeper_id`, both athletes ready, both timekeeper weight confirmations present. HINTs such as `timekeeper_required`, `not_timekeeper`, `athletes_not_ready`. Mobile: no dual auto-start for these matches; timekeeper gets a Start button.
4. `can_control_match`: admit the timekeeper (and refuse athletes?) only when `requires_timekeeper`. End must become a real server action for timekeeper mode, or End goes straight to result recording on the timekeeper device.
5. `record_match_result`: when `requires_timekeeper`, only the timekeeper; both athletes then confirm (no auto-confirm row for the timekeeper; never insert a timekeeper confirmation). Mobile: athletes see a waiting view; offline-queued athlete results would be refused.
6. Weight: `match_weight_checks` PK must become `(match_id, checker_id, subject_id)` or a separate table; `check_opponent_weight` gets a timekeeper branch with `p_subject_id`; SELECT policy admits the timekeeper.
7. Timeout: a cron or deadline that cancels a `requires_timekeeper` match after 10 minutes without a timekeeper (D9), with a push to both athletes.
8. Wizard: a timekeeper role path (they are not a participant); do NOT add the timekeeper to `match_participants` (breaks loser derivation, finalize count, opponent logic).

## 5. Risks to carry onto the map board

- Public broadcast channel: server gates must never trust broadcasts.
- A stale pending match waiting forever: D9's 10-minute cancel covers timekeeper mode only.
- Existing pgTAP 108, 061, 111 pin record-only behaviour; changes must be keyed on `requires_timekeeper` so they keep passing.
- The flag-off flow must be pixel-and-behaviour identical unless a D11 optional change is approved.

## 6. Picker, push and deadline recon (2026-10-15, second pass)

- **Build on the existing timekeeper, do not fork it.** Accepting a pick must end in the same `matches.timekeeper_id` write as `join_match_as_timekeeper` (factor an internal `_set_match_timekeeper` core: set id, consume code, write the `timekeeper` recording intent). The code/QR join stays available as the in-person fallback.
- **Friends:** `get_my_friends()` (`20261001100100_invites_rpcs.sql:1421`) returns `{athlete_id, display_name, avatar_url, current_elo, is_live, ...}`, NOT gated by `invites_enabled`; `is_live` = on the mat, not app-online. Not realtime; re-read on focus. Mobile screen `app/(app)/friends.tsx`.
- **Nearby:** `get_arena_nearby()` (latest `20261007100000:1272`) returns ids + distance bands only (never coordinates), only LIVE athletes with a go_live tag under 4 h, returns empty (`flag_off`) while `match_location_required` is off, 1 call per 5 s. Too narrow for the picker as-is.
- **Recommended:** one RPC `get_timekeeper_candidates(p_match_id)` (competitor of a pending match with no timekeeper): friends of EITHER competitor plus live athletes near the match (bands only), excluding both competitors, bots, anyone busy (`_athlete_busy`, extended to cover `timekeeper_id`) or holding another open request. Client overlays `app:online` presence for an online dot.
- **Request/accept:** table `match_timekeeper_requests` (id, match_id, requested_by, invitee_id, status pending|accepted|declined|expired|cancelled, expires_at), one pending request per match, realtime scoped to the parties; RPCs `request_match_timekeeper`, `respond_timekeeper_request(accept)`, `cancel_timekeeper_request`. Business outcomes return `{ok:false, code}`.
- **Push:** new `social_notifications` kinds `timekeeper_requested` (to invitee) and `timekeeper_accepted` / `_declined` / `_expired` (to athletes); category `matches` (not `friends`, which a user may mute). No push action buttons exist, so Accept/Decline is tap then an in-app sheet on a NON-tab-root route (tab-root targets are dropped during a match). Copy example: "Timekeep M. Park vs J. Diaz?".
- **10-minute deadline:** `matches.timekeeper_deadline_at` (or per-request `expires_at`), lazy checks in every RPC plus a per-minute pg_cron sweep that cancels the pending match and pushes `timekeeper_expired`. Countdown UI reuses `lib/arena/fresh-countdown.ts` ("m:ss LEFT", `PromptCountdown` in `components/arena/challenge-prompt-sheet.tsx`). "Arrived" = accepted (cheapest definition; a proximity check could come later).
- **Phase 2 off-platform:** new `invites.kind = 'timekeeper'` + `invites.match_id`, `create_timekeeper_invite(p_match_id)` with `link_expires_at` = the match deadline, a separate `claim_timekeeper_invite` that runs signup/dob/attribution then the shared `_set_match_timekeeper` core; extend `expire_stale_invites` and the invite landing copy. Owner to decide whether a timekeeper claim creates friendships and whether invite caps apply.
