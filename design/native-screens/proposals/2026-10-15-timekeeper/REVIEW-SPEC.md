# Independent review: Timekeeper mode SPEC (2026-10-15)

Reviewer: independent agent (wrote none of SPEC.md, BOARDS.md or COPY-DECK.md). Scope: SPEC.md plus BOARDS.md and COPY-DECK.md, checked against BRIEF.md (owner decisions D1 to D11 binding), jits_web `apps/mobile` in this worktree (HEAD `4a20ee80`) and jr_be `supabase/migrations` on `main` (latest definition of each function). Time-boxed to about 15 minutes, so the section A sampling covers roughly 110 citations, not every one.

Verdict: the spec is a solid, honest draft. The section A fidelity is high, and the "ship dark" call is right. It is not ready to hand to implementers yet: two backend facts the spec missed would cause real bugs if it were built as written (an existing `end_match` RPC, and the existing `remove_match_timekeeper`). Several asks also need to be keyed explicitly on `requires_timekeeper` so that flag-OFF behaviour stays byte-identical. The design leaves two "stuck match" holes (a stalling timekeeper, and old app builds), and the collusion story needs an owner decision.

Counts: 2 BLOCKER, 9 MAJOR, 10 MINOR.

---

## BLOCKER

### B1. `end_match` already exists, and it completes the match without a result

- Evidence: jr_be `20260927000000_match_control_participant_guard.sql:199-261` defines `public.end_match(p_match_id)`. It is gated by `can_control_match` (:225-229) and sets `status = 'completed'`, `completed_at = now()` (:236-241). The mobile app deliberately does not call it, because `record_match_result` then fails with `invalid_status` (`apps/mobile/lib/match-flow/use-live-controls.ts:41-50`, jits-ait). pgTAP 061 (:119-163) and 066 (:184-186) pin its behaviour.
- Spec: B.4, R ("End ... `end_match`: caller is `timekeeper_id`; `in_progress` (`match_not_live`)") and BE-5 all describe a *new* `end_match` that "stamps `ended_at` and the final clock" and leaves the match `in_progress`. That name collides with the existing function. Section A.4 also says "End is a broadcast only" without noting that a server `end_match` exists and is callable by clients.
- Risk: (a) If the existing function is redefined, flag-OFF semantics change and 061/066 break (this violates D1 and D10). (b) If it is left as is while BE-5 admits the timekeeper to `can_control_match`, the timekeeper (or, today, any athlete) can call the legacy `end_match` and complete a timekeeper-mode match with no result and no rating. A losing athlete in flag-OFF can already do this today (a latent hole, out of scope, but it should be filed).
- Fix: name the new action distinctly, for example `end_match_clock(p_match_id, p_final_elapsed_s)`. It should be timekeeper-mode only (refuse `not_timekeeper_mode` when `requires_timekeeper = false`) and should write `ended_at` and the final clock while leaving `status` alone. Add a first-line branch to the legacy `end_match`: `IF requires_timekeeper THEN RAISE ... HINT 'use_end_match_clock'`. That branch is unreachable for flag-OFF matches, so 061/066 are unchanged. Separately, file a bug: the legacy `end_match` lets a flag-OFF athlete void a result by completing the match first (jits-ait only fixed the client).

### B2. Existing `remove_match_timekeeper` and the code/QR join bypass the picker rules

