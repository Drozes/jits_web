# Proposed (Oct 15 Timekeeper): board list

Page: "Proposed (Oct 15 Timekeeper)" on "ELO RATED Native Screens". Every board is a row of 390 px dark phone frames (Design type format: the exact `support.js` line, root size equal to the board's w/h and `$preview`, static markup only), except the map, the rules board and the diagrams (1440 px). Sample data: M. Reyes (challenger, 1512, 172.5 LBS), D. Okafor (opponent, 1487, 171.4 LBS), J. Cruz (timekeeper). Spec: `SPEC.md`. Copy: `COPY-DECK.md` (ids `TK-*` are NEW; shipped strings cite code).

Each board carries a corner tag: `CURRENT (FLAG OFF)` for A, `TIMEKEEPER MODE (FLAG ON)` for B, `OPTIONAL · FLAG OFF` for C, and `PHASE 2` where drawn.

## Designer A: current flow (already in progress; mirrors shipped code)

| Board | Title | Frames and states | Spec |
|---|---|---|---|
| `P-TK-A1-Challenge-To-Faceoff` | Challenge accepted to face-off | Opponent challenge sheet (Accept), challenger mat-board waiting strip, both landing on weigh-in | A.1 |
| `P-TK-A2-Faceoff-Weight-Ready` | Weigh-in, weight check, ready, auto-start | Weigh-in, YOUR CHECK verdict, flag and re-weigh, ready (not ready, waiting, both ready), STARTING MATCH, Leave alert | A.2, A.3 |
| `P-TK-A3-Live` | Live | Countdown, GRAPPLE, live running, paused, final 10, opponent ended plate | A.4 |
| `P-TK-A4-Result-Confirm` | Result and confirm | End step, result form (claimer), result waiting (other athlete, take-over), confirm, dispute, verdict | A.5 |
| `P-TK-A5-State-Machine` | Current state machine | wait, weight, ready, live, end, result, confirm, summary; DB vs broadcast sync (1440 px) | A.6 |

Designer A owns copy fidelity: every string literal from the file:line in SPEC section A.

## Designer B: timekeeper mode, rules, optional, map

| Board | Title | Frames (390 px unless noted) and states | Spec | Copy ids |
|---|---|---|---|---|
| `P-TK-00-Map` | Map (1440 px) | What changed; decisions D1 to D11 (D3 with the owner update); three-role swimlane flow (challenger, opponent, timekeeper) from accept to confirmed, with the drop-out and 10-minute branches; backend asks BE-1 to BE-11 and mobile FE-1 to FE-10; risks (public broadcast, stale pending, pgTAP 061/108/111); open questions Q1 to Q11; go/no-go with sizing and the ship-dark recommendation; a small PHASE 2 box (off-platform invite) | 1, D, E, F, P | none new |
| `P-TK-B-Rules` | Timekeeper mode rules (1440 px) | The who-can-do-what matrix (flag OFF vs timekeeper mode, every action, server rule and HINT); the 10-minute rule; the snapshot and client-capability rule; the drop-out, offline and stall rules; lock order; the timekeeper-mode branches of the code join and removal; the coordinator assumption on timekeeper flags marked PENDING OWNER | R, B.6 | none new |
| `P-TK-B1-Arena-Copy` | Arena with the flag on | Challenge sheet with TK-AR1 under the stakes strip (and in place of the no-stakes fallback); mat-board waiting strip with TK-AR2 as helper; Q13 note | B.1 | TK-AR1, TK-AR2 |
| `P-TK-B2-Picker` | Pick a timekeeper | (1) picker default: deadline chip 9:12, search, Friends (with a `{athlete}'s friend` row), Nearby, disabled PHASE 2 invite row; (2) search typed; (3) request pending (`Asked J. Cruz`); (4) the other athlete's view (`M. Reyes asked J. Cruz`); (5) the other athlete's approval card and the picker's `Waiting for {athlete} to approve.` (TK-P28) (Q12, tagged PENDING OWNER) | B.2 | TK-P1 to TK-P11, TK-P17 to TK-P20, TK-P25 to TK-P28, TK-W1 |
| `P-TK-B3-Picker-States` | Picker empty, declined, lapsed, accepted | (1) no friends, (2) nobody nearby, (3) both empty, (4) no search result, (5) load error, (6) declined, (7) lapsed, (8) accepted flash, (9) deadline under 2:00 in red | B.2 | TK-P12 to TK-P16, TK-P21 to TK-P23, TK-W1 |
| `P-TK-B4-Timekeeper-Ask` | The asked person | (1) push on lock screen, (2) Timekeep this match? sheet with ANSWER IN, (3) request no longer open, (4) entering the match as timekeeper | B.2 | TK-N1, TK-T1 to TK-T6 |
| `P-TK-B5-Athlete-Faceoff` | Athlete face-off (merged ready) | (1) weigh-in (shipped) with the timekeeper row, (2) ready with opponent weight line and `Weight looks right, I'm ready`, (3) waiting for opponent, (4) both ready, `J. CRUZ STARTS THE MATCH`, (5) timekeeper flagged me: re-weigh | B.3 | TK-F1 to TK-F7 |
| `P-TK-B6-Timekeeper-Faceoff` | Timekeeper face-off and Start | (1) both weighing in, Start disabled `WAITING FOR BOTH ATHLETES`; (2) confirming weights, `CONFIRM BOTH WEIGHTS`; (3) one flagged, `MATCH ON HOLD · WEIGHT CHECK` (assumption tag); (4) all set, `Start match` enabled; (5) STARTING MATCH; (6) countdown with `ALL PHONES` | B.3 | TK-K0 to TK-K8, TK-L0 |
| `P-TK-B7-Live` | Live, three roles | (1) timekeeper running with controls and `YOU RUN THE CLOCK`, (2) timekeeper paused, (3) athlete read-only with `J. CRUZ RUNS THE CLOCK`, (4) athlete paused by timekeeper, (5) athlete after the timekeeper ended | B.4 | TK-L1, TK-L2 |
| `P-TK-B8-Result` | Result, three roles | (1) timekeeper result form with TK-R1, (2) athlete waiting (no take-over), (3) timekeeper done with confirm progress, (4) athlete confirm `RESULT RECORDED BY J. CRUZ` with both rows waiting | B.5 | TK-R1 to TK-R5 |
| `P-TK-B9-Dropout` | Timekeeper drop-out and cancel | (1) pre-start: back to picker with TK-D1; (2) mid-match athlete view: paused, TK-D2, TK-D3, deadline chip, `Pick a new timekeeper`; (3) replacement accepted, TK-D5; (4) cancelled exit toast; (5) 10-minute pre-start cancel toast; (6) timekeeper offline banner, clock still running (TK-D7); (7) after the end, admin review state (TK-D8) | B.6 | TK-D1 to TK-D8, TK-W2 |
| `P-TK-B10-Notifications-Edges` | Pushes and edge cases | Push list per role (TK-N1 to TK-N7, shipped Match Started), timekeeper Leave alert, athlete left (TK-E1) | B.7, B.8 | TK-N*, TK-K14, TK-E1 |
| `P-TK-B11-Phase2-Invite` | PHASE 2: off-platform timekeeper | (1) picker invite row enabled, (2) share sheet, (3) pending `Waiting for them to join.` with the extended deadline, (4) invitee landing (public: names and `Link expires in {m:ss}` only, NO weights) and claim. Whole board tagged PHASE 2 | P | TK-P10, TK-P11, TK-X1 to TK-X5 |
| `P-TK-C1-Merged-Ready-FlagOff` | OPTIONAL: merged ready for flag OFF | (1) weigh-in own weight only, (2) ready with opponent weight line and merged button, (3) waiting. Tag `OPTIONAL · NOT BEFORE ALPHA` | C | TK-F4 (reused) |

Layout: the map at (0, 0), the rules board to its right; row A (A1 to A5) below, row B (B1 to B11) below that, C1 at the end of row B. Rows 343 px apart with a title note 280 px above each, as on the Oct 6 page.
