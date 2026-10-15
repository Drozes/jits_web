# Timekeeper mode: copy deck (PROPOSED, FOR OWNER REVIEW, 2026-10-15)

Every string on the `P-TK-*` boards. Shipped strings cite `apps/mobile/` file:line (jits_web `origin/development`) or jr_be `supabase/` file:line. NEW strings carry a `TK-*` id. Source strings are sentence case; caps come from the style (Mono, button). No em dashes, no exclamation marks in new copy, no emoji. `{A}` and `{B}` are the athletes' short names (`M. Reyes`, `D. Okafor`), `{name}` the timekeeper's (`J. Cruz`), `{athlete}` the athlete who acted, `{OPP}` an uppercased short name.

## Current flow (Designer A, boards A1 to A5)

| Board | String | Source |
|---|---|---|
| A1 | `INCOMING CHALLENGE` | `components/arena/challenge-prompt-sheet.tsx:543` |
| A1 | `{name} is live in the Arena` | `challenge-prompt-sheet.tsx:603` |
| A1 | `YOUR STAKES · {elo}` | `challenge-prompt-sheet.tsx:465` |
| A1 | `Accept and you both drop straight into the match.` (no-stakes fallback only) | `challenge-prompt-sheet.tsx:476-484` |
| A1 | `{m:ss} LEFT` (answer countdown) | `challenge-prompt-sheet.tsx:162` |
| A1 | `Decline` / `Accept` / `Accepted` / `Later` | `challenge-prompt-sheet.tsx:659, 698, 730` |
| A1 | Challenger's mat-board strip `Waiting · {name}` (a11y `Waiting for {name}`) / `Cancel` (a11y `Cancel challenge`) | `components/arena/mat-board.tsx:382` and following |
| A1 | Push `New Challenge` / `{name} wants to roll` | jr_be `functions/push/challenge-payload.ts:92-93` |
| A2 | `Leave` (a11y `Cancel match`) | `components/match-flow/faceoff/faceoff-top.tsx:99, 78` |
| A2 | `FACE-OFF · WEIGH IN` / `FACE-OFF · READY` | `faceoff-top.tsx:107` |
| A2 | `ELO {n}` / `UNRATED`; `VS`; `{w} LBS` / `-- LBS` | `faceoff-top.tsx:136, 142, 33` |
| A2 | `Updates your profile weight for future matches. This match keeps its weigh-in.`; `Save` / `Saving`; `Cancel`; `Profile weight saved: {w} lbs, for future matches.` | `faceoff-top.tsx:266, 250, 261, 202-207` |
| A2 | `{d} LBS APART · SAME DIVISION` / `{n} DIVISIONS APART` | `faceoff/faceoff-body.tsx:43-44` |
| A2 | `The heavier athlete's rating is adjusted for the weight gap.` | `faceoff-body.tsx:65` |
| A2 | `CONFIRM WEIGHT` / `WEIGHED IN`; `{OPP} WEIGHING IN`; `Confirm {w} lbs` / `Confirm weight` | `faceoff-body.tsx:69, 75, 46` |
| A2 | `YOUR CHECK` / `YOU FLAGGED`; `CHECKING WEIGH-INS...` | `faceoff/faceoff-weight-check.tsx:21, 49` |
| A2 | `{OPP} WEIGHED IN AT {w} LBS` / `RE-WEIGHED AT` / `{OPP} HAS NO WEIGH-IN ON RECORD`; `Confirm`; `Doesn't look right` | `faceoff-weight-check.tsx:79, 90, 95, 102` |
| A2 | `You flagged {opp}'s weight. Match is on hold.`; `Withdraw flag` | `faceoff-weight-check.tsx:68, 71` |
| A2 | `{opp} says your weight doesn't look right. Re-weigh to continue.`; `LBS`; `Re-weigh` | `faceoff-weight-check.tsx:154, 177, 180` |
| A2 | `Waiting for {opp} to check your new weight.` / `Waiting for {opp} to check your weight.` | `faceoff-weight-check.tsx:61, 112` |
| A2 | `CAMERA OFF ON THIS PHONE`; `Record from my phone`; `{OPP} · CHOOSING` / `{OPP} RECORDING` / `{OPP} NOT RECORDING`; `No one is recording this match` | `faceoff-body.tsx:109, 174, 166, 198` |
| A2 | `YOU · NOT READY` / `YOU · READY`; `{OPP} · NOT READY` / `{OPP} · READY` | `faceoff-body.tsx:114, 119` |
| A2 | `Match starts when you both tap ready`; `I'm ready`; `WAITING FOR {OPP}...` / `BOTH READY`; `MATCH ON HOLD · WEIGHT CHECK` / `WAITING FOR WEIGHT CHECKS`; `STARTING MATCH...` | `faceoff-body.tsx:143, 145, 149, 132, 138` |
| A2 | Alert `Cancel match?` / `Your opponent will be returned to the lobby.` / `Keep Waiting` / `Cancel Match` | `lib/match-flow/use-faceoff.ts:369-371` |
| A2 | Toast `Match cancelled` + `Your opponent left the ready check.` / `Your opponent cancelled the match.` | `lib/match-flow/use-wizard-sync.ts:80`, `use-faceoff.ts:209` |
| A2 | Toasts `Match on hold`, `Couldn't start match`, `Weight changed`, `Couldn't save your check`, `Couldn't re-weigh` | `use-faceoff.ts:258, 270, 322, 325, 331` |
| A2 | Push `Match Started` / `Your match has begun!` | jr_be `functions/push/index.ts:444-445` |
| A3 | `REC ARMS AT GO` / `NOT RECORDING`; `SYNCED TO SERVER CLOCK · BOTH PHONES`; `GRAPPLE` | `components/match-flow/countdown/countdown.tsx:170, 208, 244` |
| A3 | `LIVE` / `PAUSED` / `TIME` / `FINAL` | `live/clock-slab.tsx:63-69` |
| A3 | `PAUSE` / `RESUME`; `HOLD TO END` / `KEEP HOLDING` / `ENDING` | `live/pause-button.tsx:51`, `live/hold-to-end-button.tsx:143` |
| A3 | Strip `PAUSED · CAMERA STILL RECORDING`, `FINAL 10 SECONDS`, `TIME · ENDING MATCH`, `RELEASE TO CANCEL · ENDING MATCH`, `CAMERA STARTING · CLOCK IS RUNNING` | `live/state-strip.tsx:22-50` |
| A3 | `REC {mm:ss}` / `CAMERA STARTING` / `SAVING VIDEO` / `NO VIDEO` | `live/rec-tally.tsx:17-22` |
| A3 | `{NAME} ENDED THE MATCH`; `FINAL CLOCK {mm:ss} OF {mm:ss}` | `live/opponent-ended-plate.tsx:45, 51` |
| A3 | Toasts `Couldn't pause`, `Couldn't resume` | `lib/match-flow/use-live-controls.ts:110, 86` |
| A4 | `MATCH ENDED`; `Up next: record the result` | `steps/end-step.tsx:35, 38` |
| A4 | `ENDED AT {mm:ss}`; `Record result`; `TAP THE WINNER`; `Draw`; `Recording...`; `You're recording for both of you. {opp} sees this live.` | `steps/result-step.tsx:104, 113, 120, 126, 148, 155` |
| A4 | `YOU` / `OPPONENT`; `WINNER`; `Change`; `HOW DID IT END?`; `FINISH TIME`; `WITHIN {mm:ss}`; `FROM MATCH CLOCK`; `Match ends in a draw`; `Draws cost both athletes rating.` | `steps/result-form.tsx:100, 122, 137, 163, 236, 256, 259, 286, 291` |
| A4 | `MATCH OVER`; `{name} is recording the result`; `You'll confirm it in a moment.`; `ENDED AT` / `CLOCK`; `Still no result from {name}.`; `Record it myself` | `steps/result-waiting.tsx:40, 44, 48, 35-36, 74, 76` |
| A4 | Toasts `Couldn't record result`; `Saved locally` / `Result will sync when you're back online.` | `lib/match-flow/use-record-result.ts:85, 122-123` |
| A4 | `RESULT RECORDED BY {OPP}` / `RESULT RECORDED`; `Confirm result`; `WINNER` / `RESULT`; `YOU WON` / `YOU LOST` / `DRAW`; `{name} won`; `YOUR RATING` | `steps/confirm-step.tsx:174, 176, 185, 55-57, 192, 207` |
| A4 | `{OPP} CONFIRMED ✓` / `WAITING`; `CONFIRMED ✓` / `WAITING ON YOU`; `Dispute result` | `confirm-step.tsx:216, 223, 235` |
| A4 | `If you leave without disputing, it counts as confirming.`; `Locks automatically in {n} h.`; `The dispute window has closed.` | `lib/match-flow/match-extras.ts:55, 68`, `confirm-step.tsx:169` |
| A4 | `Dispute Result`; `Wrong winner, wrong submission, or it never happened? Tell us. An admin reviews...`; `What went wrong? (optional)`; `Submit Dispute`; `Back` | `steps/dispute-form.tsx:62, 65, 74, 86, 101` |
| A4 | `YOU WON` / `YOU LOST` / `DRAW` / `DISPUTED` / `MATCH RECORDED`; `Watch film` / `Open match`; `Share match`; `Know someone who'd beat you? Invite them.` | `verdict/verdict-step.tsx:169, 198, 329, 340` |