- Evidence: `20261006100000_match_timekeeper_join.sql:432-484`. `remove_match_timekeeper` lets any competitor clear the timekeeper of a pending match, rotate the code and delete their recording intent. `get_match_timekeeper_code` (:357-408) hands any competitor a code, and `join_match_as_timekeeper` (:619 onward) is "the ONLY writer that sets matches.timekeeper_id" and admits anyone who is not a competitor, with no friends, nearby or busy checks.
- Spec: the R table has no row for `remove_match_timekeeper`. Q4 keeps the code/QR on the backend "with the same busy rules", but nothing in BE-1 to BE-11 changes `join_match_as_timekeeper` or `get_match_timekeeper_code` for timekeeper mode.
- Risk: in timekeeper mode, one athlete can (a) unilaterally remove a neutral timekeeper who flagged their weight and (b) use the still-live code to seat any account, including a second account or a busy person, outside the request/accept flow and with no notice to the opponent. That defeats the picker's guarantees and the D2 neutrality intent.
- Fix: add explicit R rows for `remove_match_timekeeper`, `get_match_timekeeper_code` and `join_match_as_timekeeper` in timekeeper mode. Recommended: in timekeeper mode, the code join runs through `_set_match_timekeeper` with the same busy and deadline checks and a push to the other athlete. Removal by one athlete is either refused (`requires_both_athletes`) or allowed only before the timekeeper's first weight verdict, and either way it pushes to the other athlete. Each of these must branch on `requires_timekeeper`, so flag-OFF code-join behaviour (pgTAP 108) is unchanged.

---

## MAJOR

### M1. Version skew: old app builds receive timekeeper-mode matches they cannot run

- Evidence: the snapshot is taken from the global flag inside `start_match_from_challenge` (`20261007100000_instant_go_live.sql:1096` onward) and `_start_invite_booking`, whichever athlete's client calls it. Today's client auto-calls `start_match` from both phones (`use-faceoff.ts:280-282`). Under the spec, that call is refused with `not_timekeeper`, so the athlete gets the toast `Couldn't start match` (:270) and is stuck in face-off. They have no picker, and the timekeeper cannot be asked.
- Spec: E's go/no-go has no minimum-version criterion, and section B assumes every client knows the new flow.
- Fix: add a go-live criterion that every active install is on a build with timekeeper support. Either (a) snapshot `requires_timekeeper` only when the creating call passes a capability argument, for example `start_match_from_challenge(p_challenge_id, p_supports_timekeeper boolean DEFAULT false)`, and both athletes' clients have advertised it, or (b) force an update (minimum version gate) before the flag flips. Option (a) also keeps the flag-OFF path untouched, since the default is false.

### M2. A present but stalling timekeeper can freeze a match forever

