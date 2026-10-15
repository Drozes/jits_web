# Timekeeper mode: product spec (PROPOSED, FOR OWNER REVIEW, 2026-10-15)

Status: draft by the PM, 2026-10-15. Input: `BRIEF.md` in this folder (owner decisions D1 to D11 are binding, including the 2026-10-15 update to D3 about off-platform timekeepers). Output for: Designer A (current flow boards `P-TK-A*`), Designer B (timekeeper boards `P-TK-B*`, optional boards `P-TK-C*`, the map `P-TK-00-Map` and the rules board `P-TK-B-Rules`), and the independent reviewer. Board list: `BOARDS.md`. Every string: `COPY-DECK.md`.

Code references: FE paths are relative to `apps/mobile/` in jits_web `origin/development` (this worktree, branch `design/timekeeper-proposal`); BE paths are jr_be `supabase/`. Sample data on every board: challenger M. Reyes (1512, 172.5 lbs), opponent D. Okafor (1487, 171.4 lbs), timekeeper J. Cruz.

## 1. Purpose and scope

Timekeeper mode puts a third, neutral person in charge of a ranked match. Today the two athletes run their own match: they weigh in, mark ready, the match starts automatically, either can pause or end, and whoever gets to the result form first records the result while the other confirms. That works between honest training partners, but it asks the two people with a rating at stake to referee themselves. Timekeeper mode hands the clock, the start and the result to an on-platform user who is not competing, while keeping every athlete safeguard that exists today (the opponent weight check, confirm or dispute, the 24 hour auto-confirm, video from any phone).

In scope:

- The feature flag `timekeeper_role` (D1) and the per-match snapshot `matches.requires_timekeeper`, so a flag flip never changes a match in flight.
- Picking a timekeeper after the challenge is accepted, from the athletes' friends and nearby athletes (D3), and the picked person's accept or decline.
- The 10-minute wait and auto-cancel when no timekeeper is present (D9), both before the start and after a mid-match drop-out.
- The three-role face-off, live, result and confirm flow (D4 to D8).
- Pushes per role.
- Optional, separately marked changes to the flag-OFF flow (D11, section C).
- The rules set (section R): who can do what, in each mode, with the server rule and refusal HINT.

Out of scope:

- Inviting off-platform people as timekeeper in phase 1 (D3). It is designed as phase 2 in section P so it slots in without rework, and the picker reserves a visible, disabled slot for it.
- Web. The web `(app)` is locked behind `NEXT_PUBLIC_WEB_APP_ENABLED` and its session-era wizard (`timekeeperEnabled: true`, jits-1m4) is not touched.
- New UI for the code/QR join (`get_match_timekeeper_code`, `join_match_as_timekeeper`). It stays on the backend as the in-person fallback (BRIEF section 6) and, in timekeeper mode, ends in the same `_set_match_timekeeper` core as an accepted pick; surfacing it in the mobile picker is open question Q4.
- Any change to rating math, disputes resolution or the video pipeline.

## A. Current two-athlete flow (flag OFF, today)

This is what Designer A draws on `P-TK-A1` to `P-TK-A5`, and it must mirror shipped code exactly. Every string below is literal from code with its file and line. Strings rendered in caps by style are given as the source string.

### A.1 Challenge accepted (Arena)

- Opponent's device: the incoming challenge sheet (`components/arena/challenge-prompt-sheet.tsx`) shows the kicker `INCOMING CHALLENGE` (:543), `{name} is live in the Arena` (:603), the stakes line `YOUR STAKES · {elo}` (:465) above the stakes strip, or, only when the stakes are missing, the fallback `Accept and you both drop straight into the match.` (:476-484), the answer countdown `{m:ss} LEFT` (:162), with `Decline` (:659), `Accept` (:698, `Accepted` once tapped) and `Later` (:730).
- Challenger's device: the mat-board waiting strip (`components/arena/mat-board.tsx`) `Waiting · {name}` (:382, a11y `Waiting for {name}`) with its countdown and `Cancel` (a11y `Cancel challenge`). The older `WaitingPlate` in `arena-plates.tsx` (`Waiting for {name}`, `You'll both drop into the match the moment they accept.`) is now used only by the practice flow (`components/practice/practice-steps.tsx:61`) and is not part of this flow.
- On Accept, `lib/arena/use-arena-challenge.ts` calls `acceptChallenge` (:1850, a direct table UPDATE that carries the opponent's weight) and then the client wrapper `startMatchFromChallenge` (:1887; a second path for an already-started challenge at :2095) for the RPC `start_match_from_challenge` (idempotent, either side may call it), which inserts the `matches` row as `pending` with two `competitor` participants. The accepter broadcasts to pull the challenger off the waiting plate, and both devices `router.push` into `app/(app)/match/[matchId].tsx`, which mounts `MatchFlowWizard` (import `:22`, mount `:91`; the navigation itself is `use-arena-challenge.ts:867`). Push to the challenger: `Challenge Accepted` (jr_be `functions/push/challenge-payload.ts`).

### A.2 Face-off: weigh-in and opponent weight check (wizard step `weight`)

`lib/match-flow/step-router.ts:62-63` maps `pending` to `weight`. Both devices show the same screen with their own perspective.

- Top bar (`components/match-flow/faceoff/faceoff-top.tsx`): `Leave` (:99, a11y `Cancel match` :78) and the label `FACE-OFF · WEIGH IN` (:107). Fight card: initials blocks, short names, `ELO {n}` or `UNRATED` (:136, :151), `VS` (:142), weights as `{w} LBS` or `-- LBS` (:33). A pencil edits the profile weight for future matches only: `Updates your profile weight for future matches. This match keeps its weigh-in.` (:266), `Save` / `Saving` (:250), `Cancel` (:261), and after a save `Profile weight saved: {w} lbs, for future matches.` (:202-207).
- Body (`faceoff/faceoff-body.tsx`): the gap line `{d} LBS APART · SAME DIVISION` or `{n} DIVISION(S) APART` (:43-44), the stakes strip, `The heavier athlete's rating is adjusted for the weight gap.` (:65), my plate `CONFIRM WEIGHT` then `WEIGHED IN` (:69), the opponent plate `{OPP} WEIGHING IN` then `WEIGHED IN` (:75), and the CTA `Confirm {w} lbs` or `Confirm weight` (:46).
- Opponent weight check (`faceoff/faceoff-weight-check.tsx`, only for challenge-backed matches, jr_be-ahn.4): once my weight is in, the opponent plate becomes `YOUR CHECK` or `YOU FLAGGED` (:21); `CHECKING WEIGH-INS...` (:49); the verdict line `{OPP} WEIGHED IN AT {w} LBS` (or `RE-WEIGHED AT`, or `{OPP} HAS NO WEIGH-IN ON RECORD`) (:79, :90) with `Confirm` (:95) and `Doesn't look right` (:102). A flag shows `You flagged {opp}'s weight. Match is on hold.` (:68) with `Withdraw flag` (:71). The flagged athlete sees `{opp} says your weight doesn't look right. Re-weigh to continue.` (:154), a pounds field with `LBS` (:177) and `Re-weigh` (:180); afterwards `Waiting for {opp} to check your new weight.` (:61). While the other side has not checked: `Waiting for {opp} to check your weight.` (:112). Toasts: `Weight changed` (`lib/match-flow/use-faceoff.ts:322`), `Couldn't save your check` (:325), `Couldn't re-weigh` (:331, :342).
- State: weighed-in is a broadcast only (`use-faceoff.ts:183-235`, channel `session-match:<matchId>`, repeated every 3 s). The checks are DB rows (`match_weight_checks`, `check_opponent_weight`, `reweigh_for_match`). The wizard moves to `ready` once my weight is in and my check of theirs is confirmed, or at once when the match has no checks (`use-faceoff.ts:297-301`).

### A.3 Face-off: ready and the automatic start (wizard step `ready`)

- Top bar label `FACE-OFF · READY` (`faceoff-top.tsx:107`) and the compressed athlete chip; the camera preview renders between header and body.
- Body (`faceoff-body.tsx`): `CAMERA OFF ON THIS PHONE` when not recording (:109); the recording panel `Record from my phone` (:174) with the opponent's choice `{OPP} · CHOOSING`, `{OPP} RECORDING` or `{OPP} NOT RECORDING` (:166), and `No one is recording this match` (:198) when nobody records; plates `YOU · NOT READY` / `YOU · READY` (:114) and `{OPP} · NOT READY` / `{OPP} · READY` (:119); the helper `Match starts when you both tap ready` (:143) above `I'm ready` (:145). After my tap: `WAITING FOR {OPP}...` or `BOTH READY` (:149). Weight hold: `I'm ready` disabled (:130) with `MATCH ON HOLD · WEIGHT CHECK` or `WAITING FOR WEIGHT CHECKS` (:132).
- Start: there is no Start button. When both devices have seen both ready broadcasts and the weight gate allows it, BOTH call `start_match` (`use-faceoff.ts:280-282`, condition at :281) and show `STARTING MATCH...` (`faceoff-body.tsx:138`); the loser of the race reads the match. Refusals: toast `Match on hold` (`use-faceoff.ts:258`) for a weight-gate HINT, else `Couldn't start match` (:270). Push to both: `Match Started` / `Your match has begun!` (jr_be `functions/push/index.ts:444-445`).
- Leave: the alert `Cancel match?` / `Your opponent will be returned to the lobby.` (title and body both `use-faceoff.ts:369`) with `Keep Waiting` (:370) and `Cancel Match` (:371) calls `cancel_session_match`. The other device exits with the toast title `Match cancelled` (`lib/match-flow/use-wizard-sync.ts:80`) and the description `Your opponent left the ready check.` or `Your opponent cancelled the match.` (`use-faceoff.ts:209`).

