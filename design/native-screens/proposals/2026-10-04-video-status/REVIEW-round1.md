# Independent UX review, round 1: match video status (jits-n2im.24, jits-n2im.2)

Reviewer: independent agent (did not author the copy deck or the boards). Date: 2026-10-04.
Scope: `COPY-DECK.md`, `README.md`, `project/P-VS-00` to `P-VS-18`, `canvas-delta.json`,
`canvas.next.json`, `boards.json`, `generate.py`. Read only: no proposal file was edited and nothing
was published.

**Verdict: REQUEST CHANGES.** The structure is right (one Film status plate as the source of truth,
rows per angle labelled by owner, server countdown, one push, grey for other people's problems) and
the canvas package is format-compliant and additive. But the proposal still contains instances of the
exact bug class the overhaul exists to fix (two surfaces telling two stories), plus several strings
that are untrue in realistic scenarios. All fixes are copy, color or small layout changes; none needs
a redesign, so round 2 should be short.

## How this was checked

- Rendered all 19 boards with headless Chrome at their board size (support.js stubbed) and read every
  frame, slicing the tall boards (08, 09, 18).
- Walked the 7 owner scenarios as competitor A (M. Reyes), competitor B (D. Okafor) and the
  timekeeper (J. Cruz), across the recording phone and a second device.
- Compared copy deck vs boards string by string for the same state.
- Checked feasibility against beads `jr_be-1qz.20` (status RPC), `jr_be-1qz.1` (reservation,
  heartbeat at most every 30 s, `upload_paused` after a 2 min stale heartbeat, abandon RPC, 7-day
  reaper), `jr_be-1qz.9` (10 min gate, owner's +10 min extension, 1 min dispatch cron), `jr_be-1qz.16`
  (pushes), `jits-n2im.1`, `.3`, `.13`, `.16`, and code on `origin/development` 48843b2
  (`percentLabel`, `uploadingLabel`, `angleName`, `deriveCardStatus`, `discovery.ts` bell copy,
  `accessibilityLiveRegion` usage).
- Checked contrast against `apps/mobile/lib/tokens.ts` (origin/development) and the Design System
  README rules (amber = waiting, green only gain/win/LIVE, red = act or lose, no em dashes).
- Diffed `canvas.next.json` against the live `project/canvas.json` read at version
  `1790970841-9c7a` (the live version at review time, the same one the delta is based on).

---

## Blockers

### B1. Same state, different words on two surfaces (the contradiction bug class)

Each of these lets two surfaces disagree at the same moment, which the owner decision forbids.

1. **Film Room badge for phase `collecting`.** COPY-DECK section 9 placement table says the Film Room
   badge is `Uploading`; the badge priority list in the same section says `Processing` (collecting);
   P-VS-00 Map draws `PROCESSING`. The Film status phase tag for `collecting` is `Uploading`
   (section 4a, boards 03, 05, 07, 08). So the card says PROCESSING while the match detail says
   UPLOADING.
   **Fix:** one word for `collecting` everywhere. Recommend `Uploading` (matches the phase tag), and
   reserve `Processing` for an angle row. Update section 9 (both the table and the priority list) and
   P-VS-00.
2. **Timekeeper "Building ... from 3 angles" while one angle is still Processing** (P-VS-08, slice
   "Timekeeper view: building"). `{n}` is `angles_used`; an angle still processing is by definition
   not used. **Fix:** `from 2 angles`, and give the processing row the late-angle helper (see M4).
   Add a contradiction rule: `{n}` in any phase line must equal the number of rows that are `ready`
   and in `angles_used`.
3. **Playable affordances for film that is not playable.**
   - P-VS-03 (verdict, one angle uploading 42%): the primary red CTA reads `Watch film` while the
     plate says "Your film is on its way."
   - P-VS-06 / P-VS-07 (match detail): the hero shows a play button and `06:00` duration, and the
     angle switcher offers `D. Okafor's angle` (uploading 64%) and, on 07, has `Your angle` selected
     while your angle is Paused.
   **Fix:** the CTA label follows the phase: `Open match` (or `See film status`) until at least one
   angle is `ready`, then `Watch film`. The match detail hero shows the poster without a play button
   until the selected angle is `ready`, and the angle switcher lists only `ready` angles (others
   appear only as Film status rows). Add these to the contradiction rules in section 9 and draw them
   on 03, 06, 07.

### B2. "Try again" and helper copy for YOUR paused angle on a device that did not record it

COPY-DECK 2a `upload_paused` always shows `Try again` and the helper "No connection right now. It
picks up where it left off." On a second device of the same athlete (iPad, or after switching phones)
the server reports `upload_paused`, retry is a local action that cannot work there, and "No
connection right now" describes the wrong phone. This is the cross-device case the owner called out.
**Fix:** split 2a `upload_paused` like `waiting_for_phone` already is: on the recording phone (local
job exists) use section 3; on any other device use tag `Paused`, helper `Open ELO RATED on the phone
that recorded to finish the upload.`, no action. Same rule for `abandoned` with `Try again`. Draw the
other-device variant on P-VS-09.

---

## Major

### M1. "Keep the app open to finish faster" is untrue before background upload ships

Used on P-VS-03, 08, 09, 17. Until jits-n2im.9 (background upload) ships, a backgrounded or locked
phone pauses the upload (that is the prod 5.6 min incident), so "faster" implies it finishes anyway.
The timekeeper "after" screen (P-VS-17) also says "keep the app open" three times with two different
endings.
**Fix:** pre-background-upload string `Keep the app open until it finishes.` Add a gated
post-B1 variant to the deck now (jits-n2im.1 already asks for a capability flag): `It keeps
uploading if you leave the app.` On P-VS-17 keep it once (the plate helper), drop the body sentence
duplicate and the row helper.

### M2. "Opponent never uploads" has no end state after the wait (scenario 4)

`waiting_for_phone` and `upload_paused` persist until the 7-day reaper (`jr_be-1qz.1`), and the late
angle window is 24 h (owner rule). After the 10 min gate the phase goes `building` then `ready`, but
D. Okafor's row keeps saying "It uploads when ELO RATED is open on D. Okafor's phone." for up to 7 days,
and nothing tells M. Reyes whether his reel will still change. The building helper "If D. Okafor's
angle arrives later today, we'll add it" also breaks at night ("today") and disagrees with 24 h.
**Fix:**
- Building/ready helper: `If D. Okafor's angle arrives in the next 24 hours, we'll add it.`
- Row helper for another competitor's `waiting_for_phone` / `upload_paused` once phase is `ready`:
  `It can still be added to your highlight until {time}.` (server time = dispatched_at + 24 h; needs
  a field in the RPC, see F2).
- After 24 h: tag `Not in your highlight`, helper `It will still be watchable if it uploads.` (info
  grey). Draw both on P-VS-09 and add a row to P-VS-00.

### M3. Red with nothing to do

P-VS-09 last "Your angle" row: `Didn't upload` + "The clip is no longer on this phone." in red with the
alert glyph and no action. COPY-DECK 0.5/0.7 say red is only for a failure the viewer can act on.
COPY-DECK 2a also marks all `abandoned` as `act`, but P-VS-08 ("No film: none usable") draws the same
state grey. **Fix:** `abandoned` is `act` (red + `Try again`) only when the file is on this phone;
otherwise `info` grey with the honest helper. Same for section 8 terminal causes (file missing, too
long, match can't take video): grey, no red, since there is nothing to do.

### M4. Late angle after a share or edit is specified but not drawn; reel failed not drawn

COPY-DECK section 5 defines the shared/edited case ("Your reel stays as you shared it.") and reel
`failed` ("We couldn't make your highlight reel." + Try again), but neither appears on P-VS-08, 05 or
18. These are owner-decision states (late angle rule) and must be reviewed visually. **Fix:** add
both to P-VS-18 and the shared/edited helper to P-VS-08. Also define what the Film status helper says
during `ready` when an angle is still processing after dispatch (B1.2): `D. Okafor's angle is being
processed. If it's in within 24 hours, we'll add it.`

### M5. "Ready, film only (no reel possible)" has no defined reason

COPY-DECK 4a says the helper is "reel-state reason from section 5", but section 5 has no reason for
"no reel"; `none_dominant_fallback` still produces a reel. P-VS-08 invents "We couldn't find a clear
highlight of you in this video." **Fix:** map it explicitly: reel `failed` -> section 5 failed copy
with Try again; plan produced no reel -> the P-VS-08 string, added to section 5 with its trigger.
Confirm with jr_be-1qz.15 which reel state the server emits for "no reel possible".

### M6. Copy drift between deck and boards for the same state

Same state must read the same everywhere (owner rule). Found:
| State | Deck | Board |
|---|---|---|
| local paused, indicator | `No connection right now. It picks up where it left off.` | P-VS-02: `No connection. It picks up where it left off.` |
| local paused, Film Room | badge `Upload paused` only | P-VS-10: adds `Resumes when online` |
| waiting_for_angle helper | `Your highlight uses both angles if it arrives. If not, we build it from what's in.` | P-VS-06: `Your highlight uses every angle that arrives in time. If one is late, we build from what's in.` |
| collecting, competitor | `Your film is on its way.` / `Film is coming in from {k} phones.` | P-VS-05 slice 2: `Film is coming in.` (that is the timekeeper string, 4b) |
| uploading, Film Room | badge `Uploading {pct}%` | P-VS-10: centred text + bar, no badge |
| local notification | deck: `Upload paused` / `Open ELO RATED to finish uploading your match video.` | jits-n2im.1 bead: `Your match film is still uploading. Open ELO RATED to finish.` |
**Fix:** pick the deck string in each case (or update the deck), regenerate the boards, and amend
jits-n2im.1's notes so the build uses the deck copy. Suggest a lint in the build bead: all status
strings come from one `video-status-copy.ts` keyed by (relation, state, phase).

### M7. Waiting line names only one angle when two are pending

P-VS-06: "Waiting up to 10 min for D. Okafor's angle." while J. Cruz's angle is also Paused. **Fix:**
template for 2+ pending: `Waiting up to 10 min for 2 more angles.` Add to 4a and 4b.

### M8. Push for an abandoned upload promises a retry that usually cannot happen

Per jr_be-1qz.1, `abandon_match_video_upload` is called when the manager gives up (missing file,
7-day expiry, user discards), and the reaper only fires after 7 days. In nearly every path there is
nothing to retry, yet the push says "Open ELO RATED on the phone that recorded to try again." and the
bell says "Tap to try again". It would also be a second push for the match in some orders. **Fix:**
drop the `upload_abandoned` server push (see Q3); keep the in-app grey row. If kept, the copy must not
promise a retry.

### M9. Feasibility: "Paused: their phone is offline or the app is closed" will be wrong after background upload

`upload_paused` = heartbeat older than 2 min. Heartbeats come from JS (`touch_match_video_upload`,
at most every 30 s). After jits-n2im.9, a native background upload moves bytes with no JS running,
so other viewers will see "Paused, their phone is offline or the app is closed" while it is actually
uploading. Even now the claim about the other person's phone is a guess. **Fix:** neutral helper that
is true in both worlds: `We haven't heard from {name}'s phone for a few minutes. It picks up where it
left off.` Flag to jits-n2im.8/.9: the native uploader should report bytes (or the server should
read storage progress) so `uploading` stays truthful in the background.

### M10. Feasibility: countdown and extension need explicit server fields

- **Clock skew:** `{mm:ss}` from `wait_deadline_at` minus device time is wrong on a phone whose clock
  is off, and two phones will show different countdowns. **Fix:** the RPC returns `server_now`; the
  client computes an offset once per fetch.
- **Extended wait detection:** README assumption 4 infers "extended" from the other angle being
  `processing`. During the first 10 minutes the other angle can also be `processing`, so the client
  would show "Giving it up to 10 more min" too early. **Fix:** RPC field `wait_extended boolean` (or
  `wait_reason`), owned by jr_be-1qz.9/.20.
- **Late-window end:** M2 needs `late_angle_until` (dispatched_at + 24 h) in the RPC.
- **Pre-F1 sequencing:** jr_be-1qz.20 ships before jr_be-1qz.9; until then the server never emits
  `waiting_for_angle` and per-video planning still sends one push per video. The client copy that
  promises one push and "uses both angles" must be gated on F1 + 1qz.15 being live. Note it in the
  build bead (jits-n2im.25).
These are cross-repo asks for jr_be (`jr_be-1qz.20`, `jr_be-1qz.9`).

### M11. "No one recorded it" can be false during rollout

`not_recording` = intent false OR no intent and no row. Old app builds never write intents
(jr_be-1qz.4 says missing intent = unknown) and, before the reservation client ships, insert the row
only after all bytes are up. So for minutes after the match, a match that an old build is uploading
reads "No film for this match. No one recorded it." and then flips to collecting. **Fix:** until
`angles_expected` is known (intent rows present) or a grace window passes (suggest 15 min after
match end), use `No video yet.` / `If someone recorded, it will show up here.`; only then show
`no_film`. Needs a server rule in 1qz.20.

### M12. "Keep time" / "You're the timekeeper" for a role that does not keep time

Owner decision: the timekeeper is record-only. Yet the join screen is titled "Keep time", the CTA is
"Join as timekeeper" and the joined screen headline is "You're the timekeeper", followed by "You don't
run the clock". The name contradicts the role on every screen. **Fix (owner call):** keep the
backend role name but use user copy `Film the match` (screen title), `Join to film`, `You're filming`,
tag `Record only`, and on competitor phones `Camera: J. Cruz` / row title `Third camera`. If the owner
wants to keep "Timekeeper", at minimum retitle P-VS-14 from "Keep time" to "Join a match".

### M13. Touch targets below 44 px on new controls

All new action buttons are `min-height: 36px`: `Try again` (P-VS-02 strip, 05, 07, 09, 10 Film Room
card), `Upload now` (09), `Add` (12). The compact match flow line and reel controls are correctly 44.
**Fix:** 44 px min height, or 36 px visual with a 44 px hit area (hitSlop) stated on the board.
(Header controls at 28 px on P-VS-01 are copied from the shipped Home and are out of scope here.)

### M14. Screen reader behaviour of live regions

P-VS-03 to 08 and 17 wrap the whole plate (rows, percent and countdown) in `aria-live="polite"`;
P-VS-08 has 12. On device that means an announcement every percent change and every countdown tick,
and on iOS `accessibilityLiveRegion` does nothing at all (open bead jits-5tj9.2). Progress rows also
have no progress semantics (the bar is `aria-hidden`, the percent is bare text).
**Fix:** specify in the deck: announce only phase changes and row state changes via
`AccessibilityInfo.announceForAccessibility` (both platforms); each row is one accessible element
labelled `D. Okafor's angle, uploading, 18 percent` with `accessibilityRole="progressbar"` and
`accessibilityValue {min:0,max:100,now}`; the countdown is announced at most at 5, 1 and 0 minutes.

---

## Minor

1. **COPY-DECK 0.5 vs 0.7 vs README rationale 4.** 0.5 says another person's problem is "shown in
   neutral grey"; 0.7 and the boards make another person's waiting/paused amber; README says amber
   while recoverable, grey once final. The README version is what the boards do and is sound. Reword
   0.5 to match.
2. **Light theme not specified.** The deck lists dark hex values only. The app has a light theme;
   name tokens (`attention`, `ink-2`, `ink-3`, `negative`) rather than hex, and note light
   `attention` is `#92400E`. Boards can stay dark.
3. **Local paused helper "Paused while the app was closed. Open the app to finish."** (section 8) is
   read inside the app, where the manager already resumes on foreground. Use `It paused while the app
   was closed. It's picking up again now.`
4. **2a `waiting_for_phone` "Upload now"**: see Q7; without a local job there is usually no file
   reference to upload from.
5. **P-VS-18 "Version 1 · 2 angles" then "Version 2 · 2 angles" with "Updated with D. Okafor's
   angle."** The angle count should rise (v1 = 1 angle). Also consider dropping "Version {n}" from
   the user meta; the late-angle line already explains the change.
6. **Section 2b `abandoned` helper "Your reel uses your angle."** says nothing about the other
   angle; fine, but use the same noun as the rest of the line (see Q10).
7. **Timekeeper missing states:** camera permission denied on P-VS-14; competitor face-off row after
   a timekeeper joined (`{name} is recording`, defined in section 10, not drawn on P-VS-12); what
   happens if both competitors tap Add (one code per match?); the match is cancelled or the
   timekeeper taps Leave mid-recording; landscape recording (jits-n2im.16 says landscape-capable).
8. **Where the timekeeper finds the match later.** After `Done` on P-VS-17 the only way back is the
   push. State where the match appears for them (Film Room? Profile?), or note it is push and bell
   only.
9. **Retry feedback** (section 8: shake + VoiceOver "Still can't upload. Check your connection.")
   is not drawn; the "Any second now" countdown state is not drawn; strip `Upload failed` +
   `Details` (terminal) is not drawn. Add one frame each to P-VS-02 / P-VS-08.
10. **Push body vs shipped bell copy.** Deck says "(existing copy)" for `Your reel vs {opp} is ready.
    Tap to watch.`; shipped bell body (`lib/highlight/discovery.ts:44`) is `Your reel vs {opponent} is
    ready to watch.` Confirm the push body in the jr_be push function and quote it exactly.
11. **jr_be-1qz.16 still lists an `angle_arriving` push and a separate `film_ready` push.** The deck
    correctly says never / folded; the deck's `no_film` and timekeeper pushes are new types. The bead
    (and jits-n2im.13, which still names angle_arriving) need amending so build follows the deck.
    Cross-repo: jr_be.

## Nits

1. Board titles in the delta read "Proposed: Video status: states x surfaces (placement map)" (double
   colon); consider "Proposed: video status placement map".
2. Sample data: verdict boards show `+17, 1487 -> 1504`, match detail boards `+18, 1469 -> 1487` for
   the same match (inherited from the live boards 29 and 32). Harmless, but a reviewer comparing
   boards will trip on it.
3. P-VS-12 "Record from my phone" sub-label `D. OKAFOR RECORDING` is ambiguous next to a
   timekeeper row; consider `D. Okafor is recording too`.
4. Fallback reel line: "The camera didn't catch..." is fine; see Q6 for a softer variant.

---

## Scenario walk (summary)

| # | Scenario | Result |
|---|---|---|
| 1 | Both phones upload fine | Clear on every surface once B1 (CTA, switcher) is fixed. One push. |
| 2 | My phone locked mid-upload | Local notification and Paused + Try again are clear; "finish faster" (M1) and "Open the app to finish" inside the app (minor 3) mislead. Second device needs B2. |
| 3 | Opponent's phone locked | Clear and non-blaming; helper wording should not assert why (M9). |
| 4 | Opponent never uploads (10 min) | Clear until the reel ships; then no end state for 24 h / 7 days (M2). |
| 5 | Late angle after reel shipped | Silent update drawn; shared/edited variant and processing-at-dispatch helper missing (M4, B1.2). |
| 6 | Timekeeper third angle | Flow is clear and record-only is explicit; naming contradicts the role (M12); building count wrong (B1.2). |
| 7 | Nobody recorded / no usable film | Clear and reassuring ("result and rating aren't affected"); false during rollout (M11). |

## Canvas format compliance: PASS

- All 19 boards: the exact `<script src="./support.js"></script>` line in `<head>` (byte-identical to
  live 29-Verdict and P-Verdict), one `<x-dc>`, root `width/height` equal to the board w/h in
  `canvas-delta.json` and `boards.json`, `$preview` equal to the same, and the `data-dc-script` is the
  standard static `renderVals() { return {}; }` (no script-built UI).
- `canvas.next.json` vs live `canvas.json` (version `1790970841-9c7a`): every existing key, board,
  note, page and the order prefix unchanged; additions only: 1 page (`video-status`), 19 boards all on
  that page, 3 notes, 19 order entries. No board overlaps on the new page. "Current app" and
  "Proposed (Sept 30 review)" untouched.
- No em dashes in any file. No emoji in copy.
- Reminder for the coordinator: the live version can move before publish; re-read `canvas.json` and
  merge the delta into that copy, as the README already says.

## Scope

- Boards 12 to 17 (timekeeper join and record-only flow) are jits-n2im.16's design deliverable and
  P-VS-18's mute toggle is jits-n2im.27's. Including them is useful context, but approving this page
  also approves those flows; record that on those beads, or mark those boards "context, separate
  approval".
- Missing boards are listed in M2, M4, B2, minor 7 and minor 9. No other scope creep found; music is
  correctly absent.

---

## Recommendations on the designer's 10 open questions

1. **Strip on the same match's screens:** agree with the proposal (hide on that match's verdict and
   match detail; the plate is the fuller view and the strip would duplicate it). Record it as an
   amendment to jits-n2im.2 AC1 in the bead notes so the build test matches.
2. **"No film" push:** yes, only when at least one angle was expected. But define the trigger,
   because with an expected angle that never arrives the phase stays waiting for up to 7 days: fire
   when every expected angle is settled as unusable, or when the 24 h late window closes with no
   usable angle, whichever is first. It is that athlete's one push.
3. **Exceptions to one push:** (b) yes, the device-local notification when backgrounded mid-upload;
   it is local, about the user's own action, and the only thing that rescues scenario 2 before
   background upload. (a) no server push for abandoned uploads (M8: abandon is almost always
   terminal or self-initiated, so there is nothing to act on); show it in-app only.
4. **Late angle after a share or edit:** offer it quietly in-app: one line on the reel card / Film
   status, `D. Okafor's angle is in. Make a new version`, no push, no badge, reusing the existing
   version flow. If jr_be-1qz.15 cannot support a user-triggered re-render this release, ship only
   the informational helper and nothing else.
5. **Timekeeper push timing:** when the phase reaches `ready` (or `no_film`), as proposed: one push,
   and it matches what they came for. Change the body: "Every angle is in" / "Tap to watch every
   angle" can be false when an angle missed the wait; use `{A} vs {B}. Tap to watch the film.`
6. **Fallback reel copy:** the framing is acceptable and honest. Slightly softer and less
   hardware-blaming: `We couldn't find a clear moment of yours, so this highlight shows the match's
   best moments.` Keep calling it a highlight; a separate name adds a concept for little gain.
7. **"Upload now" for waiting_for_phone on the same phone:** show it only when the client can locate
   the clip file (via the persisted upload/recording index), never on the server state alone. Without
   the file, show `Not uploaded` with helper `The clip isn't on this phone anymore.` (grey).
8. **Timekeeper visibility of reels:** agree, angles and film only this release. Once a player shares
   a reel publicly, the timekeeper sees it like anyone else would; no special access.
9. **Countdown after the deadline:** "Any second now" is fine, but it will not be rare: dispatch at
   the deadline runs on a 1 min cron (jr_be-1qz.9), plus realtime debounce. Ask jr_be to schedule
   the deadline dispatch precisely (or run the cron every 15 to 30 s around open deadlines), have the
   client re-fetch the RPC at the deadline, and after 90 s past it show the building copy optimistically
   only if the server agrees on the next fetch. Pair with `server_now` (M10).
10. **"Highlight" vs "reel":** pick one user-facing noun for status, push and bell: **highlight**
    (it is already the push title and the card title). Keep "reel" only inside the player chrome
    (`28s`, mute) if at all. That turns "Your reel uses D. Okafor's angle" into "Your highlight uses
    D. Okafor's angle" and removes a source of "is this the same thing?" confusion.

---

## Assumptions and open questions for the coordinator

Assumptions:
1. jr_be-1qz.20's angle state for a row that reached storage but is still slicing is `processing`, as
   the bead's enum says (so the owner's "+10 if bytes are in" maps to `processing`).
2. Background upload (jits-n2im.9) will not send JS heartbeats unless designed to, as stated in M9.
3. The boards' Current-app chrome (Home, verdict, match detail, Film Room) was copied from the live
   boards by `generate.py` and is not under review here.

Open questions:
1. Does the owner want the timekeeper renamed in user copy (M12)?
2. Will jr_be add `server_now`, `wait_extended` and `late_angle_until` to the RPC (M10, M2)?
3. Should boards 12 to 18 be approved here or on jits-n2im.16 / .27 separately?