## Timekeeper mode (Designer B)

### Arena (B1)

| Id | Where | String |
|---|---|---|
| TK-AR1 | Challenge sheet, helper under the stakes strip and in place of the no-stakes fallback (flag known ON) | `Accept, then pick a timekeeper together.` |
| TK-AR2 | Helper under the challenger's mat-board strip `Waiting · {name}` (flag known ON) | `You'll both pick a timekeeper the moment they accept.` |

### Picker (B2, B3)

| Id | Where | String |
|---|---|---|
| TK-P1 | Top bar label | `FACE-OFF · TIMEKEEPER` |
| TK-P2 | Title | `Pick a timekeeper` |
| TK-P3 | Helper | `They start the match, run the clock and record the result. They can't be either of you.` |
| TK-W1 | Deadline chip | `CANCELS IN {m:ss}` (a11y `Match cancels in {m} minutes {s} seconds`) |
| TK-P4 | Search placeholder | `Search friends and nearby` |
| TK-P5 | Section | `Friends` |
| TK-P5b | Row caption, the other athlete's friend | `{athlete}'s friend` |
| TK-P6 | Section | `Nearby` |
| TK-P7 | Row action | `Ask` (a11y `Ask {name} to timekeep`) |
| TK-P8 | Row refused, busy | `Timekeeping another match` |
| TK-P9 | Row refused, busy | `Running their own match` |
| TK-P10 | Phase 2 row (disabled) | `Invite someone not on ELO RATED` |
| TK-P11 | Phase 2 tag | `PHASE 2` (board annotation only, not app copy) |
| TK-P12 | No friends | `No friends yet. Nearby athletes can timekeep too.` |
| TK-P13 | Nobody nearby | `Nobody else on the mat right now.` |
| TK-P14 | Both empty | `Nobody to ask yet. Ask someone at your gym to open ELO RATED and go live.` |
| TK-P15 | Search empty | `No one by that name.` |
| TK-P16 | Load error | `Couldn't load people to ask.` + `Try again` |
| TK-P17 | Pending card title | `Asked {name}` |
| TK-P18 | Pending card body | `Waiting for them to accept.` |
| TK-P19 | Pending card action | `Ask someone else` |
| TK-P20 | Other athlete's pending card | `{athlete} asked {name}` |
| TK-P21 | Declined | `{name} can't timekeep. Pick someone else.` |
| TK-P22 | Lapsed (2 min) | `{name} didn't answer. Pick someone else.` |
| TK-P23 | Accepted flash | `{name} is your timekeeper` |
| TK-P24 | Q4 only, not drawn as phase 1 | `Use a code instead` |
| TK-P25 | Other athlete's approval card (Q12, pending owner) | `{athlete} picked {name}. OK with you?` |
| TK-P26 | Approval primary | `Approve` |
| TK-P27 | Approval secondary | `Not this one` |
| TK-P28 | Picking athlete's pending card while the other athlete approves (Q12, pending owner) | `Waiting for {athlete} to approve.` |
| TK-W2 | Cancel toast description (title shipped `Match cancelled`) | `No timekeeper joined in 10 minutes.` |

