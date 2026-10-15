# Board review, round 1 (independent reviewer, 2026-10-15)

Scope: all 19 boards on disk in `project/` (P-TK-00-Map, P-TK-B-Rules, A1 to A5, B1 to B11, C1), checked against SPEC.md (including section R and the "Review round 1 fixes" table), COPY-DECK.md, BOARDS.md, BRIEF.md (D1 to D11) and the shipped code in this worktree (`apps/mobile`, jits_web origin/development 4a20ee80). The reviewer drew none of these boards and changed none of them.

Verdict: no BLOCKER. Format is clean on every board. Rules fidelity is good: the B boards and the rules board follow section R and every round 1 fix. Five MAJOR findings need fixing before publishing. Most of them are sample-data and cross-designer consistency problems; one is a privacy issue on the phase 2 landing and one is spec drift the designers already found.

## Method

1. **Format.** A script checked every `.dc.html` for the exact `<script src="./support.js"></script>` line, exactly two script tags, a `data-dc-script` body identical to the Oct 6 boards (`class Component extends DCLogic { renderVals() { return {}; } }`), and that the root `width`/`height`, `$preview` and `boards_a/b1/b2.json` w/h are all equal. It also checked for external URLs other than Google Fonts, `url()`, img/iframe/canvas/video tags, inline handlers, em, en and horizontal-bar dashes (raw and as entities), and exclamation marks.
2. **Copy.** Visible text was extracted from all B and C boards (806 lines matched COPY-DECK templates). Every line that did not match was triaged by hand. 21 A-board strings were grepped against `apps/mobile` with their file:line.
3. **Rules.** Each row of the rules board and each B frame was read against SPEC R, B.0 to B.8 and the round 1 table.
4. **Render.** B6, B9, B10, A4, B-Rules, B2, B4, B8, B11 and the map were rendered in headless Chrome at board size, and B6, B9, B10, B2, A4 and the rules board were inspected.

## Format result (check 1): PASS

- All 19 boards have the identical `support.js` line, the reference DCLogic body, matching root, `$preview` and json sizes, static markup only, and no em, en or horizontal-bar dashes.
- A2 and A3 contain `<img src="/_blob/...">` camera mocks. These are the same three asset ids the live "Current app" boards 22, 22b, 23 and 24 already use (verified in the canvas read copy), so they are allowed existing assets.
- B10 has two `!` characters. Both are the shipped push body `Your match has begun!`, so this is not a violation.
- The map links all 19 board ids that are on disk and nothing else.

## BLOCKER

None.

## MAJOR

**M1. A1 to A4 sample data contradicts BOARDS.md and every B board (Designer A).**
- Evidence: A boards show M. Reyes at `ELO 1487 · 170 LBS` and D. Okafor at `ELO 1512 · 168 LBS` (A1 frame 3, A2, A3 `1487 · 170 LBS`, A4 `1487 → 1504`, `1487 · 1512`). BOARDS.md and every B and C board use Reyes 1512 / 172.5 and Okafor 1487 / 171.4. The gap line also reads `2 LBS APART`, where the B and C boards read `1.1 LBS APART`.
- Why it matters: the A and B rows are meant to be compared frame against frame. Swapped ratings and different weights make the same match look like a different match.
- Fix: in `gen_a.py`, substitute the sample values after loading the live boards: Reyes 1512 / 172.5, Okafor 1487 / 171.4, gap `1.1 LBS APART · SAME DIVISION`, and stakes and rating lines recomputed to match B5 (see m4).

**M2. A1 frame 2 shows the wrong challenger (Designer A).**
- Evidence: frame 1 is the challenger's phone (`You 1487`, `Waiting · Dana Okafor`), so the challenger is M. Reyes. Frame 2 is labelled "Opponent", yet the sheet reads `D. Okafor / ELO 1512 · 168 LBS / D. Okafor is live in the Arena / YOUR STAKES · 1487`. That is Reyes receiving a challenge from Okafor, the reverse of frame 1.
- Fix: frame 2 must be D. Okafor's phone showing `M. Reyes is live in the Arena`, Reyes's ELO and weight, and `YOUR STAKES · {Okafor's ELO}`. B1 frame 1 already draws this correctly and can be used as the reference.

