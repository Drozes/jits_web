# Independent UX review, round 2: match video status v2 (jits-n2im.24, jits-n2im.2)

Reviewer: the same independent agent as round 1 (did not author the copy deck or the boards).
Date: 2026-10-05. Scope: `COPY-DECK.md` v2, `README.md` v2, `generate.py` (with `TERM`), boards
`project/P-VS-00` to `P-VS-19`, `canvas-delta.json`, `canvas.next.json`, `boards.json`. Read only:
no proposal file was edited and nothing was published.

**Verdict: APPROVE WITH CHANGES.**

Every round 1 blocker is fixed **on the rendered boards**, not just in the deck. Every round 1 major
is fixed or explicitly pending the owner (M12). No new blocker. Two new majors remain. Both are spec
gaps at the edge of the server contract, not board redesigns:

1. The long tail when no build ever starts.
2. The shipped "new version" push colliding with the silent late-angle re-render.

Each is fixed by a deck line and a backend-ask row. They can be checked by the coordinator without a
third full review round. The minors below should be fixed before publish but do not need another
review.

Not blockers, pending the owner (as instructed): third camera naming (M12, drawn as "Third camera /
You're filming / Sideline") and highlight vs reel (`TERM`, drawn as "highlight").

## How this was checked

- Re-rendered all 20 boards with headless Chrome at board size, in 1200 px slices (support.js
  stubbed), and read every frame.
- Re-ran the contradiction check across surfaces (strip, compact line, verdict, Film status, Film
  Room, highlight card, push, bell, map) for every state in deck sections 2 to 9.
- Re-read the LIVE `project/canvas.json` with the Artifact tool on 2026-10-05: **version unchanged,
  `1790970841-9c7a`** (same sha256 `b809c439...` as in round 1).
- Checked the shipped push copy in jr_be `origin/development`
  `supabase/functions/push/highlight-payload.ts` (it gave the second new major).

---

## Round 1 findings: verification on the rendered boards

| Finding | Status | Evidence |
|---|---|---|
| B1.1 collecting word | **Fixed** | Map: Film Room `UPLOADING` for collecting, "never PROCESSING". Phase tags on 03, 05, 07, 08 and 17 are `UPLOADING`. Deck §9 priority list matches. |
| B1.2 `{n}` vs processing row | **Fixed** | P-VS-08, third camera building: "from 2 angles", and the processing row says "It can still be added until 9:42 PM." Rule 3 added. |
| B1.3 playable affordances | **Fixed** | P-VS-03 CTA `OPEN MATCH`. P-VS-07 hero has no play button or duration ("No still yet / Still arrives after upload"). The switcher is gone on 06 and 07 (fewer than two ready). P-VS-04 has `WATCH FILM` with your angle ready. Residual nit: see m4. |
| B2 your angle on another device | **Fixed** | P-VS-09 has an "On another device (no Try again)" group with "Open ELO RATED on the phone that recorded..." helpers. |
| M1 "finish faster" | **Fixed** | "Keep the app open until it finishes." on 03, 08 and 09. P-VS-17 says it once (plate helper). A flag-gated post-background variant is in deck 2a. |
| M2 opponent never uploads | **Fixed for the after-dispatch case** | 05, 08 and 09 show "until 9:42 PM", "in the next 24 hours" and `NOT IN YOUR HIGHLIGHT`. Residual: see new major N1. |
| M3 red with nothing to do | **Fixed** | 02 terminal strip and compact line are grey. On 08 and 09, "clip isn't on this phone anymore" is grey. Red appears only with Try again. |
| M4 late angle after share or edit, highlight failed | **Fixed** | P-VS-18 "New angle available." + `MAKE A NEW VERSION`, and the failed card + `TRY AGAIN`. P-VS-08 helpers. |
| M5 film-only reason | **Fixed** | P-VS-08 "Film only: no highlight possible" and "highlight failed". Reel state `none` is in the backend asks. |
| M6 drift | **Fixed for every listed string** | Paused helper, Film Room paused, waiting helper and competitor collecting line all match the deck now. New small drifts: m1 to m3. |
| M7 two pending | **Fixed** | P-VS-06 "Waiting up to 10 min for 2 more angles." |
| M8 abandoned push | **Fixed** | Removed from push and bell (P-VS-11). |
| M9 paused guess | **Fixed** | "We haven't heard from {name}'s phone for a few minutes..." on 06 and 09. |
| M10 server fields | **Fixed (designed, asks filed)** | README "Backend contract asks": `server_now`, `wait_extended`, `late_angle_until`, precise dispatch. "Any second now" is drawn on P-VS-08. |
| M11 rollout "nobody recorded" | **Fixed** | "No video yet" pre-grace state on 05, 08 and the map. Rule 7. |
| M12 naming | **Pending owner (not a blocker)** | Drawn as Third camera / Film a match / Join to film / You're filming / Sideline / Record only on 12 to 17 and 19. |
| M13 touch targets | **Fixed** | Every new control (Try again, Upload now, Add, Open Settings, Make a new version, Keep and Stop filming, Done) is 44 px or more. Remaining sub-44 controls (Home header chip 28 px, Film Room filters 36 px, face-off switch 30 px) are shipped chrome copied from live boards. |
| M14 live regions | **Fixed** | No `aria-live` or `role="status"` on any board. Uploading rows are `role="progressbar"` with `aria-valuenow` (03 to 06, 08, 09, 17). Deck §10 specifies announce-on-change. |
| Minors 1, 2, 3, 6, 7, 9, 10, 11 | **Fixed** | Deck 0.5 reworded. Token names with light values. Backgrounded helper reworded. One noun via `TERM`. P-VS-19 covers joined, camera denied, join errors, leave while recording, cancelled and landscape. 02 has the retry-failed and terminal strips. Shipped bodies are quoted. Backend asks are listed. |
| Minor 5 (Version {n}) | **Ruled: designer's position accepted** | See "Ruling on minor 5" below. The angle count now rises correctly (Version 1 · 1 angle, Version 2 · 2 angles). |
| Minor 8 (where the third camera finds the match) | **Partly** | See m5: P-VS-17 now promises a Film Room listing that is still an open question. |
| Nits 1 to 3 | **Fixed** | No double colons. Verdict and match detail sample data match (+18, 1469 to 1487, Armbar 04:12). "D. Okafor is recording too". |

## Ruling on minor 5 ("Version {n}" in the highlight meta)

**Accept the designer's position: keep "Version {n}".** It is shipped copy (`viewer-meta.tsx`:
"{duration}s · Version {n}"), and the share/edit flow and the shipped regen push already speak in
versions ("Your new version is ready"). It is also the only visible cue that a silent late-angle
re-render happened, alongside "Updated with D. Okafor's angle." My round 1 concern was the angle
count not changing, and v2 fixes that. One condition: keep the version number in sync with the
server's `reels[].version`, so the meta never shows a version the athlete cannot find in the version
flow.