### The asked person (B4)

| Id | Where | String |
|---|---|---|
| TK-N1 | Push | `Timekeep {A} vs {B}?` / `{athlete} asked you to start the match, run the clock and record the result.` |
| TK-T1 | Sheet title | `Timekeep this match?` |
| TK-T2 | Sheet body | `You start the match, run the clock and record the result. Your rating isn't affected.` |
| TK-T3 | Primary | `Accept` |
| TK-T4 | Secondary | `Decline` |
| TK-T5 | Countdown | `ANSWER IN {m:ss}` |
| TK-T6 | Refused | `This request is no longer open.` |

### Athlete face-off (B5)

| Id | Where | String |
|---|---|---|
| TK-F1 | Timekeeper row label | `TIMEKEEPER` |
| TK-F2 | Timekeeper row state | `CHECKING WEIGHTS` |
| TK-F3 | Timekeeper row state | `WEIGHTS CONFIRMED` |
| TK-F4 | Merged primary | `Weight looks right, I'm ready` |
| TK-F5 | After both ready | `{NAME} STARTS THE MATCH` |
| TK-F6 | Helper | `{name} starts the match once you're both ready.` |
| TK-F7 | Timekeeper flagged me | `{name} says your weight doesn't look right. Re-weigh to continue.` |
| shipped | Opponent line, secondary, re-weigh | `{OPP} WEIGHED IN AT {w} LBS`, `Doesn't look right`, `Re-weigh` (see A2) |