**M3. Picker roster and picker styling differ between Designer B1 and Designer B2.**
- Evidence, names: B2, B3 and the rules board use the Arena roster also used on A1: `Jordan Cruz 1301`, `Sam Whitfield 1620`, `Priya Shah 1455`, `Leo Tanaka 1440`, `Kenji Mori 1388`, and the rules timeline uses `Ask L. Tanaka` and `Ask S. Whitfield`. B9 frame 1, B10 frame 6 and B11 use a different invented roster: `K. Tanaka 1540`, `A. Shah 1468`, `L. Whitfield 1501`, `P. Lam`. The replacement timekeeper on B9 frame 3 is therefore "K. Tanaka", who exists nowhere else.
- Evidence, styling: B1's picker rows (B2, B3) use full names, `J·C` mid-dot initials tiles, the `LIVE` green badge, the hollow online ring and an outlined `Ask`. B2's compact picker (B9 frame 1, B10 frame 6, B11 frames 1 to 4) uses uppercased short names, plain `KT` tiles, no LIVE badge and a filled `ASK` box. B9 frame 1 also drops the fight chip that B2 shows.
- Approval card (Q12): B2 frame 5 draws the card with the candidate row and the buttons ordered `Not this one`, then `Approve`. B10 frame 6 draws the order `Approve`, then `Not this one`, with no candidate row.
- Fix: treat B1's B2 and B3 as canonical. In `gen_b2.py`, reuse that row component and roster (for example replacement = Leo Tanaka, the phase 2 invitee P. Lam is fine), keep the fight chip on B9 frame 1, and either align B10 frame 6 to B2 frame 5 exactly or delete it and reference B2 frame 5. The current one is a duplicate that disagrees.
- Note: Jordan Cruz appearing as an ordinary Arena athlete on A1 is consistent with him being the timekeeper J. Cruz, so keep it.

**M4. B11 frame 5 (phase 2 invite landing) puts both athletes' body weights and ratings on a public web URL.**
- Evidence: the unauthenticated `elorated.com` landing shows `M. Reyes 1512 · 172.5 LBS / D. Okafor 1487 · 171.4 LBS`. Anyone the link is forwarded to sees this without an account.
- Fix: show names only (or names and ELO, if 016 landings already expose ELO publicly) and drop weights. Flag it to the owner beside Q11. Also, the landing's `CANCELS IN 7:10` is not a deck string for this surface: either add a TK-X5 entry (for example `Link expires in {m:ss}`) or remove it.

**M5. Arena copy placement (TK-AR1, TK-AR2): the boards are right and SPEC and COPY-DECK are wrong (spec drift, Designer B1 flagged it).**
- Verified in code:
  - `challenge-prompt-sheet.tsx:476-484` renders `Accept and you both drop straight into the match.` only in the no-stakes fallback branch, so replacing that line alone would almost never show TK-AR1.
  - The real Arena challenger sees the mat-board strip `Waiting · {name}` (`mat-board.tsx:382`). `WaitingPlate` in `arena-plates.tsx` (the home of `You'll both drop into the match the moment they accept.`) is now used only by `components/practice/practice-steps.tsx:61`.