---

## New findings

### Blockers

None.

### Major

#### N1. No end state when no build ever starts (every expected angle stays pending)

The 24 h window is defined as `late_angle_until = build dispatch + 24 h` (README backend asks, deck
`{until}`). When nothing is ever analyzed, there is no dispatch, so `late_angle_until` is null. This
happens when both competitors recorded and neither phone ever uploads, or when the only recorder
never uploads. In that case:

- the phase stays `collecting` ("Film is coming in from 2 phones." / "Your film is on its way.") and
  the rows stay "Waiting for their phone" / "Waiting for your phone" until the 7-day reaper
  (`jr_be-1qz.1`);
- the "No film" push trigger in deck §6 ("`late_angle_until` passes with no usable angle") can never
  fire, so the athlete waits for a week. This is the outcome Q2 was resolved to prevent.

**Fix (deck §6, §4a, §9 and the README asks):** define the window end as
`film_window_until = coalesce(dispatched_at, match_completed_at) + 24 h` and have the RPC return it.
When it passes with no usable angle, the phase becomes `no_film` (helper "None of the video came in.
Your result and rating aren't affected.") and the "No film" push fires. Draw one frame on P-VS-08
("Collecting, window closed") or note it in the map row "Late window closed". Owner: jr_be-1qz.20 and
jr_be-1qz.16.

#### N2. The shipped "new version" push would break the one-push rule on a late-angle re-render

Shipped jr_be `supabase/functions/push/highlight-payload.ts:99-107` sends a second push, "Your new
version is ready" / "Version {n} of your reel vs {opp} is ready.", whenever a highlight row with
`origin = 'regen'` and `version > 1` becomes ready. The deck says a late-angle re-render never pushes
(§5, §6), but it does not say how the server tells that re-render apart from a user regen. If
jr_be-1qz.15 implements the silent re-render as a regen (the natural path, since it bumps `version`),
every late angle triggers a second push. That is exactly the owner's "never a second push" case.

**Fix:**
- Deck §6: add a row "Late-angle re-render (`origin = 'late_angle'`, or a push-suppression flag):
  never pushes."
- Add a backend ask for jr_be-1qz.15 / .16: the re-render uses a distinct origin that the push
  function skips, with a test.
- Rule on the user-initiated "Make a new version" (P-VS-18). It is the athlete's own request, so
  keeping the shipped "Your new version is ready" push is defensible. But it is a second push for the
  match, so record the owner's call. My recommendation is to keep it, because the athlete asked for
  it.

### Minor

- **m1. `{Term}` capitalizes mid-sentence.** The push and bell titles render "Your Highlight is ready"
  (P-VS-11 push and bell, P-VS-00 map). Shipped copy and house sentence case are "Your highlight is
  ready" (`highlight-payload.ts:109`, `discovery.ts:15`). **Fix:** use `{term}` in those titles and
  keep `{Term}` only at the start of a string (for example the "Highlight card" board title).
- **m2. Film Room badge renders "BUILDING highlight".** On P-VS-10 the substituted term is not
  uppercased with the rest of the mono caps badge. In RN the style uppercases it anyway, but the
  board misrepresents the result. **Fix:** apply `text-transform: uppercase` to the whole badge
  string in `generate.py`.
- **m3. New strings not in the deck.**
  - P-VS-10 no-film card centre text "NO FILM RECORDED". It is also false for the "none usable" case,
    where film was recorded. **Fix:** drop it (the `NO FILM` badge carries the state) or add one deck
    string per cause.
  - The upload strip says `Upload failed` while the Film status row says `Didn't upload` for the same
    local failed state (02 vs 08/09; the compact line uses both: "upload failed" for retryable,
    "didn't upload" for terminal). The deck §3 table specifies this, so it is consistent with the
    deck, but it is two words for one state across surfaces. **Fix:** pick one. I'd use
    `Didn't upload` everywhere, since it does not blame the network or the user.
- **m4. P-VS-06 hero duration `06:00` vs the only ready angle `4:31`.** Your angle is the only ready
  angle, so the hero is playing it, and the two durations for the same video disagree. The value is
  inherited from live board 32. **Fix:** the hero shows the selected angle's duration (4:31).
- **m5. P-VS-17 promises "the match stays in your Film Room"** to the third camera. README open
  question 4 says that Film Room listing (with a `Filmed` tag) is not drawn and not confirmed. **Fix:**
  until the owner confirms, use "You'll get a notification when the film is ready." only, or draw the
  `Filmed` Film Room card.
- **m6. Fallback copy before the backend fields exist.** README assumption 3 says the client hides
  the "until" helpers, the extended-wait copy and the countdown digits until `late_angle_until`,
  `wait_extended` and `server_now` ship. It does not name what shows instead for after-dispatch rows.
  **Fix:** one line in deck §2c: without `late_angle_until`, use the building helper "If {name}'s
  angle arrives in the next 24 hours, we'll add it." on the plate and no row helper.
- **m7. `{p}` is used in §4a and §4b ("for {p} more angles") but not defined** in the Variables table.
  **Fix:** define `{p}` = count of expected angles not yet settled and not in `angles_used`.

### Nits

1. Board file names still say "Timekeeper" (`P-VS-12-Faceoff-Timekeeper` ... `P-VS-17`). The titles
   are correct, and the file names are internal, so leave them until the M12 naming decision. Renaming
   after publish would orphan boards, so if "Third camera" wins, decide before the first publish.
2. P-VS-03 `OPEN MATCH` keeps the film (clapperboard) icon. Consider the chevron or no icon so the
   icon does not imply playback.
3. The building helper ("in the next 24 hours") and the row helper ("until 9:42 PM") say the same
   deadline two ways on one plate (P-VS-05 "Wait ended"). This is acceptable. Consider dropping the
   row helper when the plate helper already names the same angle.

---

## Contradiction re-check (every state, every surface)

I walked deck §2a to §2e x §4a/§4b x §5 against the map (P-VS-00), the strip and compact line (02),
the verdict (03 to 05), the Film status (06 to 09), the Film Room (10), the highlight card (18), and
push and bell (11). Apart from m3 (two words for one local failed state), m4 (hero duration) and N2
(regen push), no two surfaces disagree. In particular:

- collecting reads `Uploading` on every surface;
- `Processing` appears only on angle rows;
- the `{n}` count matches the ready rows on every building frame;
- no surface offers playback before an angle is ready;
- red appears only with Try again on the recording phone.

Third camera view checked on 08 and 17.

## Canvas format compliance: PASS

- **Live canvas version:** `1790970841-9c7a`, unchanged since round 1 (same sha256). The delta's
  `based_on_canvas_version` matches.
- **Additive only:**
  - Merging `canvas-delta.json` into the live `canvas.json` gives exactly `canvas.next.json`.
  - No existing board, note, page or top-level key changes, and the order prefix is identical.
  - The additions are 1 page (`video-status`), 20 boards (all on that page), 3 row notes and 20
    order entries. There are no board overlaps.
  - "Current app" and "Proposed (Sept 30 review)" are untouched.
- **All 20 boards:**
  - Each has exactly one `<script src="./support.js"></script>`.
  - The root width/height equals the delta w/h, `boards.json` and `$preview`.
  - The `data-dc-script` is the static `renderVals() { return {}; }` (no script-built UI).
- No em dashes in any proposal file.
- Coordinator reminder: re-read `canvas.json` right before publishing. If its version has moved,
  merge the delta into the fresh copy, not into `canvas.next.json`.

## Scope

The README now states the approval scope: P-VS-12 to 17 and 19 cover jits-n2im.16, and P-VS-18's mute
covers jits-n2im.27. Record the approval on those beads too. The new board P-VS-19 closes the
missing timekeeper states without adding scope. Music is correctly absent.

---

## Assumptions and open questions

Assumptions:
1. jr_be-1qz.15 will implement the late-angle re-render by bumping `video_highlights.version`, which
   is why N2 matters. If it uses a different mechanism that never reaches the push trigger, N2
   reduces to documenting that.
2. `match_completed_at` (or an equivalent match end timestamp) is available to the RPC for N1.

Open questions for the coordinator and owner:
1. N2: should a user-initiated "Make a new version" keep the shipped "Your new version is ready" push
   (my recommendation), or stay in-app only under the one-push rule?
2. N1: is 24 h from match end the right film window when nothing ever arrives, or should it match the
   15 min grace plus the 10 min wait (shorter, so athletes learn sooner that there is no film)?
3. The still-pending owner items: third camera naming (M12) and highlight vs reel (`TERM`). Decide
   naming before the first publish if the board file names should change.