### Timekeeper face-off (B6)

| Id | Where | String |
|---|---|---|
| TK-K0 | Top bar label | `FACE-OFF · TIMEKEEPER` |
| TK-K1 / TK-K2 | Athlete row weigh-in | `WEIGHING IN` / `WEIGHED IN` |
| TK-K3 / TK-K4 | Athlete row ready | `NOT READY` / `READY` |
| TK-K5 | Athlete row after my confirm | `CONFIRMED` |
| TK-K6 | Start | `Start match` |
| TK-K7 | Start disabled reason | `WAITING FOR BOTH ATHLETES` |
| TK-K8 | Start disabled reason | `CONFIRM BOTH WEIGHTS` |
| TK-K14 | Timekeeper Leave alert (before the end only; no Leave after the end) | `Stop timekeeping?` / `The match waits up to 10 minutes for a new timekeeper.` / `Keep timekeeping` / `Leave` |
| TK-L0 | Countdown caption (timekeeper mode) | `SYNCED TO SERVER CLOCK · ALL PHONES` |
| shipped | Verdict buttons, flag, record, starting | `Confirm`, `Doesn't look right`, `YOU FLAGGED`, `Withdraw flag`, `Record from my phone`, `MATCH ON HOLD · WEIGHT CHECK`, `STARTING MATCH...` |

### Live (B7)

| Id | Where | String |
|---|---|---|
| TK-L1 | Timekeeper kicker | `YOU RUN THE CLOCK` |
| TK-L2 | Athlete strip (replaces controls) | `{NAME} RUNS THE CLOCK` |
| shipped | End plate on athletes | `{NAME} ENDED THE MATCH`, `FINAL CLOCK {mm:ss} OF {mm:ss}` (name = timekeeper) |