- Evidence and spec: drop-out is defined only as Leave or a missed heartbeat (B.6). In timekeeper mode, athletes have no pause, end, result or leave control after the start (R rows "Leave after start", "Record result"), and `record_match_result` has no deadline. The 10-minute deadline is cleared on accept (B.2, R "10-minute rule").
- Risk: a timekeeper who keeps the app open and never ends the clock or never records leaves the match `in_progress` indefinitely, with both athletes locked. That stalling also makes them `_athlete_busy` (the 3-hour window at `20261001100100_invites_rpcs.sql:212-213`) and bars invite bookings. A colluding timekeeper can use this to stop a result being recorded at all.
- Fix: (1) the server auto-ends the clock at `started_at + duration_seconds + total_paused_duration` if the timekeeper has not (the athletes' phones already show `TIME`). (2) A result deadline, for example `ended_at + 10 min` with no result, is treated as a drop-out under D9 (pick a replacement, else cancel). (3) Before the start, a timekeeper who has accepted but has not started within N minutes of both athletes being ready gets the same treatment. Mark these as PM proposals pending the owner, since D9 only names "not there" and "drops out".

### M3. A re-weigh does not invalidate the timekeeper's confirmation

- Evidence: `reweigh_for_match` resets only the opponent's check of the caller (`20260930195443_opponent_weight_checks.sql:479-490`, `ON CONFLICT (match_id, checker_id)` at :483).
- Spec: B.3 says re-weighing "clears my ready and my opponent's check of me". Q1 covers only a timekeeper *flag*. If an athlete re-weighs because the *opponent* flagged them, the timekeeper's earlier `confirmed` row still stands against the old weight, and `start_match` would pass the "both timekeeper confirmations" gate (R, BE-4) on stale data.
- Fix: in timekeeper mode, `reweigh_for_match` resets *every* check whose subject is the caller (the athlete's and the timekeeper's) and clears both athletes' ready. Add this to BE-3/BE-7 and to acceptance criterion G5.

### M4. Changing the `match_weight_checks` primary key changes flag-OFF code

- Evidence: PK `(match_id, checker_id)` at `20260930195443:75`. `check_opponent_weight` (:361, :372) and `reweigh_for_match` (:483) use `ON CONFLICT (match_id, checker_id)`, so changing the PK forces those flag-OFF functions to be rewritten. The `start_match` weight gate (`20261005100500:81-110`) counts `flagged` rows across *all* checkers; the opponent count is filtered to the two competitors.
- Spec: BE-7 lists the PK change first, with "(or a sibling table)" as the alternative.
- Fix: commit to a sibling table `match_timekeeper_weight_checks (match_id, subject_id)` PK, written by a new `check_athlete_weight_as_timekeeper(p_match_id, p_subject_id, p_verdict, p_weight)` rather than an overload of `check_opponent_weight`. The `start_match` timekeeper branch reads it only when `requires_timekeeper`. Flag-OFF functions and pgTAP stay untouched. The SELECT policy for the timekeeper then lives on the new table.

### M5. Extending `_athlete_busy` to `timekeeper_id` changes flag-OFF behaviour, and does not stop double-booking

- Evidence: `_athlete_busy` (`20261001100100:198-221`) is called only by `_invite_booking_block` (`20261001300700_location_review_fixes.sql:609-612`). It is NOT called by Arena `start_match_from_challenge`, which has no busy check (`20261007100000:1096-1270`).
- Risk: (a) Adding `OR timekeeper_id = p_athlete` blocks invite bookings for someone who is the record-only timekeeper of a flag-OFF match (a flag-OFF behaviour change, D1). (b) It does not stop a seated timekeeper from accepting an Arena challenge and starting their own match while timekeeping, which is the "busy in two matches" abuse case. The spec's B.8 ("One person timekeeps one match at a time") is therefore not enforced in the other direction.
- Fix: write a new helper `_timekeeper_busy(p_athlete)` that matches only `requires_timekeeper = true` matches. Use it in `get_timekeeper_candidates`, `request_match_timekeeper`, `respond_timekeeper_request` and the code join (timekeeper mode). Add a refusal in `start_match_from_challenge` and `_start_invite_booking` when either athlete is the seated timekeeper of an active timekeeper-mode match (HINT `timekeeper_busy`). That refusal only triggers when a timekeeper-mode match exists, so flag-OFF stays identical.

### M6. A 60-second heartbeat drop-out is too aggressive for gyms, and conflicts with the offline result queue

- Evidence: the result path goes through an offline `mutationQueue` (`use-record-result.ts:122-123`, `Saved locally` / `Result will sync when you're back online.`), which exists because gym connectivity is poor.
- Spec: B.6 drops the timekeeper after 60 s without `touch_match_timekeeper`. G8 makes that testable, and B.8 says a queued result from a dropped timekeeper is refused `not_timekeeper`.
- Risk: a timekeeper on bad Wi-Fi is silently replaced. Their queued, correct result is refused, the clock is retroactively paused up to 60 s earlier (both athletes' clocks jump), and a replacement who saw nothing records the result. This is a PM choice presented as a "decision", and it over-reaches beyond D9.
- Fix: count only an explicit Leave as an immediate drop-out. Treat a heartbeat gap as "timekeeper offline": athletes see a banner, but the clock and seat stay as they are, and the 10-minute D9 wait starts. Only clear the seat when that wait expires or a replacement is explicitly requested by BOTH athletes. A returning timekeeper keeps the seat if nobody has replaced them. Raise it as owner question Q3b.

### M7. Collusion: one athlete can seat their own friend with no opponent consent

- Spec: Q5 ("Either athlete, first request wins"). The picker lists "friends of EITHER competitor" (B.2), and the mid-match replacement is also picked by either athlete (R "Pick or replace").
- Risk: the athlete who is losing, or who expects to lose, asks their own friend, who then records the result. Rating v9 is applied at record time (`20261013100200_rating_v9_rpcs.sql:21-241`), and the victim must dispute within 24 h. A replacement after the end (B.6 "After the end, before the result") is the sharpest case: the losing athlete picks the recorder. The opponent's only defence before the start is Leave (cancel), which the spec does not frame as a veto.
- Fix: require the other athlete to approve a pick, for example "D. Okafor asked J. Cruz. Approve?", at least for replacements and for picks that are only one athlete's friend. Alternatively, give the non-picking athlete a one-tap "Not this timekeeper" before the start that withdraws the pick. Record `requested_by` and `approved_by` on the request. Also add an admin signal: per-timekeeper counts of drop-outs after end, results disputed, and a timekeeper recording for the same friend repeatedly. This is an owner decision; add it as Q12.

### M8. The timekeeper can void a recorded loss by dropping out after the end

- Spec: B.6 "After the end, before the result: same as during the match", that is, 10 minutes, then cancelled with no rating.
- Risk: a timekeeper who is a friend of the losing athlete simply leaves after the clock ends, and the match is cancelled, so the loss never counts. The rule exists to protect athletes, but here it hands a void button to the referee.
- Fix: once `ended_at` is set, cancellation after a drop-out should go to an admin-review state, or at least flag the match (admin signal, like `match_footage_verdicts`). Do not quietly cancel. Alternatively, refuse Leave after `ended_at` and require the result. Put this to the owner.

### M9. Writing a heartbeat to `matches` every 15 s is a heavy design

- Spec: BE-1 adds `matches.timekeeper_seen_at`, and BE-8 has `touch_match_timekeeper` every 15 s.
- Risk: each touch is an UPDATE on `matches`. It fires every `matches` trigger (`guard_match_columns`, the timekeeper code close trigger, the video/sync triggers) and a realtime `postgres_changes` event to every subscriber. It also contends for the row lock with `record_match_result`, which takes the global `rating_v9` advisory lock and then the match row (`20261013100200:48-58`).
- Fix: store the heartbeat in a separate server-only table, `match_timekeeper_presence (match_id PK, timekeeper_id, seen_at)`. The sweep reads it, and only state changes touch `matches`.

---

## MINOR

### m1. Section A citation mismatches (sampled about 110 citations; these were wrong or loose)

| Spec citation | Correct value |
|---|---|
| `MatchFlowWizard (:867)` in `app/(app)/match/[matchId].tsx` (A.1) | The file has 101 lines: import at `:22`, mount at `:91` |
| `start_match_from_challenge (:1887)` in `use-arena-challenge.ts` | `:1887` is the client wrapper call `startMatchFromChallenge(supabase, current.challengeId)`; a second call path for an already-started challenge is at `:2095` |
| `Draw (:126)` (A.5, read in the `result-form.tsx` sentence) | The `Draw` tile is in `steps/result-step.tsx:126`; `result-form.tsx` has the draw plate at `:286`/`:291` |
| `use-faceoff.ts:279-281` (dual auto-start) | The effect is at `:280-282`; the condition is at `:281` |
| Leave alert `use-faceoff.ts:369-371` | Title and body are both at `:369`, `Keep Waiting` is at `:370`, `Cancel Match` is at `:371` (the range is fine, the per-string mapping is not) |
| `{OPP} WEIGHED IN AT {w} LBS` at `faceoff-weight-check.tsx:90` (B.3) | `:90` is the template `${OPP} ${verb} ${lbs(...)}`; the literal `WEIGHED IN AT` is at `:79` (A.2 cites both, which is correct) |

The citations the PM flagged as derived from offsets are correct: `result-form.tsx:236` `FINISH TIME`, `:256` `WITHIN`, `:259` `FROM MATCH CLOCK`; `arena-plates.tsx:79` `Waiting for {name}`, `:82` `You'll both drop into the match the moment they accept.`, `:85` `Sent`, `:88` `Cancel`. The following were also checked and match literally: every `challenge-prompt-sheet.tsx` citation, every `faceoff-top.tsx`, `faceoff-body.tsx` and `faceoff-weight-check.tsx` citation in A.2 and A.3, `countdown.tsx:170/208/244`, the live files, `end-step.tsx:35/38`, `result-step.tsx:104-155`, `confirm-step.tsx:169-235`, `match-extras.ts:55/68`, `dispute-form.tsx:62-101`, `verdict-step.tsx:169-340`, `use-record-result.ts:85/122/123`, `use-wizard-sync.ts:80`, and jr_be `push/index.ts:444-445` and `challenge-payload.ts:147` (`Challenge Accepted`). The ranges `result-waiting.tsx:35-48`, `confirm-step.tsx:55-57` and `state-strip.tsx:22-50` contain the cited strings.

### m2. BE-10 premise is wrong

`get_match_details` already admits the timekeeper (`20261008100100_playback_read_contract.sql:270-275`, "participant (or timekeeper)"), and the `matches` SELECT policy shows the timekeeper their match (`20261006100000:705-706`, comment). Only the mobile wizard refuses them (`match-flow-wizard.tsx:109-110, 251`). Rewrite BE-10 as "add `requires_timekeeper`, the role and the timekeeper's name to the payload", and make FE-2 own the refusal.

### m3. `mark_match_ready` must refuse flag-OFF matches

R says flag-OFF ready is "broadcast only". State explicitly that `mark_match_ready` raises `not_timekeeper_mode` when `requires_timekeeper = false`, so that no flag-OFF client or row changes. Also state that in timekeeper mode the athlete opponent check is mandatory, regardless of `opponent_weight_check_required` (seeded false, `20260930195443:142`). Otherwise `weight_check_pending` in `mark_match_ready` contradicts the flag-OFF semantics of that flag.

### m4. A lazy deadline check must not RAISE after writing

"Every timekeeper RPC checks it lazily" (R). If an RPC cancels the match and then raises, the cancel rolls back. Specify that a lazy cancel returns `{ok:false, code:'match_cancelled'}` (or commits through the cron only).

### m5. Lock order is unspecified for the new writers

`record_match_result` takes `pg_advisory_xact_lock(hashtextextended('rating_v9',0))` and then `matches ... FOR UPDATE` (`20261013100200:48-58`). Require the following: the cancel sweep, the drop-out sweep, `end_match_clock`, `mark_match_ready` and the request RPCs lock `matches` first and the request row second, re-check `status` and `requires_timekeeper` under the lock, and never take the rating lock after a match row lock. With that order, a cancel that races a record is safe: whichever commits first wins, and the other sees `invalid_status` or a non-`in_progress` row.

### m6. `in_progress` to `cancelled` is allowed, but its side effects need listing

The status CHECK allows it (`20260604000000_cancel_session_match.sql:27`), and there is no transition trigger. It is safe for rating: v9 rates only `completed`/`disputed` (`20261013100000_rating_v9_schema.sql:59`), and the rating is applied only by `record_match_result`. However, `cancel_session_match` is pending-only (:78-83), so the sweep needs its own server-only path. Video paths have explicit `cancelled` branches (`20261006100100:630`, `20261006100200:289`, `20261006200400:1669`). List these in BE-8, add a pgTAP test that a cancelled timekeeper-mode match leaves no rating rows and no highlight dispatch, and add the case to Q6.

### m7. A dropped timekeeper loses access to their own film

Video and match SELECT for a timekeeper keys on `matches.timekeeper_id` (`20261006100000:705-706`). Clearing it on drop-out removes the dropped timekeeper's access to any angle they uploaded (D8). Either keep a `match_timekeeper_history` row that the media RLS also honours, or accept the loss and say so.

### m8. Code join cannot fill a mid-match vacancy

`close_match_timekeeper_code` closes the code when the match leaves `pending` (`20261006100000:294-318`), and `join_match_as_timekeeper` refuses `match_started`. Q4's fallback therefore only works before the start. Say so on the rules board.

### m9. Go/no-go criterion 4 overstates the runbook

`jr_be-wmq` is "Prod: flip timekeeper_role off and land 20261015200000 with next release". It is not a rehearsed flip-on/flip-back runbook. Reword criterion 4, or file the runbook as its own bead.

### m10. Sizing is optimistic, though the conclusion holds

The backend estimate of 3 to 4 days omits B1, B2, M2, M5 and M9 and the version gate (M1); 5 to 7 days is more realistic. The total is about 10 to 14 days, which strengthens "ship dark".

---

## Owner-decision conformance

- D1, the snapshot: conformant in intent. Flag-OFF identity holds only if B1, M4, M5 and m3 are fixed as described (each change keyed on `requires_timekeeper`, or a new object that flag-OFF never touches). The new wizard step `crew` is safe if `step-router.ts` maps to it only when `requires_timekeeper` is true. Today `pending` maps to `weight` (`step-router.ts:62-63`). Default the new field to false when it is absent from an older backend payload.
- D3, friends and nearby after accept, with a phase 2 slot: conformant. The disabled `Invite someone not on ELO RATED` row, `channel` and `invite_id` on the request table, and section P are good. The open question is who must consent to the pick (M7); D3 does not answer it.
- D4: conformant (start, clock and result belong to the timekeeper only), provided B1 is fixed so the legacy `end_match` cannot bypass it.
- D5: conformant, provided M3 is fixed (a re-weigh must void the timekeeper's confirmation).
- D6: conformant. The merged "Weight looks right, I'm ready" is allowed ("may be merged"), and the timekeeper drives the match once both athletes are ready.
- D7: conformant. Dropping the recorder auto-confirm is the correct consequence of a non-participant recorder (`20261013100200:209-224` only auto-confirms competitors anyway).
- D8: conformant.
- D9: conformant for "not there" (arrived = accepted, flagged as a cheap definition) and for drop-out with a 10-minute cancel. Two PM additions over-reach. The 60 s heartbeat (M6) is presented as a "decision" but is a PM choice. The 2-minute request lapse is listed as Q7, which is fine. M2 and M8 are gaps that D9 does not cover.
- D10: "ship dark" is right; add the version gate (M1) to the go criteria.
- D11: C1 is clearly marked optional and recommended against before the alpha. No other flag-OFF change is proposed. Conformant.

## Abuse cases (summary)

1. **A friend as colluding timekeeper**: M7. The fix is opponent approval or veto, plus admin signals.
2. **A timekeeper who never records**: M2. The fix is a server auto-end and a result deadline that is treated as a drop-out.
3. **An athlete who leaves after a bad result**: unchanged and acceptable. Leaving counts as confirming (`match-extras.ts:55`), the 24 h cron confirms, and a dispute goes to an admin. A timekeeper who leaves after a bad result (from their friend's point of view) is M8.
4. **A timekeeper busy in two matches**: M5. Arena match creation has no busy check, so it needs a timekeeper-mode-only refusal in `start_match_from_challenge` and `_start_invite_booking`.

## Go/no-go

The recommendation to ship dark is honest and correct. The sizing is optimistic (m10) but does not change the conclusion. Add three go criteria: (1) a client version gate (M1); (2) pgTAP for a stalling timekeeper (M2); (3) pgTAP proving that the legacy `end_match` refuses timekeeper-mode matches (B1).