### A.4 Countdown and live (wizard step `live`)

- Countdown (`components/match-flow/countdown/countdown.tsx`): the tag `REC ARMS AT GO` or `NOT RECORDING` (:170), the 3, 2, 1 numerals, `SYNCED TO SERVER CLOCK · BOTH PHONES` (:208), then the red `GRAPPLE` (:244).
- Live (`steps/live-step.tsx`, `live/*`): clock slab label `LIVE`, `PAUSED`, `TIME` or `FINAL` (`live/clock-slab.tsx:63-69`); `PAUSE` / `RESUME` (`live/pause-button.tsx:51`); `HOLD TO END`, `KEEP HOLDING`, `ENDING` (`live/hold-to-end-button.tsx:143`); the state strip `PAUSED · CAMERA STILL RECORDING`, `FINAL 10 SECONDS`, `TIME · ENDING MATCH`, `RELEASE TO CANCEL · ENDING MATCH`, `CAMERA STARTING · CLOCK IS RUNNING` (`live/state-strip.tsx:22-50`); the REC tally `REC {mm:ss}`, `CAMERA STARTING`, `SAVING VIDEO`, `NO VIDEO` (`live/rec-tally.tsx:17-22`); the no-video plates (`live/no-video-plate.tsx:18-34`).
- Either athlete can pause or resume (`pause_match` / `resume_match`, gated by `can_control_match`, participants only) and either can end. End is a broadcast only (`match_ended`, `lib/match-flow/use-live-controls.ts:41-56`): the match stays `in_progress` until a result is recorded. A legacy server RPC `end_match` exists (jr_be `20260927000000_match_control_participant_guard.sql:199-261`, gated by `can_control_match`, sets `completed` with no result); the app deliberately never calls it (jits-ait), and it is not changed for flag-OFF matches. The other phone shows `{NAME} ENDED THE MATCH` and `FINAL CLOCK {mm:ss} OF {mm:ss}` (`live/opponent-ended-plate.tsx:45, 51`). At 00:00 the clock auto-ends. Toasts: `Couldn't pause` (`use-live-controls.ts:110`), `Couldn't resume` (:86).

### A.5 Result, confirm and verdict

- End step (`steps/end-step.tsx`): `MATCH ENDED` (:35) and `Up next: record the result` (:38) for about 0.8 s.
- Result, claim-first (`steps/result-step.tsx`): the first athlete to tap a winner or Draw claims the form (`lib/match-flow/use-result-claim.ts`, advisory broadcast). The claimer sees `ENDED AT {mm:ss}` (:104), `Record result` (:113), `TAP THE WINNER` (:120), winner tiles marked `YOU` / `OPPONENT` (`steps/result-form.tsx:100`), `Draw` (`result-step.tsx:126`), then `WINNER` with `Change` (`result-form.tsx:122, 137`), `HOW DID IT END?` (:163), `FINISH TIME` (:236) with `FROM MATCH CLOCK` (:259) or `WITHIN {mm:ss}` (:256), the draw plate `Match ends in a draw` / `Draws cost both athletes rating.` (:286, :291), the CTA `Record result` / `Recording...` (`result-step.tsx:148`) and `You're recording for both of you. {opp} sees this live.` (:155). The other athlete sees `MATCH OVER`, `{name} is recording the result`, `You'll confirm it in a moment.`, cells `ENDED AT` and `CLOCK` (`steps/result-waiting.tsx:35-48`) and, after 20 s of silence, `Still no result from {name}.` with `Record it myself` (:74, :76). Toasts: `Couldn't record result` (`lib/match-flow/use-record-result.ts:85`), offline `Saved locally` / `Result will sync when you're back online.` (:122-123).
- `record_match_result` (jr_be `20261013100200_rating_v9_rpcs.sql`) completes the match, applies rating v9 and auto-confirms the recorder, whose device goes straight to the verdict.
- Confirm (`steps/confirm-step.tsx`), for the athlete who did not record: `RESULT RECORDED BY {OPP}` (:174), `Confirm result` (:176), `WINNER` or `RESULT` (:185), `YOU WON` / `YOU LOST` / `DRAW` (:55-57), `{name} won` (:192), `YOUR RATING` (:207), status rows `{OPP} CONFIRMED ✓` / `WAITING` (:216) and `CONFIRMED ✓` / `WAITING ON YOU` (:223), `Confirm result` (:230), `Dispute result` (:235), `If you leave without disputing, it counts as confirming.` (`lib/match-flow/match-extras.ts:55`), `Locks automatically in {n} h.` (`match-extras.ts:68`) or `The dispute window has closed.` (`confirm-step.tsx:169`). Dispute form (`steps/dispute-form.tsx`): `Dispute Result` (:62), `Wrong winner, wrong submission, or it never happened? Tell us. An admin reviews...` (:65), `What went wrong? (optional)` (:74), `Submit Dispute` (:86), `Back` (:101).
- Verdict (`verdict/verdict-step.tsx`): `YOU WON` / `YOU LOST` / `DRAW` / `DISPUTED` / `MATCH RECORDED` (:169), `Watch film` or `Open match` (:198), `Share match` (:329), `Know someone who'd beat you? Invite them.` (:340).

### A.6 What syncs the devices today