### Result (B8)

| Id | Where | String |
|---|---|---|
| TK-R1 | Timekeeper result kicker | `You're recording for {A} and {B}. They confirm it next.` |
| TK-R2 | Timekeeper done title | `Result recorded` |
| TK-R3 | Timekeeper done body | `{A} and {B} confirm it next. Your rating isn't affected.` |
| TK-R4 | Timekeeper done action | `Done` |
| TK-R5 | Athlete confirm kicker | `RESULT RECORDED BY {NAME}` (shipped template with the timekeeper's name; needs a code change: `confirm-step.tsx:174` gates it on `opponentConfirmed`, FE-7) |
| TK-N7 | Push | `Confirm your result` / `{name} recorded {A} vs {B}. Confirm or dispute it.` |

### Drop-out and cancel (B9)

| Id | Where | String |
|---|---|---|
| TK-D1 | Pre-start, back on picker | `{name} left. Pick a new timekeeper.` |
| TK-D2 | Live strip | `TIMEKEEPER LEFT · CLOCK PAUSED` |
| TK-D3 | Live plate | `{name} left. Pick a new timekeeper to finish this match.` |
| TK-D4 | Action | `Pick a new timekeeper` |
| TK-D5 | Replacement's first line | `Resume when you're ready.` |
| TK-D6 | Cancel toast description | `No timekeeper took over in time. The match won't count.` |
| TK-E1 | Timekeeper exit when an athlete leaves | `{athlete} left the match.` |
| TK-D7 | Athlete banner, timekeeper heartbeat gap (review M6) | `{NAME} IS OFFLINE` (with the deadline chip TK-W1) |
| TK-D8 | Athlete state, no result 10 min after the end (review M8) | `{NAME} DIDN'T RECORD THE RESULT · AN ADMIN WILL REVIEW IT` |

### Notifications (B10)

| Id | Title / body |
|---|---|
| TK-N1 | `Timekeep {A} vs {B}?` / `{athlete} asked you to start the match, run the clock and record the result.` |
| TK-N2 | `Timekeeper joined` / `{name} will run your match.` |
| TK-N3 | `Pick another timekeeper` / `{name} can't timekeep your match.` |
| TK-N4 | `Match cancelled` / `No timekeeper joined in time. Challenge again when you're ready.` |
| TK-N5 | `Your timekeeper left` / `Your match is paused. Pick a new timekeeper within 10 minutes.` |
| TK-N6 | `Match cancelled` / `No timekeeper took over in time. The match won't count.` |
| TK-N7 | `Confirm your result` / `{name} recorded {A} vs {B}. Confirm or dispute it.` |

### Phase 2 (B11, tagged PHASE 2)

| Id | Where | String |
|---|---|---|
| TK-X1 | Share message | `Can you timekeep {A} vs {B}? Join ELO RATED to run the match: {link}` |
| TK-X2 | Pending card body | `Waiting for them to join.` |
| TK-X3 | Invite landing headline | `{athlete} asked you to timekeep` |
| TK-X5 | Invite landing countdown (public page: names and this countdown only, never weights) | `Link expires in {m:ss}` |
| TK-X4 | Invite landing body | `Create your account to start the match, run the clock and record the result. Your rating isn't affected.` |

## Optional (C1)

C1 also draws the shipped `Preview only. Recording starts with the match.` (`components/match-flow/match-recorder-surface.tsx:89`) and the opponent plate `WEIGHED IN` (`faceoff-body.tsx:75`; the plate reads `WEIGHED IN`, not `{OPP} WEIGHED IN`; the shipped `{OPP} WEIGHING IN` before it). Shipped A2 also: `Turn your phone sideways for a wide shot. It locks when the match starts.` (`match-recorder-surface.tsx:96`).

C1 reuses TK-F4 `Weight looks right, I'm ready` with the shipped opponent line and `Doesn't look right`, and the shipped helper `Match starts when you both tap ready` (`faceoff-body.tsx:143`).