- What B1 did, and it is endorsed: it adds TK-AR1 under the stakes strip, replaces the fallback in place, and draws TK-AR2 as a helper under the mat-board strip.
- Fix in the docs: SPEC A.1 and B.1, COPY-DECK row A1 (`arena-plates.tsx:79-88`), and FE-9 should describe these placements. SPEC A.1 should name the mat-board strip, not the waiting plate, as the challenger's view.
- Over-promise under the capability rule (B1's open question): TK-AR1 and TK-AR2 can show when the other athlete's build is older, and the match then runs flag-OFF. Recommendation: keep the copy, because it is a soft promise and the picker never appears, so nothing breaks. Add owner question Q13 ("acceptable that the Arena line can promise a timekeeper that an older build on the other side prevents?"). The alternative is to show the line only when the challenge row records both sides' capability; that is possible on the challenger's waiting strip after accept, but not on the opponent's sheet before accept.

## MINOR

**m1. B7 frame 5 shows the wrong value on the final clock.**
- Evidence: B7 frame 5 shows `FINAL CLOCK 03:48 OF 05:00` with the slab at `03:48`. The shipped plate prints the clock display value, which counts down (`live-step.tsx:146` `formattedRef`). A3 frame 4e correctly shows `01:12` for a match ended at `03:48` elapsed (A4 `ENDED AT 03:48`).
- Fix: change B7 frame 5 to `FINAL CLOCK 01:12 OF 05:00` with the slab at `01:12`. B7 frames 1 to 4 and B9 are internally consistent (remaining clock vs REC tally).

**m2. B8 frame 4 relies on a code change to the confirm header that no frame note mentions.**
- Evidence: TK-R5 is not just "the shipped template". `confirm-step.tsx:174` prints `RESULT RECORDED BY {OPP}` only when `opponentConfirmed`, else `RESULT RECORDED`. In timekeeper mode nobody is auto-confirmed, so the shipped logic would print `RESULT RECORDED`.
- Fix: add a frame note on B8 frame 4 and a line in FE-7 (the header comes from the timekeeper's name and is not gated on confirmation).

**m3. The lock-screen date differs between B4 and B10, and B10's day is wrong.**
- Evidence: B4 frame 1 reads `Thursday 15 October 7:41`. B10 frames 1 to 3 read `Wednesday, October 15 9:41`. 2026-10-15 is a Thursday.
- Fix: use B4's form on B10. B4's app-icon glyph also renders as `E · R` on three lines, where B10 shows `ER`; align them.

**m4. Stakes figures disagree for the same matchup on the same phone.**
- Evidence: M. Reyes's stakes are `+14 / −2 / −18` on B5 frame 1 and `+15 / −6 / −16` on C1 frame 1. B8 frame 4 shows a `+15` win.
- Fix: pick one set (B5's or C1's) and use it on B5, C1 and B8 (and on A1 to A4 once M1 is fixed).

**m5. B4 frame 2 and B11 frame 6 draw the same sheet differently.**
- Evidence: B11 frame 6 is described as "the same accept sheet" as B4 frame 2, but it lists `Accept` before `Decline` and its fight chip carries weights (`1512 · 172.5 LBS`). B4 frame 2 has `Decline` left, `Accept` right and `ELO 1512` without weights.
- Fix: make B11 frame 6 a copy of B4 frame 2 (the timekeeper's weight view is irrelevant, D2).

**m6. B2 frame 5 sends the picker to a frame with the wrong copy and leaves a state undrawn.**
- Evidence: the B2 frame 5 note says "Meanwhile M. Reyes's phone shows frame 3", but frame 3 reads `Asked J. Cruz / Waiting for them to accept.`. With Q12 the request has not been sent yet; the picker is waiting for the other athlete's approval.
- Fix: there is no deck string for this state. Add one (for example TK-P28 `Waiting for {athlete} to approve.`) and draw or annotate the variant, all tagged PENDING OWNER (Q12).

**m7. The rules board leaves out the code-joined timekeeper that already exists in flag-OFF matches.**
- Evidence: a code-joined record-only timekeeper exists today in flag-OFF matches (`20261006100000`). The rules board marks the flag-OFF Timekeeper column `N/A` for "Cancel / leave before start" (yet `leave_match_as_timekeeper` exists today) and for "Record video" (yet the record-only media rights exist today), while "Join by code" in the same column is `YES`. SPEC R has the same gap.
- Fix: set those two cells to YES, with the notes "Leave removes only them (leave_match_as_timekeeper)" and "Record-only media rights", and correct SPEC R's flag-OFF column the same way.

**m8. B3 frame 7 assumes something about the candidate read that the spec does not say.**
- Evidence: the frame removes J. Cruz from the list after a decline ("design assumption: the candidate read leaves out anyone who declined this match"). SPEC B.2 says only "the list returns".
- Fix: either add "exclude invitees who declined this match" to `get_timekeeper_candidates` in BE-2 and SPEC B.2, or keep J. Cruz in the list. Do not leave it as an unstated backend dependency.

**m9. B10's edge-case list includes a case the capability rule makes impossible.**
- Evidence: B10's edge list says "Offline-queued athlete result from an older build: refused with not_timekeeper". SPEC B.8 says this cannot happen, because an older build never receives a timekeeper-mode match (B.0).
- Fix: reword it as defence in depth ("cannot occur under the capability rule; if it did, the server refuses with not_timekeeper").

**m10. Shipped strings drawn on C1 are missing from the copy deck.**
- Evidence: C1 frame 1 draws `D. OKAFOR WEIGHED IN` as a single plate (shipped is `WEIGHED IN` on the opponent plate, `faceoff-body.tsx:75`; check the exact rendering), and C1 frames 2 and 3 draw `Preview only. Recording starts with the match.` (shipped, `match-recorder-surface.tsx:89`). Neither is in COPY-DECK.
- Fix: add both to the deck with their file:line (or match the plate text to code literally).

**m11. Clock-slab overlap needs a check.**
- Evidence: on the B9 renders (frames 2, 3 and 6) the slab caption `OF 05:00` touches the top-right of the large numerals.
- Fix: compare with live board 24 and A3. If the live board does not overlap, nudge the caption in `gen_b2.py`.

**m12. Two A1 and A2 board ids differ from BOARDS.md.**
- Evidence: the files are `P-TK-A1-Challenge-To-Faceoff` and `P-TK-A2-Faceoff-Weight-Ready`, while BOARDS.md lists `P-TK-A1-Accept-To-Faceoff` and `P-TK-A2-Faceoff`. The map links the on-disk ids, which is correct.
- Fix: update BOARDS.md.

## Vertical stacks vs rows (coordinator question)

Designer B1's B1 to B5 are 390 px single columns, up to 6214 px tall (B3). Designer A's boards and B6 to B11 and C1 are horizontal rows of 390 px frames about 1400 px tall. BOARDS.md says "Every board is a row of 390 px dark phone frames".

Recommendation: change B1 to B5 to rows before publishing. It is not a correctness problem, but on one page it breaks the rows layout ("rows 343 px apart"), puts a 6 m tall column next to 1.4 m tall rows in row B, and makes frame-by-frame comparison with A2 and B6 awkward.

If that cannot be done before publishing, it is acceptable only if `build_canvas.py` puts B1 to B5 at the end of row B with enough vertical clearance. Note this as a MINOR deviation from BOARDS.md.

## Checks that passed

- **Rules fidelity (check 3).** All of these were checked against the spec and match it: `end_match_clock` vs the legacy `end_match` (`use_end_match_clock`; B7 frame 5, the rules board, the map); offline (60 s heartbeat, no pause, TK-D7) vs explicit Leave (immediate) on B9 frames 1, 2 and 6 and the rules board; no Leave after `ended_at` (`result_owed`; B9 frame 7, B10 frame 4); admin review on a stall after the end (TK-D8, B8 frame 2, B9 frame 7); re-weigh voids the timekeeper's confirmation and clears both athletes' ready (B6 frame 3b, B5 frame 5, the rules board); the capability rule (the rules board, the map, B1 frame 4); Q12 tagged PENDING OWNER (B2 frame 5, B10 frame 6, the rules board); the Q1 assumption tagged on B5 frame 5, B6 frame 3 and the rules board. The rules board matches SPEC R row by row, including every HINT. No frame contradicts an owner decision.
- **Map.** It lists D1 to D11; Q1, Q2, Q3, Q3b, Q3c, Q4 to Q12 in numeric order; go/no-go criteria 1 to 7; sizing of 10 to 14 days; RECOMMENDATION: SHIP DARK; a PHASE 2 box; and links to every board on disk.
- **Tags (check 4).** B11 carries `PHASE 2 · NOT IN THE FIRST BUILD` on the board and `PHASE 2` on every frame. C1 carries `OPTIONAL · NOT BEFORE ALPHA` and `OPTIONAL · FLAG OFF` and a "Why it is optional" panel. In phase 1 the picker's invite row is drawn disabled with the PHASE 2 tag. Nothing implies first-build or pre-alpha shipping.
- **Copy (check 2).** No em or en dashes. Every B and C string in the sample (well over 25) is in the deck, apart from m10 and the M4 countdown. These A-board strings were verified literally in code: `INCOMING CHALLENGE` (challenge-prompt-sheet.tsx:543), `{name} is live in the Arena` (:603), `{m:ss} LEFT` (:162), `Waiting · {name}` (mat-board.tsx:382), `Preview only. Recording starts with the match.` (match-recorder-surface.tsx:89), `Turn your phone sideways for a wide shot. It locks when the match starts.` (:96), `Match starts when you both tap ready` (faceoff-body.tsx:143), `MATCH ON HOLD · WEIGHT CHECK` (:132), `SYNCED TO SERVER CLOCK · BOTH PHONES` (countdown.tsx:208), `CAMERA STILL RECORDING` (state-strip.tsx:23), `MATCH OVER` / `{NAME} ENDED THE MATCH` / `FINAL CLOCK ... OF ...` (opponent-ended-plate.tsx:37-51), `Up next: record the result` (end-step.tsx:38), `You’ll confirm it in a moment.` (result-waiting.tsx:48, curly apostrophe as in code), `You're recording for both of you. {opp} sees this live.` (result-step.tsx:155), `Search all submissions` (result-form.tsx:206), the full dispute body (dispute-form.tsx:65-67), `Back to Arena` (lib/arena/constants.ts:51), `Your film is in. Analyzing now.` (lib/video/video-status-copy.ts:60), `· PASSED {NAME}` (use-verdict-data.ts:140), `{name} (you)` and the status rows (confirm-step.tsx:216-223), `Not a participant` (match-flow-wizard.tsx:251).
- **Render (check 6).** No clipped text, overflow or overlapping elements found on B6, B9, B10, B2, A4 or the rules board, apart from m11.

## Round 2 verification (2026-10-15)

**Verdict: PUBLISHABLE.** No blockers remain.

### Format

The checker was re-run over all 19 boards and every board passes:
- the `support.js` line is identical on every board;
- the DCLogic body is the reference body;
- root size equals the board's w/h in `boards_*.json` and its `$preview`;
- markup is static, with no external assets other than the Google Fonts stylesheet;
- there are no em, en or horizontal-bar dashes.

Two allowed exceptions remain, as in round 1:
- A2 and A3 carry the shared `/_blob/` camera images that the live Current app boards already use.
- B10 carries the shipped `Your match has begun!`.

B1 to B5 are now rows: B1 1784, B2 2648, B3 4376, B4 1784 and B5 2216 px wide, all about 1.24k to 1.41k px tall.

### MAJOR findings

- **M1, resolved.** No A board string contains `1487 · 170`, `168 LBS` or `2 LBS APART` any more. The page now carries `1.1 LBS APART · SAME DIVISION` and Reyes `1512 → 1526` throughout.
- **M2, resolved.** A1 now reads `M. Reyes is live in the Arena`. `D. Okafor is live in the Arena` no longer appears anywhere.
- **M3, resolved.**
  - The K. Tanaka, A. Shah and L. Whitfield roster is gone from every board.
  - B9, B10 and B11 use B1's `picker_row` component: initials tile, full names, LIVE badge, online ring. B9 frame 1 has the fight chip again.
  - The replacement on B9 frame 3 is now L. Tanaka.
  - B10 frame 6 now uses B2 frame 5's button order (Not this one, then Approve) with the candidate row.
  - Rendered B2, B3 and B9 and confirmed visually.
- **M4, resolved.** The B11 landing now shows names only, with no weights or ELO, plus `Link expires in 7:10`. That string is TK-X5 in the copy deck, and the rule is stated in SPEC section P.
- **M5, resolved.**
  - SPEC A.1, B.1 and the M5 fix row now describe the shipped placements: the mat-board strip at `mat-board.tsx:382` and the no-stakes fallback at `challenge-prompt-sheet.tsx:476-484`.
  - Q13 is in SPEC section F and on the map, and B1 frame 4 cites it.

### MINOR spot checks

- **m1, resolved.** B7 frame 5 reads `FINAL CLOCK 01:12 OF 05:00`.
- **m3, resolved.** Every lock screen reads `Thursday 15 October`.
- **m4, resolved.** The stakes are one set across the page: Reyes +14 / −2 / −18 and Okafor +18 / +1 / −13. No `+15`, `−6`, `−16` or `+17` remains.
- **m5, resolved.** B11 frame 6 is now Decline, then Accept.
- **m6, resolved.** TK-P28 `Waiting for {athlete} to approve.` is in the copy deck and drawn as B2 frame 6 (PENDING OWNER).
- **m7, resolved.** The rules board's flag-OFF timekeeper column now notes the code-joined timekeeper's Leave and record-only media rights.
- **m8, resolved.** B3 frame 7 keeps J. Cruz in the list, per SPEC B.2.
- **m9, resolved.** The impossible "older build" queued-result line is gone from B10.
- **m10, resolved.** The copy deck now lists `Preview only. Recording starts with the match.` for C1.
- **m12, resolved.** BOARDS.md uses the on-disk A1 and A2 ids.
- **m2, not re-checked.** I did not look again at the B8 frame 4 note.

### Residual nits (non-blocking)

- **m11 is not fixed.** On B9 frames 2, 3 and 6 the slab caption `OF 05:00` still touches the numerals. Before a later polish pass, compare the slab against live board 24.
- **Two frames leave things out, but say so on the board.** B2 frames 3 to 6 cut the list at the fold. The B3 frames omit the fight chip.

## Round 3 verification (D12, timekeeper must record), 2026-10-15

**Verdict: PUBLISHABLE.** No blockers. Two MINOR documentation items and one owner/legal note follow; none of them blocks publishing.

### Checks

1. **Format: pass.** The checker was re-run over all 19 boards and every one passes:
   - the `support.js` line is identical on every board;
   - the DCLogic body is the reference body;
   - root size equals the board's w/h in `boards_*.json` and its `$preview` (for example B4 2648x1352, B6 3512x1441, B7 2648x1473);
   - markup is static;
   - there are no em, en or horizontal-bar dashes.
   The only exceptions are the two allowed ones: the shared `/_blob/` camera images on A2 and A3, and the shipped `Your match has begun!` on B10.

2. **D12 copy: pass.** Each D12 string on the boards matches COPY-DECK exactly, under the right id:

   | Id | String | Board |
   |---|---|---|
   | TK-T7 | `Timekeepers record the match on video. ELO RATED analyses the film with AI.` | B4 frames 2 and 4, B11 frame 6 |
   | TK-T8 | `You need to allow recording to timekeep.` | B4 frame 4 |
   | TK-K9 | `Timekeepers always record this match.` | every B6 face-off frame, B10 frame 4 |
   | TK-K10 | `WAITING FOR YOUR CAMERA` | B6 |
   | TK-K11 | `Allow camera access to timekeep. Your camera records the match.` | B6 |
   | TK-K12 | `Open Settings` | B6 |
   | TK-L3 | `CAMERA STOPPED · KEEP RUNNING THE CLOCK` | B7 frame 2b |
   | TK-L4 | `Restart camera` | B7 frame 2b |
   | TK-U1 | `Your film hasn't uploaded yet.` | B8 |
   | TK-U2 | `Upload now` | B8 |
   | TK-N8 | `Upload your match film` / `{A} vs {B} needs your film. Open ELO RATED to finish the upload.` | B10 |

   B8 also uses the shipped keep-open line `Keep ELO RATED open until your film uploads.`, which matches `lib/video/upload-copy.ts:26` literally.

3. **Cross-board consistency: pass.** SPEC R, the rules board, the map and B4, B6, B7, B8 and B10 agree on each point below.
   - **Record row:** locked on in every timekeeper frame, with the shipped label, a lock glyph and no switch. The athletes keep their optional switch.
   - **Start gate:** opens only when the camera is ready (checked on the phone) and the intent is on server side. `start_match` refuses with `timekeeper_not_recording`; `set_match_recording_intent` refuses to turn the intent off with `timekeeper_must_record`.
   - **Consent:** taken at Accept, through the shipped AI consent sheet.
   - **Camera failure:** the banner shows while the clock and controls stay, and the match is never stopped.
   - **Upload:** required. Missing footage at the 24 h settle window (counted from `completed_at`) only flags the match for admin review; athletes see nothing.
   - **Push:** one TK-N8 nudge, 2 h after the end.
   - **Q14:** on the map in order, with the recommended answer.

4. **B11 frame 6 vs B4 frame 2: pass.** B11 frame 6 matches B4 frame 2 string for string and in order:
   - the title and `ANSWER IN 1:42`;
   - the fight chip with ELO only and no weights;
   - TK-T2, then TK-T7 directly below it;
   - Decline on the left, Accept on the right.

5. **Feasibility: pass.**
   - **What the server checks:** SPEC B.9, the rules board and B6 frame 4b all say the server can verify only the recording intent before the start and only whether an upload arrived afterwards. None of them claims the server can tell the camera is rolling.
   - **Intent write at accept:** the shipped `set_match_recording_intent` (`20261005100300`) accepts writes while the match is `pending` or `in_progress` and derives the timekeeper role. So writing the intent at accept also works for mid-match replacements.
   - **D8:** nothing contradicts it. Athletes stay optional everywhere: B6 frame 1, B7 frame 2b ("the athletes' optional angles still count"), the B10 edge list and the rules board's Record video row.
   - **Flag-OFF safety:** both RPC changes are stated as timekeeper-mode only (SPEC B.9 "in timekeeper mode", R and BE-12). The flag-OFF Record video column still reads "all optional", including the code-joined record-only timekeeper.

6. **Renders: pass.** B4, B6 and B7 were rendered in headless Chrome. There is no clipping or overlap; the new consent frame, the camera-denied frame and the camera-failure banner all fit their 390 px frames.

### Remaining items (none blocking)

- **MINOR, SPEC fix needed.** SPEC B.2 (line 105) calls the consent button `Allow`. The shipped label is `Allow and film` (`AI_CONSENT_COPY.allow`, `lib/moderation/moderation-copy.ts:86`), and B4 frame 3 correctly draws `Allow and film`. Change SPEC B.2 to `Allow and film`, and add the shipped consent strings with their file:line to COPY-DECK under B4.
- **MINOR, owner/legal note (no board change).** The shipped "Before you film" body is worded for an athlete filming themselves: "Your match video, with your display name, rating and weight division, is sent to Google Gemini…". A timekeeper films two other people, and their own name, rating and division are not what gets sent. Reusing the sheet unchanged is fine for the boards. Before build, the owner or legal should confirm that this consent is enough for a non-competing filmer, or add timekeeper-specific body copy.
- **Carried over from round 2.** m11 is still open: the `OF 05:00` slab caption touches the numerals on B9, and now on B7 too. This is cosmetic; compare with live board 24.