The DB is the truth for status, `started_at`, pause state, the result and confirmations (the wizard's reconciler, `lib/match-flow/use-wizard-sync.ts`). Weighed-in, ready, recording choice, end and the result claim are broadcast only on the public `session-match:<matchId>` channel (filed as jr_be-czt). Nothing expires a stale `pending` match (jr_be-xpf).

## B. Timekeeper flow (flag ON)

### B.0 Roles and the snapshot

Three roles: **challenger**, **opponent** (together, "the athletes"; both are `competitor` rows in `match_participants`) and **timekeeper** (`matches.timekeeper_id`, never a participant row, never one of the two athletes, D2). The timekeeper's own weight and rating never enter the match.

When `start_match_from_challenge` or `_start_invite_booking` creates the match, it decides `matches.requires_timekeeper` (default false). Every rule below keys off that column, never off the live flag (D1). A match created with the flag OFF runs today's flow to the end even if the flag turns on a second later, and vice versa.

**Capability rule (review M1).** Both creation paths gain `p_client_supports_timekeeper boolean DEFAULT false`. Each athlete's client advertises support when it creates a challenge, accepts it, or calls the start (stored on the challenge row per side). A match snapshots `requires_timekeeper = true` only when the flag is on AND both athletes' clients have advertised support; otherwise it is a flag-OFF match. An older build therefore can never receive a timekeeper-mode match it cannot run, and the flag-OFF path is unchanged because the default is false. The wizard treats a missing `requires_timekeeper` in an older backend payload as false.

### B.1 Arena changes before the match exists (flag ON only)

So the athlete is not surprised, two lines appear only when the flag is known ON: on the opponent's challenge sheet, `Accept, then pick a timekeeper together.` (TK-AR1) is a helper line under the stakes strip, and it also replaces the no-stakes fallback in place (`challenge-prompt-sheet.tsx:476-484`); on the challenger's mat-board waiting strip, `You'll both pick a timekeeper the moment they accept.` (TK-AR2) is a helper line under `Waiting · {name}` (`mat-board.tsx:382`). The capability rule (B.0) means these lines can promise a timekeeper that an older build on the other side then prevents; the match simply runs the two-athlete flow and the picker never appears (owner question Q13). With the flag unknown the shipped copy stays (fail-closed toward today's copy; the server snapshot decides the actual mode).

### B.2 Pick a timekeeper (new wizard step `crew`)

Both athletes land on the new step `crew` (step-router maps `pending` plus `requires_timekeeper` plus no accepted timekeeper to `crew`). Either athlete can pick; the first request wins and the other athlete's screen follows it live. If the owner accepts Q12 (recommended), the pick first goes to the other athlete as a one-tap approval card (`{athlete} picked {name}. OK with you?`, TK-P25, `Approve` TK-P26, `Not this one` TK-P27) and is sent to the person only once approved, all inside the same 10-minute window. Meanwhile the picking athlete sees `Waiting for {athlete} to approve.` (TK-P28) on the pending card, with `Ask someone else`.

- Header: `Leave` (shipped) and the label `FACE-OFF · TIMEKEEPER` (TK-P1). Title `Pick a timekeeper` (TK-P2), helper `They start the match, run the clock and record the result. They can't be either of you.` (TK-P3).
- The deadline: a countdown chip `CANCELS IN {m:ss}` (TK-W1), amber, from `matches.timekeeper_deadline_at` (accept time plus 10 minutes, D9), driven by the shipped `lib/arena/fresh-countdown.ts` ticker (the same one behind `PromptCountdown` in `components/arena/challenge-prompt-sheet.tsx`). At 2:00 and under it reads the same in signal red. "Arrived" means accepted (the cheapest definition; a proximity check could come later).
- Search field `Search friends and nearby` (TK-P4), filtering the loaded lists by name on the device.
- One server read feeds the list: `get_timekeeper_candidates(p_match_id)` (BRIEF section 6), callable by a competitor of a pending match with no timekeeper. It returns friends of EITHER competitor plus live athletes near the match (distance bands only, never coordinates or distances on screen), excluding both competitors, bots, anyone busy and anyone holding another open request. `get_my_friends` and `get_arena_nearby` are not used directly: the first is caller-scoped and the second is empty while `match_location_required` is off. Section `Friends` (TK-P5): friends of either athlete, on-the-mat first; a row that is the other athlete's friend carries the caption `{athlete}'s friend` (TK-P5b). Section `Nearby` (TK-P6). The client overlays `app:online` presence for an online dot. Each row: avatar, name, `{elo} ELO`, the dot, and `Ask` (TK-P7). Busy people are excluded by the server; when a row turns busy between the read and the tap, `Ask` is refused and the row shows `Timekeeping another match` (TK-P8) or `Running their own match` (TK-P9). The list re-reads on focus (friends are not realtime).
- Phase 2 slot (owner update to D3): a last row `Invite someone not on ELO RATED` (TK-P10) with the tag `PHASE 2` (TK-P11), drawn disabled. It is not built in phase 1; see section P.
- Empty states: no friends `No friends yet. Nearby athletes can timekeep too.` (TK-P12); nobody nearby `Nobody else on the mat right now.` (TK-P13); both empty `Nobody to ask yet. Ask someone at your gym to open ELO RATED and go live.` (TK-P14); search with no result `No one by that name.` (TK-P15); load failure `Couldn't load people to ask.` with `Try again` (TK-P16).
- After `Ask`: the row becomes the pending card `Asked {name}` (TK-P17), `Waiting for them to accept.` (TK-P18), with `Ask someone else` (TK-P19). The other athlete sees `{athlete} asked {name}` (TK-P20) with the same `Ask someone else`. Only one request is open at a time; `Ask someone else` withdraws it (push to the asked person is replaced by a silent cancel). The deadline keeps running.
- Declined: `{name} can't timekeep. Pick someone else.` (TK-P21) and the list returns without them: `get_timekeeper_candidates` excludes anyone who declined a request for this match. Request lapsed after 2 minutes unanswered: `{name} didn't answer. Pick someone else.` (TK-P22). The request lapse (2 minutes) is shorter than the match deadline so the athletes get several tries.
- Accepted: `{name} is your timekeeper` (TK-P23) for one second, then face-off weigh-in. The deadline is cleared.
- Nobody accepted in 10 minutes: the server cancels the match (`cancelled`, no rating). Both athletes exit to the Arena with the toast `Match cancelled` (shipped title) and `No timekeeper joined in 10 minutes.` (TK-W2). Push to both athletes: `Match cancelled` / `No timekeeper joined in time. Challenge again when you're ready.` (TK-N4).

The asked person's side:

- Push `Timekeep {A} vs {B}?` / `{athlete} asked you to start the match, run the clock and record the result.` (TK-N1), sent as the `social_notifications` kind `timekeeper_requested` in category `matches` (not `friends`, which a user may mute). Pushes have no action buttons, so a tap opens an in-app sheet on a non-tab-root route (`/match/[matchId]/timekeep`; tab-root targets are dropped during a match). If they are in the app, the same sheet opens from a realtime row. It shows `Timekeep this match?` (TK-T1), the fight chip `{A} vs {B}` with ELOs, `You start the match, run the clock and record the result. Your rating isn't affected.` (TK-T2), `Accept` (TK-T3), `Decline` (TK-T4), and the request countdown `ANSWER IN {m:ss}` (TK-T5).
- Accept refused (they started their own match, or another request was accepted first, or the request was withdrawn): `This request is no longer open.` (TK-T6).
- Recording consent (D12): the sheet adds `Timekeepers record the match on video. ELO RATED analyses the film with AI.` (TK-T7). If the timekeeper has not yet allowed AI processing (the "Before you film" consent, jits-rog5.11), Accept opens the shipped consent sheet first; `Allow and film` (shipped label, `lib/moderation/moderation-copy.ts:86`) continues the accept, `Not now` returns to the request sheet with `You need to allow recording to timekeep.` (TK-T8) and Accept stays available. Refusing consent means they cannot timekeep; Decline is always available.
- After Accept they enter the match wizard in the timekeeper role (B.3).

### B.3 Face-off in timekeeper mode

**Athletes.** Step 1 is the shipped weigh-in, unchanged (confirm my weight, `Confirm {w} lbs`). Step 2 merges the opponent weight check into the ready step (recommended; see the reasoning below). The ready screen keeps the camera, the recording panel and the ready plates, adds a timekeeper row and replaces the helper and button:

- Timekeeper row: `TIMEKEEPER` (TK-F1) with `{name}` and their state `CHECKING WEIGHTS` / `WEIGHTS CONFIRMED` (TK-F2, TK-F3).
- Opponent line: `{OPP} WEIGHED IN AT {w} LBS` (shipped: template `faceoff-weight-check.tsx:90`, literal `WEIGHED IN AT` at :79).
- Primary: `Weight looks right, I'm ready` (TK-F4). It confirms my check of the opponent's weight and marks me ready in one tap, server side (`mark_match_ready` with `p_confirm_opponent_weight`). Secondary: `Doesn't look right` (shipped), which opens the shipped flag flow.
- After my tap: `{name} STARTS THE MATCH` (TK-F5) when both are ready, else the shipped `WAITING FOR {OPP}...`. The recording switch locks on ready, as today.
- Helper above the button, replacing `Match starts when you both tap ready`: `{name} starts the match once you're both ready.` (TK-F6).
- Timekeeper flagged me: `{name} says your weight doesn't look right. Re-weigh to continue.` (TK-F7) with the shipped re-weigh field. In timekeeper mode, a re-weigh (for any reason, including an opponent's flag) voids EVERY check whose subject is me (my opponent's check and the timekeeper's confirmation) and clears both athletes' ready, server side (review M3). Flag-OFF `reweigh_for_match` is unchanged.

Why merge: in timekeeper mode, ready is no longer a trigger (nobody auto-starts), so it is a statement "I accept this opponent and I am set". Confirming the opponent's weight is part of that statement. Merging removes one screen and one tap per athlete, and it lets the server enforce "ready implies I checked them" atomically. The flag path keeps today's semantics.

**Timekeeper.** A new screen (`FACE-OFF · TIMEKEEPER` label, TK-K0), with their own `Leave` (`Leave` shipped label; alert TK-K14):

- The fight chip (both athletes, ELOs, weights).
- One row per athlete: name, `{w} LBS`, status `WEIGHING IN` / `WEIGHED IN` (TK-K1, TK-K2), ready `NOT READY` / `READY` (TK-K3, TK-K4), and once weighed in the timekeeper's buttons `Confirm` and `Doesn't look right` (shipped labels). After a verdict the row shows `CONFIRMED` (TK-K5) or `YOU FLAGGED` (shipped) with `Withdraw flag` (shipped).
- Recording (D12): the timekeeper's record row is LOCKED ON: the shipped label `Record from my phone` with no switch, a lock glyph and `Timekeepers always record this match.` (TK-K9). Their recording intent is written server side when they accept (`set_match_recording_intent`, role timekeeper, on). The camera preview shows the shipped `Preview only. Recording starts with the match.`
- Start: `Start match` (TK-K6), disabled until both athletes are ready, both timekeeper weight confirmations exist, no flag is open, AND (D12) the timekeeper's camera is ready on this phone and their recording intent is on server side. The disabled reason under it: `WAITING FOR BOTH ATHLETES` (TK-K7), `CONFIRM BOTH WEIGHTS` (TK-K8), `MATCH ON HOLD · WEIGHT CHECK` (shipped), or `WAITING FOR YOUR CAMERA` (TK-K10). Camera permission denied: `Allow camera access to timekeep. Your camera records the match.` (TK-K11) with `Open Settings` (TK-K12); Start stays disabled. Tap: `STARTING MATCH...` (shipped) then the shared countdown on all three phones, with the caption `SYNCED TO SERVER CLOCK · ALL PHONES` (TK-L0) in timekeeper mode.
- Coordinator assumption, pending owner confirmation (drawn and labelled as such): a timekeeper "Doesn't look right" on an athlete blocks the start until that athlete re-weighs and the timekeeper confirms again, the same as today's athlete flag.

### B.4 Live

- Timekeeper: the shipped live screen with the athlete bar showing both athletes (no "You"), `PAUSE` / `RESUME` and `HOLD TO END`, the REC tally if recording, and the kicker `YOU RUN THE CLOCK` (TK-L1).
- Athletes: the shipped live screen with the clock, the REC tally and the athlete bar, but no pause and no end controls. In their place, the strip `{NAME} RUNS THE CLOCK` (TK-L2). Paused by the timekeeper: the shipped `PAUSED · CAMERA STILL RECORDING`. The athlete's camera keeps recording exactly as today (D8).
- End: the timekeeper's hold-to-end calls a NEW server action `end_match_clock(p_match_id, p_final_elapsed_s)` (timekeeper mode only; refuses `not_timekeeper_mode` on a flag-OFF match), which stamps `ended_at` and the final clock and leaves `status` at `in_progress`. The legacy `end_match` gains a first-line branch that refuses timekeeper-mode matches (HINT `use_end_match_clock`); that branch is unreachable for flag-OFF matches, so pgTAP 061 and 066 are unchanged (review B1). The athletes' phones freeze on a DB change, not a broadcast, and show `{NAME} ENDED THE MATCH` / `FINAL CLOCK {mm:ss} OF {mm:ss}` (shipped strings, name = the timekeeper).
- Server auto-end (review M2): if the timekeeper has not ended the clock by `started_at + duration_seconds + total_paused_duration` (plus the countdown), the per-minute sweep stamps `ended_at` at that moment. The athletes' phones already show `TIME`. A result deadline starts at `ended_at`: no result within 10 minutes counts as a stall (B.6).

### B.5 Result and confirm

- Timekeeper: straight from end to the shipped result form (no claim; they are the only recorder), with the kicker changed to `You're recording for {A} and {B}. They confirm it next.` (TK-R1, replacing the claim line). `record_match_result` in timekeeper mode writes no confirmation row for anyone. After recording: `Result recorded` (TK-R2), `{A} and {B} confirm it next. Your rating isn't affected.` (TK-R3), confirmation progress rows (shipped `WAITING` / `{OPP} CONFIRMED ✓` style, one per athlete) and `Done` (TK-R4), which exits to the Arena.
- Athletes: the shipped waiting view with the timekeeper as the recorder: `MATCH OVER`, `{name} is recording the result`, `You'll confirm it in a moment.` (shipped), with no `Record it myself` take-over (TK mode never offers it). Then both athletes get the shipped confirm step with `RESULT RECORDED BY {TIMEKEEPER}` (TK-R5, the shipped template with the timekeeper's name) and both status rows starting at `WAITING ON YOU` / `WAITING`. Confirm, dispute, the 24 h lock and `If you leave without disputing, it counts as confirming.` are unchanged (D7). The match finalises when both athletes confirm, or by the shipped cron.
- Rating: applied at record time, as today.

### B.6 Timekeeper drop-out, offline and stall (revised after review)

Three different situations, with different rules (review M6, M2, M8):

- **Explicit Leave = immediate drop-out.** Only the timekeeper's own Leave is an immediate drop-out. Leave is offered before the start and during the clock, never after `ended_at` (review M8: after the end, the timekeeper owes the result).
- **Offline.** The timekeeper's device writes a heartbeat every 15 s to the server-only table `match_timekeeper_presence (match_id PK, timekeeper_id, seen_at)`, never to `matches` (review M9). A gap of 60 s marks the timekeeper OFFLINE: athletes see the banner `{NAME} IS OFFLINE` (TK-D7) and the deadline chip, and the 10-minute D9 wait starts. Nothing else changes: the seat, the clock and any queued result stay valid, and there is no backdated pause. If the timekeeper comes back within 10 minutes, the banner clears and the wait stops. Only when the 10 minutes elapse does an offline timekeeper become a drop-out.
- **Stall.** A seated, online timekeeper who has not started within 10 minutes of both athletes being ready, or has not recorded within 10 minutes of `ended_at`, is treated like an offline timekeeper (the same 10-minute window, then the rules below). PM proposal pending the owner (D9 names only "not there" and "drops out").

What a drop-out does:

- **Before the start** (`pending`): the server clears `timekeeper_id`, clears both athletes' ready (their weigh-ins and athlete checks stay), voids the timekeeper's weight confirmations, and sets a fresh `timekeeper_deadline_at` of now plus 10 minutes. The athletes return to the picker with `{name} left. Pick a new timekeeper.` (TK-D1). Same 10-minute cancel.
- **During the clock** (`in_progress`, no `ended_at`): an explicit Leave pauses the clock at that moment; an offline drop-out pauses it when the 10 minutes elapse, if it is still running (the athletes' screens already show the timekeeper offline). The server clears `timekeeper_id` and sets a fresh 10-minute deadline. Athletes see `TIMEKEEPER LEFT · CLOCK PAUSED` (TK-D2), `{name} left. Pick a new timekeeper to finish this match.` (TK-D3), the deadline chip and `Pick a new timekeeper` (TK-D4). Cameras keep recording. A replacement (approved by the other athlete, Q12) accepts and resumes the clock with `Resume when you're ready.` (TK-D5); the weight confirmations are not repeated mid-match. No replacement in 10 minutes: the match is cancelled by a server-only path (not `cancel_session_match`, which is pending-only), no rating, toast and push TK-D6 / TK-N6.
- **After `ended_at`, before the result**: no Leave is offered. A timekeeper who goes offline or stalls past the 10-minute result window does NOT cancel the match: the match is flagged for admin review (`match_timekeeper_review` signal, like `match_footage_verdicts`), athletes see `{NAME} DIDN'T RECORD THE RESULT · AN ADMIN WILL REVIEW IT` (TK-D8), and an admin records or voids it. This closes the "void a loss by walking away" hole (review M8).
- **Film access (review m7)**: a dropped timekeeper keeps read access to the footage they uploaded: `match_timekeeper_history (match_id, timekeeper_id, seated_at, left_at)` is honoured by the media RLS alongside `matches.timekeeper_id`.
- Justification: only an explicit Leave is certain; gym Wi-Fi makes a 60 s gap common, so a gap only starts the D9 wait (review M6). The athletes are never handed the clock or the result in a timekeeper-mode match, because that would let a losing athlete force a drop-out to take control.

### B.9 Timekeeper recording is required (D12)

D12: the timekeeper must record the match on video. Athletes stay optional (D8 unchanged).

- **Consent**: handled at Accept (B.2). A timekeeper without AI processing consent cannot accept.
- **Face-off**: the record row is locked on (TK-K9); Start waits for the timekeeper's camera and recording intent (TK-K10; HINT `timekeeper_not_recording`).
- **Server**: in timekeeper mode, `set_match_recording_intent` refuses to turn the timekeeper's intent off (`timekeeper_must_record`); `start_match` refuses without it (`timekeeper_not_recording`). Limits, stated plainly: the server can verify only the intent before the start and, later, whether an upload arrived. It cannot verify that the camera is actually rolling.
- **Live**: the timekeeper has no stop-recording control (the shipped flow has none for anyone; the REC tally stays). If the camera fails mid-match, the timekeeper's phone shows the banner `CAMERA STOPPED · KEEP RUNNING THE CLOCK` (TK-L3) with `Restart camera` (TK-L4); the match continues, a restarted recording becomes a second clip, the gap is noted on the match (`timekeeper_recording_gaps`, server-side from the client report) and the athletes' optional angles still count. A camera that never restarts does not stop the match.
- **After**: the timekeeper's upload is required. The timekeeper's done screen (TK-R3) adds the shipped upload line and `Keep ELO RATED open until your film uploads.` (shipped M-UPLOAD string, Oct 4 copy deck). If no usable timekeeper angle has landed when the existing 24 h footage settle window (`_match_footage_settle_window()`, measured from `completed_at`) closes, or the upload failed terminally, the match is flagged for admin review in a server-only `match_timekeeper_footage_flags` (same spirit as the admin-only no-jiu-jitsu flag): signal only; the result, rating and dispute window stand, and athletes see nothing. Nudges: a push to the timekeeper 2 h after the end if their upload has not landed, `Upload your match film` / `{A} vs {B} needs your film. Open ELO RATED to finish the upload.` (TK-N8), and the in-app line `Your film hasn't uploaded yet.` with `Upload now` (TK-U1, TK-U2) on their match page. At most one push. Owner question Q14.

### B.7 Notifications per role

| Id | To | When | Title / body |
|---|---|---|---|
| TK-N1 | Asked person | Asked to timekeep (`timekeeper_requested`) | `Timekeep {A} vs {B}?` / `{athlete} asked you to start the match, run the clock and record the result.` |
| TK-N2 | Both athletes | Timekeeper accepted (`timekeeper_accepted`; only if the app is in the background) | `Timekeeper joined` / `{name} will run your match.` |
| TK-N3 | Both athletes | Timekeeper declined or the request lapsed (`timekeeper_declined`; background only) | `Pick another timekeeper` / `{name} can't timekeep your match.` |
| TK-N4 | Both athletes | 10 minutes without a timekeeper before the start (`timekeeper_expired`) | `Match cancelled` / `No timekeeper joined in time. Challenge again when you're ready.` |
| shipped | Both athletes | Start | `Match Started` / `Your match has begun!` (`push/index.ts:444-445`; not sent to the timekeeper) |
| TK-N5 | Both athletes | Timekeeper dropped out | `Your timekeeper left` / `Your match is paused. Pick a new timekeeper within 10 minutes.` |
| TK-N6 | Both athletes and the dropped timekeeper | Cancelled after a drop-out | `Match cancelled` / `No timekeeper took over in time. The match won't count.` |
| TK-N7 | Both athletes | Result recorded by the timekeeper (background only) | `Confirm your result` / `{name} recorded {A} vs {B}. Confirm or dispute it.` |
| TK-N8 | Timekeeper | Upload not landed 2 h after the end (once, D12) | `Upload your match film` / `{A} vs {B} needs your film. Open ELO RATED to finish the upload.` |

### B.8 Edge cases

- **Timekeeper is in another match**: a new helper `_timekeeper_busy(p_athlete)` (timekeeper-mode matches only; `_athlete_busy` is NOT changed, review M5) keeps them out of the candidates and refuses requests and the code join; the row shows TK-P8 or TK-P9. In the other direction, `start_match_from_challenge` and `_start_invite_booking` refuse with `timekeeper_busy` when either athlete is the seated timekeeper of an active timekeeper-mode match; that refusal can only trigger when such a match exists, so flag-OFF behaviour is identical.
- **Asked person is offline**: the push is the only channel; the request lapses after 2 minutes (TK-P22).
- **Athlete leaves**: before the start, `Leave` cancels the match for everyone as today; the timekeeper exits with `Match cancelled` and `{name} left the match.` (TK-E1). After the start, athletes have no leave in either mode (unchanged).
- **Athlete app killed mid-match**: unchanged; the timekeeper runs the match and records the result; the athlete confirms later or the 24 h cron confirms.
- **Flag flipped mid-match**: no effect; the match keeps its `requires_timekeeper`. Flag flipped while an athlete is on the challenge sheet: the server's snapshot wins, and the wizard routes on `requires_timekeeper` from `get_match_details`.
- **Invite bookings** (`_start_invite_booking`): snapshot the same way; the picker appears after the start of the booking just as after an Arena accept.
- **Practice match**: client-only, never timekeeper mode.
- **Timekeeper video**: REQUIRED in timekeeper mode (D12, section B.9), via the existing record-only media rights.
- **A timekeeper's queued result**: a timekeeper's own offline-queued result stays valid while they hold the seat (offline does not unseat them, B.6).
- **Code join mid-match (review m8)**: the code closes when the match leaves `pending` (`close_match_timekeeper_code`), so the code/QR fallback only works before the start; mid-match replacements go through the picker.

## C. Optional changes to the flag-OFF flow (D11)

**C1 (OPTIONAL): merge the opponent weight check into the ready step.** The same merge as B.3, for the two-athlete flow: weigh-in confirms my own weight only; the ready screen shows `{OPP} WEIGHED IN AT {w} LBS` with `Weight looks right, I'm ready` and `Doesn't look right`. Rationale: one screen fewer at the moment athletes most want to start, and one design for both modes. Risk to the alpha: high relative to the gain. It changes the shipped face-off order that the match-loop harness (`tools/match-loop`) drives, it touches `use-faceoff.ts` start logic that is race-sensitive (dual auto-start), and the ready is still a broadcast in flag-OFF mode, so "ready implies checked" would remain client-enforced. Recommendation: do not ship before the alpha; reconsider after the alpha once server-side ready (B ask BE-3) exists, and only if alpha feedback says the face-off is too long.

No other flag-OFF change is recommended. In particular the dual auto-start, the result claim and the self-recorded result stay as they are.

## R. Rules set (who can do what)

Every refusal is a server rule; the client only mirrors it. Timekeeper-mode rules apply only when `matches.requires_timekeeper = true`.

| Action | Flag OFF (today) | Timekeeper mode | Server rule and refusal HINT (timekeeper mode) |
|---|---|---|---|
| Pick or replace a timekeeper | n/a | Either athlete, while no timekeeper has accepted, or after a drop-out | `request_match_timekeeper`: caller is a competitor; status `pending`, or `in_progress` with `timekeeper_id` null; target is in `get_timekeeper_candidates` (not a competitor `timekeeper_is_competitor`, not blocked `timekeeper_unavailable`, not busy per the new `_timekeeper_busy` `timekeeper_busy`); one pending request per match (`cancel_timekeeper_request` withdraws it). Business outcomes return `{ok:false, code}` |
| Accept timekeeping | n/a | Only the asked person, within 2 minutes; or the in-person code/QR fallback | `respond_timekeeper_request(accept)`: caller is the request's `invitee_id` (`not_requested`), request pending and before `expires_at` (`request_closed`), not busy (`timekeeper_busy`); success runs `_set_match_timekeeper` (the same core as `join_match_as_timekeeper`: set `timekeeper_id`, consume any code, write the `timekeeper` recording intent) and clears the deadline |
| Weigh-in (own weight) | Each athlete | Each athlete | Unchanged (challenge weights; `reweigh_for_match`) |
| Opponent weight check | Each athlete checks the other | Unchanged, merged into ready | `check_opponent_weight` unchanged |
| Timekeeper weight check | n/a | Timekeeper checks each athlete | New `check_athlete_weight_as_timekeeper(p_match_id, p_subject_id, p_verdict, p_weight)` writing the sibling table `match_timekeeper_weight_checks` (PK `(match_id, subject_id)`); caller is `timekeeper_id` (`not_timekeeper`); subject is a competitor; status `pending`. `match_weight_checks` and `check_opponent_weight` are untouched (review M4) |
| Ready | Both, broadcast only | Both, server side | `mark_match_ready`: refuses `not_timekeeper_mode` on a flag-OFF match; caller is a competitor; own weight in; own opponent check confirmed (`weight_check_pending`; in timekeeper mode the athlete opponent check is mandatory regardless of `opponent_weight_check_required`, review m3); reset by any re-weigh or flag |
| Start | Both phones auto-call `start_match` | Timekeeper only, button | `start_match`: caller is `timekeeper_id` (`not_timekeeper`, `timekeeper_required` if none); both ready (`athletes_not_ready`); both timekeeper confirmations, no open flag (`WEIGHT_*` HINTs as today); the timekeeper's recording intent is on (`timekeeper_not_recording`, D12; the camera-ready part is client-side only) |
| Pause / resume | Either athlete | Timekeeper only | `can_control_match`: timekeeper only (`not_timekeeper`) |
| End | Either athlete, broadcast (legacy `end_match` RPC exists, unused) | Timekeeper only, `end_match_clock`; server auto-end at full time | `end_match_clock`: refuses `not_timekeeper_mode` on flag-OFF; caller is `timekeeper_id`; `in_progress` (`match_not_live`). Legacy `end_match` refuses timekeeper-mode matches (`use_end_match_clock`) |
| Record result | Either athlete, claim-first; recorder auto-confirmed | Timekeeper only; nobody auto-confirmed | `record_match_result`: caller is `timekeeper_id` (`not_timekeeper`); `in_progress`; no confirmation row written |
| Confirm / dispute | Each athlete; 24 h lock | Same, both athletes (recorder no longer auto-confirmed) | Unchanged; the timekeeper can never confirm or dispute (`not_participant`) |
| Cancel / leave before start | Either athlete (`cancel_session_match`); a code-joined record-only timekeeper can Leave, which removes only them (`leave_match_as_timekeeper`) | Either athlete cancels for all; the timekeeper's Leave only removes them | `leave_match_as_timekeeper` (pending: drop-out rule) |
| Remove a seated timekeeper | Either athlete, pending (`remove_match_timekeeper`) | Refused for one athlete alone; the other athlete is pushed | `remove_match_timekeeper` in timekeeper mode: refuses `requires_both_athletes` unless the timekeeper has given no weight verdict yet, in which case it is allowed and pushes the other athlete (review B2). Flag-OFF unchanged (pgTAP 108) |
| Get a timekeeper code | Either athlete, pending | Either athlete, pending | `get_match_timekeeper_code` unchanged in behaviour; the code is the in-person fallback |
| Join by code | Anyone not a competitor, pending | Same rules as an accepted request | `join_match_as_timekeeper` in timekeeper mode: runs through `_set_match_timekeeper` with `_timekeeper_busy` (`timekeeper_busy`), the deadline check, the opponent-approval rule (Q12) and a push to both athletes; refused `match_started` after `pending` (review B2, m8) |
| Leave after start | Not offered | Athletes: not offered. Timekeeper: Leave until `ended_at` triggers the drop-out rule; no Leave after `ended_at` | `leave_match_as_timekeeper` extended to `in_progress` without `ended_at`, timekeeper mode only (`result_owed` after the end) |
| Record video | Each athlete, and a code-joined record-only timekeeper (record-only media rights), all optional | Athletes optional (D8); the timekeeper REQUIRED (D12) | `set_match_recording_intent` refuses turning the timekeeper's intent off (`timekeeper_must_record`); missing timekeeper footage after the 24 h settle window flags the match for admin review (signal only); `can_upload_match_video` unchanged; a dropped timekeeper keeps read access to their own footage via `match_timekeeper_history` |

- **10-minute rule**: `timekeeper_deadline_at` is set when the match is created in timekeeper mode, and again at each drop-out. It is cleared when a timekeeper accepts. Every timekeeper RPC checks it lazily, but a lazy check never cancels then raises (the cancel would roll back): it returns `{ok:false, code:'match_cancelled'}` after committing, or leaves the cancel to the cron (review m4). A per-minute pg_cron sweep cancels any timekeeper-mode match past its deadline with no seated timekeeper (before the end), with TK-N4 or TK-N6; after `ended_at` it flags for admin review instead (B.6).
- **Lock order (review m5)**: every new writer (the sweeps, `end_match_clock`, `mark_match_ready`, the request RPCs, the timekeeper weight check) locks `matches` FOR UPDATE first and the request or check row second, re-checks `status` and `requires_timekeeper` under the lock, and never takes the `rating_v9` advisory lock after a match row lock (`record_match_result` takes the rating lock first, then the match row). A cancel racing a record is then safe: whichever commits first wins.
- **Offline and stall rule**: B.6 (heartbeat gap starts the 10-minute wait; only explicit Leave is immediate).
- **Snapshot rule**: `requires_timekeeper` is written once at creation, true only when `feature_flags.timekeeper_role` is on AND both athletes' clients advertised `p_client_supports_timekeeper` (B.0), and is guarded against client writes (`guard_match_columns`).
- **Drop-out rule**: B.6.

## D. Backend and mobile asks

Keyed on `requires_timekeeper`; with it false every function takes today's path byte for byte, and pgTAP 061, 108 and 111 keep passing untouched.

| Id | Ask | Hook point (BRIEF section 4) |
|---|---|---|
| BE-1 | `matches.requires_timekeeper` (default false), `timekeeper_deadline_at`, `ended_at`; snapshot in `start_match_from_challenge` and `_start_invite_booking` with `p_client_supports_timekeeper boolean DEFAULT false` and the both-clients rule (B.0); guard in `guard_match_columns`; `timekeeper_busy` refusal at creation when an athlete is a seated timekeeper-mode timekeeper | 0 |
| BE-2 | Internal `_set_match_timekeeper` core factored out of `join_match_as_timekeeper`; `match_timekeeper_requests` (id, match_id, requested_by, approved_by, invitee_id, status pending/accepted/declined/expired/cancelled, expires_at, `channel` `in_app` now and `invite` in phase 2, nullable `invite_id`), one pending request per match, realtime scoped to the parties; RPCs `request_match_timekeeper`, `approve_timekeeper_request` (Q12), `respond_timekeeper_request(accept)`, `cancel_timekeeper_request`; `get_timekeeper_candidates(p_match_id)` (excludes invitees who declined this match); new `_timekeeper_busy` (timekeeper-mode matches only; `_athlete_busy` untouched); timekeeper-mode branches in `join_match_as_timekeeper` and `remove_match_timekeeper` (section R) | 1 |
| BE-3 | Server-side ready: `mark_match_ready(match_id, p_confirm_opponent_weight)`, refusing `not_timekeeper_mode` on flag-OFF; athlete opponent check mandatory in timekeeper mode; ready reset on re-weigh and flag; timekeeper-mode `reweigh_for_match` voids every check whose subject is the caller, including the timekeeper's | 2 |
| BE-4 | `start_match` timekeeper branch and HINTs, including `timekeeper_not_recording` (D12) | 3 |
| BE-12 | D12: timekeeper recording intent written at accept and locked on in timekeeper mode (`set_match_recording_intent`, `timekeeper_must_record`); `match_timekeeper_footage_flags` (server-only, admin read `admin_list_missing_timekeeper_footage`) set when no usable timekeeper angle exists at the 24 h settle window; `timekeeper_recording_gaps` from the client's camera-failure report; TK-N8 nudge 2 h after the end | 4, 5 |
| BE-5 | `can_control_match` timekeeper branch; NEW `end_match_clock(p_match_id, p_final_elapsed_s)` (timekeeper mode only, stamps `ended_at`, leaves status); legacy `end_match` refuses timekeeper-mode matches (`use_end_match_clock`), flag-OFF untouched (061/066 unchanged) | 4 |
| BE-6 | `record_match_result` timekeeper branch, no confirmation insert; `auto_finalize_match` unchanged (counts competitors) | 5 |
| BE-7 | Timekeeper weight checks in the sibling table `match_timekeeper_weight_checks` (PK `(match_id, subject_id)`) written by `check_athlete_weight_as_timekeeper`; its own SELECT policy; read by the `start_match` timekeeper branch only. No change to `match_weight_checks` or `check_opponent_weight` | 6 |
| BE-8 | Sweeps and presence: `match_timekeeper_presence` heartbeat table and `touch_match_timekeeper`; per-minute sweep for the 10-minute deadline, offline-to-drop-out after 10 minutes, server auto-end at full time, start and result stall windows; server-only `in_progress` to `cancelled` path (video `cancelled` branches already exist), admin-review flag after `ended_at`; `match_timekeeper_history` for media access; lock order per section R | 7 |
| BE-9 | Pushes: `social_notifications` kinds `timekeeper_requested`, `timekeeper_accepted`, `timekeeper_declined`, `timekeeper_expired` in category `matches` (TK-N1 to TK-N4), plus the drop-out and result pushes TK-N5 to TK-N7; deep links to non-tab-root routes | 7 |
| BE-10 | `get_match_details` already admits the timekeeper (`20261008100100_playback_read_contract.sql:270-275`); add `requires_timekeeper`, the caller's role, the timekeeper's name, presence (online or offline) and the deadlines to the payload | 8 |
| BE-11 | pgTAP for every row of the rules table; a flag-OFF regression file; legacy `end_match` refusing timekeeper-mode matches; a stalling timekeeper; a cancelled timekeeper-mode match leaving no rating rows and no highlight dispatch; the capability snapshot rule | all |
| BE-P2 | Phase 2 off-platform timekeeper invite (section P) | later |

| Id | Ask | FE file |
|---|---|---|
| FE-1 | `use-timekeeper-enabled` flag hook (copy `lib/invites/use-invites-enabled.ts`: fail-closed, `known`, refetch on foreground) for the Arena copy only; the wizard reads `requires_timekeeper` | new `lib/match-flow/use-timekeeper-enabled.ts` |
| FE-2 | Step `crew` and role routing in `step-router.ts` (only when `requires_timekeeper` is true; missing = false); the wizard's own refusal of non-participants is the only blocker for the timekeeper (`match-flow-wizard.tsx:107-110, 247-253`); pass `p_client_supports_timekeeper` on every challenge create, accept and start | `lib/match-flow/step-router.ts`, `components/match-flow/match-flow-wizard.tsx` |
| FE-3 | Picker screen and request card, asked-person sheet on a non-tab-root route, push handler, deadline chip on `lib/arena/fresh-countdown.ts` | new `components/match-flow/crew/*`, new `app/(app)/match/[matchId]/timekeep.tsx`, `lib/notifications/handlers.ts` |
| FE-4 | Athlete ready merge and timekeeper row; no auto-start in timekeeper mode | `faceoff/faceoff-body.tsx`, `lib/match-flow/use-faceoff.ts` |
| FE-5 | Timekeeper face-off screen with the Start button; record row locked on (TK-K9); Start gated on camera ready and intent (TK-K10 to TK-K12); consent at Accept (TK-T7, TK-T8) via the shipped AI consent sheet | new `faceoff/faceoff-timekeeper.tsx` |
| FE-6 | Live: controls only for the timekeeper; athletes read-only with the strip; end via server; timekeeper camera-failure banner and restart (TK-L3, TK-L4), gap report; upload nudge line (TK-U1, TK-U2) | `steps/live-step.tsx`, `lib/match-flow/use-live-controls.ts`, `live/state-strip.tsx` |
| FE-7 | Result: timekeeper form without claim; athletes waiting without take-over; timekeeper done screen; the confirm header `RESULT RECORDED BY {NAME}` (TK-R5) in timekeeper mode comes from the timekeeper's name and is NOT gated on `opponentConfirmed` (`confirm-step.tsx:174` code change) | `steps/result-step.tsx`, `steps/result-waiting.tsx`, `lib/match-flow/use-record-result.ts` |
| FE-8 | Drop-out plate, offline banner (TK-D7), admin-review state (TK-D8), re-pick sheet with opponent approval (Q12), deadline chip, heartbeat | `steps/live-step.tsx`, new `crew/deadline-chip.tsx` |
| FE-9 | Arena copy: TK-AR1 under the stakes strip and in place of the no-stakes fallback; TK-AR2 under the mat-board waiting strip | `components/arena/challenge-prompt-sheet.tsx` (:465-484), `components/arena/mat-board.tsx` (:382) |
| FE-10 | Match-loop harness: a three-simulator timekeeper scenario plus the flag-OFF scenario unchanged | `tools/match-loop` |
| FE-P2 | Phase 2 invite row and claim flow (section P) | later |

## P. Phase 2: off-platform timekeeper (not in the first build)

How it would work: on the picker, `Invite someone not on ELO RATED` calls `create_timekeeper_invite(p_match_id)`, which writes a 016 `invites` row with the new `kind = 'timekeeper'` and `match_id`, and a `link_expires_at` equal to the match deadline (not the usual 7 days), with the same code throttles; it opens the share sheet with the link. `expire_stale_invites` and the invite landing copy are extended for the new kind. The match's request row is created with `channel = 'invite'` and points at the invite, so the athletes' pending card works as for an in-app request (`Waiting for them to join.`).

The invite landing is a public page: it shows the athletes' names and the deadline (`Link expires in {m:ss}`, TK-X5) only, never their weights (and no ELO unless 016 landings already expose it publicly). What the invitee must do before they can run the match: install the app, create an account and sign in, pass the age and terms gates, and claim the invite (a separate `claim_timekeeper_invite` modelled on `claim_challenge_invite`: signup, date of birth, `invite_attributions` with first-write-wins). They do not need a weight, a rating or to go live. The claim turns the request into a normal in-app request to that new user, who then sees the same Accept screen, and acceptance ends in the shared `_set_match_timekeeper` core. Owner to decide whether a timekeeper claim creates a friendship and whether the weekly invite caps apply (Q11). Attribution and the `invite_joined` push work as in 016.

What it adds to the wait: sign-up realistically takes 3 to 6 minutes, which eats most of the 10-minute deadline. Recommendation: a claimed timekeeper invite extends the deadline once by 10 minutes (shown on the athletes' chip), and an unclaimed invite does not. This is owner question Q8. The 2-minute request lapse does not apply to invite requests; they lapse with the deadline.

Rework avoided now: the request table has `channel` and a nullable `invite_id` from phase 1, the picker reserves the row, and the deadline is a column that can be extended.

## E. Alpha go/no-go (2026-10-17)

Criteria to turn the flag ON for the alpha (all must hold):

1. Every row of the rules table is enforced server-side and covered by pgTAP, and the full jr_be suite is green with 061, 108 and 111 unchanged.
2. A flag-OFF regression: the match-loop harness two-device scenario passes unchanged on a build with all timekeeper code merged.
3. A three-device run on TestFlight or OTA of the whole flow, including a decline, a lapse, a pre-start drop-out, a mid-match drop-out with replacement, a 10-minute cancel and a timekeeper weight flag.
4. The migrations applied to prod by hand with a clean dry run, and a flip-on and flip-back of `timekeeper_role` rehearsed on staging with a match in flight (jr_be-wmq covers only flipping the flag off and landing `20261015200000`; the rehearsal is part of BE-11 testing, not a new bead).
5. Independent review of the backend and mobile diffs closed with no open findings.
6. Client capability gate (review M1): the both-clients snapshot rule (B.0) is in, so an older build never receives a timekeeper-mode match.
7. pgTAP proves the legacy `end_match` refuses timekeeper-mode matches (review B1) and covers a stalling timekeeper (review M2).

Sizing (honest, revised after review m10): backend BE-1 to BE-12 is about 6 to 8 engineer days (D12 adds about 1) including pgTAP (five core RPCs branch, the legacy `end_match` guard, the code-join and remove branches, four new tables, sweeps for deadline, offline, auto-end and stalls, the capability snapshot, pushes). Mobile FE-1 to FE-10 is about 4.5 to 5.5 days (D12 adds about half a day). Review and three-device testing add 1 to 2 days. The total is roughly 11 to 15 days against 2.

Recommendation: **ship dark.** The alpha runs flag OFF, which this proposal guarantees is untouched. Build timekeeper mode behind the flag after owner approval, then enable it for an internal three-person test, then for alpha users.

## F. Open questions for the owner (with recommended answers)

1. **Q1, timekeeper weight flag (coordinator assumption).** Does a timekeeper "Doesn't look right" block the start until the athlete re-weighs and the timekeeper confirms again? Recommended: yes, same as the athlete flag.
2. **Q2, merged step.** Merge the opponent weight check into ready for timekeeper mode (B.3)? Recommended: yes. For flag OFF (C1): not before the alpha.
3. **Q3, drop-out mid-match.** On an explicit Leave during the clock: pause, wait 10 minutes for a replacement, then cancel with no rating (B.6)? Recommended: yes. Alternative rejected: hand the clock back to the athletes (lets a losing athlete force a drop-out).
3b. **Q3b, offline timekeeper.** A heartbeat gap marks them offline and starts the 10-minute wait without unseating them or pausing the clock; they become a drop-out only when the wait expires. Recommended: yes.
3c. **Q3c, stalls and after the end.** A seated timekeeper who does not start within 10 minutes of both athletes being ready, or does not record within 10 minutes of the end, is treated as offline; after the end the match goes to admin review instead of being cancelled, and there is no Leave after the end. Recommended: yes.
4. **Q4, code/QR as the in-person fallback.** The backend keeps it and, in timekeeper mode, it ends in `_set_match_timekeeper` with the same busy rules. Recommended: keep it on the backend, and add a small `Use a code instead` link (TK-P24) on the picker only after the friends and nearby picker has shipped; not drawn as phase 1 UI.
5. **Q5, who can pick.** Either athlete asks, either can `Ask someone else`; see Q12 for the other athlete's approval. Recommended: yes.
6. **Q6, video of a cancelled match.** Keep uploads attached to the cancelled match, visible to the athletes and to the timekeeper who filmed them, with no highlight? Recommended: keep, no highlight (the video pipeline already has `cancelled` branches).
7. **Q7, request lapse.** 2 minutes per request inside the 10-minute deadline. Recommended: yes.
8. **Q8, phase 2 deadline.** A claimed off-platform invite extends the deadline once by 10 minutes. Recommended: yes.
9. **Q9, timekeeper rating or credit.** None in phase 1 (pseudo referee, D2). A "matches timekept" count on the profile could come later.
10. **Q10, alpha.** Ship dark (section E). Recommended: yes.
12. **Q12, collusion and opponent approval (review M7).** Should the other athlete approve a picked timekeeper? Recommended: yes. The non-picking athlete approves with one tap (`{athlete} picked {name}. OK with you?`, TK-P25, `Approve` TK-P26 / `Not this one` TK-P27) inside the same 10-minute window, before the request is sent; the same applies to mid-match replacements and code joins. Record `requested_by` and `approved_by`. Add an admin signal for repeat athlete and timekeeper pairs, drop-outs after the end and disputed results per timekeeper.
11. **Q11, phase 2 invite side effects.** Does claiming a timekeeper invite create a friendship, and do the weekly invite caps apply? (The public landing shows names and the deadline only, never weights.) Recommended: create the friendship (it makes the next pick a Friends row), and do not count timekeeper invites against the challenge invite cap.
13. **Q13, Arena copy and older builds.** TK-AR1 and TK-AR2 can promise a timekeeper when the other athlete's build lacks support, and the match then runs the two-athlete flow. Acceptable? Recommended: keep the copy; it is a soft promise, the picker never appears and nothing breaks. Alternative: show TK-AR2 only once the challenge row records both sides' capability (possible on the challenger's strip after accept, not on the opponent's sheet before accept).
14. **Q14, missing timekeeper footage (D12).** If the timekeeper's upload never arrives or fails, the result and rating stand and the match is flagged for admin review (signal only, like the no-jiu-jitsu flag), measured at the existing 24 h footage settle window, with one push nudge to the timekeeper 2 h after the end. Recommended: yes. Alternative rejected: holding the result until the film lands (a lost phone would block a real result).

## G. Acceptance criteria (testable)

1. With `timekeeper_role` off, a new match has `requires_timekeeper = false` and every face-off, live, result and confirm screen and RPC behaves exactly as on `origin/development` today (harness scenario unchanged, pgTAP 061, 108, 111 unchanged).
2. With the flag on, a new match has `requires_timekeeper = true`; turning the flag off afterwards does not change that match's flow, and the reverse holds.
3. In timekeeper mode, `start_match`, `pause_match`, `resume_match`, `end_match_clock` and `record_match_result` refuse any caller other than `timekeeper_id` with the HINTs in section R; the legacy `end_match` refuses every caller with `use_end_match_clock`; flag-OFF `end_match` behaves as today (061, 066).
4. `start_match` in timekeeper mode refuses until both athletes are ready server-side and the timekeeper has confirmed both weights with no open flag.
5. A re-weigh or a flag clears the affected ready state server-side; in timekeeper mode a re-weigh also voids the timekeeper's confirmation of that athlete.
6. A request to a competitor, a busy user or a blocked user is refused with its HINT; only one open request exists per match; a request lapses after 2 minutes.
7. A timekeeper-mode match with no accepted timekeeper 10 minutes after creation (or after a drop-out) is cancelled by the cron, with no rating change, and both athletes receive TK-N4 or TK-N6.
8. A timekeeper whose heartbeat is older than 60 s is shown offline and keeps the seat and the clock; after 10 more minutes without a heartbeat they are dropped (clock paused then, never backdated). After `ended_at` no Leave is accepted, and a missing result after 10 minutes flags the match for admin review rather than cancelling it.
13. A match snapshots `requires_timekeeper = true` only when the flag is on and both athletes' clients passed `p_client_supports_timekeeper = true`.
14. The server auto-ends the clock at full time if the timekeeper has not.
16. In timekeeper mode, the timekeeper cannot accept without AI processing consent, cannot turn their recording intent off, and `start_match` refuses with `timekeeper_not_recording` without it; the timekeeper sees no record switch.
17. A timekeeper-mode match with no usable timekeeper angle at the 24 h settle window is flagged for admin review; the result, rating and athletes' view are unchanged.
15. In timekeeper mode, one athlete alone cannot remove a timekeeper who has given a weight verdict, and the code join obeys the busy, deadline and approval rules; flag-OFF code join and removal are unchanged (pgTAP 108).
9. `record_match_result` by the timekeeper writes no confirmation row; the match finalises only when both athletes confirm or the 24 h cron runs.
10. The timekeeper can read `get_match_details` for their match and can never confirm or dispute.
11. Athletes in timekeeper mode see no pause, end or result-entry control, and keep recording video.
12. Every string on the boards is in `COPY-DECK.md`; no string contains an em dash or an exclamation mark (new strings).

## Review round 1 fixes (2026-10-15)

Source: `REVIEW-SPEC.md` (2 BLOCKER, 9 MAJOR, 10 MINOR), with the coordinator's decisions.

| Finding | What changed |
|---|---|
| B1 | The new action is `end_match_clock` (timekeeper mode only, refuses `not_timekeeper_mode` on flag-OFF). The legacy `end_match` refuses timekeeper-mode matches with `use_end_match_clock`; flag-OFF untouched (061/066). A.4 now notes the legacy RPC. B.4, R, BE-5, G3, E7. The flag-OFF `end_match` hole is filed separately by the coordinator. |
| B2 | Section R has rows for `remove_match_timekeeper`, `get_match_timekeeper_code` and `join_match_as_timekeeper` in timekeeper mode (request/accept rules, busy, deadline, approval, opponent push; one-athlete removal refused after a weight verdict). BE-2, G15. |
| M1 | `p_client_supports_timekeeper boolean DEFAULT false` on match creation; `requires_timekeeper = true` only when the flag is on and both athletes' clients support it (B.0). BE-1, FE-2, E6, G13. |
| M2 | Server auto-ends the clock at full time; a 10-minute result deadline after `ended_at` and a 10-minute start window are treated as stalls (B.4, B.6). BE-8, E7, G14. |
| M3 | Timekeeper-mode re-weigh voids every check whose subject is the caller, including the timekeeper's, and clears both athletes' ready (B.3). BE-3, G5. |
| M4 | Sibling table `match_timekeeper_weight_checks` and new RPC `check_athlete_weight_as_timekeeper`; no PK change, `check_opponent_weight` untouched. R, BE-7. |
| M5 | New `_timekeeper_busy` (timekeeper-mode matches only); `_athlete_busy` untouched; creation refuses `timekeeper_busy` for a seated timekeeper-mode timekeeper (B.8). BE-1, BE-2. |
| M6 | Only an explicit Leave is an immediate drop-out; a heartbeat gap marks the timekeeper offline (TK-D7) and starts the 10-minute wait; no backdated pause (B.6). Q3b, G8. |
| M7 | Owner question Q12: the other athlete approves the pick with one tap inside the same 10-minute window (TK-P25 to TK-P27), plus admin signals. BE-2 gains `approved_by` and `approve_timekeeper_request`. |
| M8 | No Leave after `ended_at`; a stalled timekeeper after the end sends the match to admin review (TK-D8), never a silent cancel (B.6). Q3c, G8. |
| M9 | Heartbeat moved to the server-only `match_timekeeper_presence` table (B.6, BE-8); `timekeeper_seen_at` removed from `matches`. |
| m1 | Citations fixed: wizard mount `match/[matchId].tsx:22, 91`; `startMatchFromChallenge` :1887 and :2095; `use-faceoff.ts:280-282`; `Draw` at `result-step.tsx:126`; Leave alert per string :369, :370, :371; `WEIGHED IN AT` literal :79. |
| m2 | BE-10 rewritten: `get_match_details` already admits the timekeeper; only payload fields are added; FE-2 owns the wizard refusal. |
| m3 | `mark_match_ready` refuses `not_timekeeper_mode` on flag-OFF; the athlete opponent check is mandatory in timekeeper mode (R). |
| m4 | Lazy deadline checks never cancel then raise (R). |
| m5 | Lock order stated (R). |
| m6 | Server-only `in_progress` to `cancelled` path, side effects listed, pgTAP added (B.6, BE-8, BE-11, Q6). |
| m7 | `match_timekeeper_history` keeps a dropped timekeeper's access to their own footage (B.6, R). |
| m8 | Code join works only before the start; stated in B.8 and R. |
| m9 | Go criterion 4 reworded; nothing new filed. |
| m10 | Sizing revised to 10 to 14 days (E). |

## Review round 2 fixes (boards review, `REVIEW-BOARDS.md`)

| Finding | What changed |
|---|---|
| M4 | Phase 2 landing is public: names and deadline only, never weights (section P, Q11). New TK-X5 `Link expires in {m:ss}` for the landing countdown. |
| M5 | A.1 now names the mat-board strip `Waiting · {name}` (`mat-board.tsx:382`) as the challenger's view and the no-stakes fallback (`challenge-prompt-sheet.tsx:476-484`); `WaitingPlate` is practice-only. B.1 and FE-9 place TK-AR1 under the stakes strip and in place of the fallback, TK-AR2 under the mat-board strip. New Q13. |
| m2 | FE-7 notes the `confirm-step.tsx:174` code change for TK-R5. |
| m6 | New TK-P28 `Waiting for {athlete} to approve.` for the picker under Q12 (B.2). |
| m7 | Section R flag-OFF column: a code-joined record-only timekeeper can Leave and record video today. |
| m8 | `get_timekeeper_candidates` excludes invitees who declined this match (B.2, BE-2). |
| m9 | The older-build queued result edge case is dropped from B.8. |
| m10 | Shipped C1 strings added to the copy deck. |
| m12 | BOARDS.md records Designer A's on-disk ids. |
| M1 to M3, m1, m3 to m5, m11 | Board-only fixes for the designers (sample data, roster, styling, clocks, dates, stakes); no spec change. |

## Round 3: D12 (timekeeper must record)

| Item | What changed |
|---|---|
| Decision | D12 added to BRIEF.md: the timekeeper must record; athletes stay optional (D8). |
| Consent | AI processing consent is taken at Accept (B.2, TK-T7, TK-T8); refusing it means they cannot timekeep. |
| Face-off | Record row locked on (TK-K9); Start also gated on the timekeeper's camera ready and server-side intent (TK-K10; permission denied TK-K11, TK-K12). |
| Server | `set_match_recording_intent` refuses turning the timekeeper's intent off (`timekeeper_must_record`); `start_match` refuses `timekeeper_not_recording`. The server verifies intent and uploads only, never that the camera rolls. Section R Start and Record video rows. BE-4, new BE-12. |
| Live | No stop control; camera failure banner and restart (TK-L3, TK-L4), the match continues, the gap is noted, athletes' angles count (B.9). FE-6. |
| After | Upload required; missing at the 24 h settle window flags admin review (signal only); one push nudge TK-N8 and in-app TK-U1, TK-U2. Q14. |
| Criteria and sizing | G16, G17; sizing 11 to 15 days. |

