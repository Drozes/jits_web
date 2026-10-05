# Proposed (Oct 4 video status): boards, rationale, open questions (v2.2)

Beads: jits-n2im.24 (status UX copy deck and proposed boards), the design part of jits-n2im.2
(app-wide upload indicator). Server model: jr_be-1qz.20. Pushes: jr_be-1qz.16 as amended by the
owner's one-push rule. Status: DRAFT v2.2 (round 2: APPROVE WITH CHANGES, applied; owner naming decisions of 2026-10-05 applied), NOT PUBLISHED. Round 1 review: `REVIEW-round1.md` (REQUEST
CHANGES); v2 applies every finding (see "Round 1 resolutions" below).

**Approval scope.** Approving this page also approves the timekeeper (record-only) join and
record-only flow, boards P-VS-12 to P-VS-17 and P-VS-19 (jits-n2im.16's design deliverable), and the
mute toggle on P-VS-18 (jits-n2im.27). Record the approval on those beads too.

## Files

| File | What it is |
|---|---|
| `COPY-DECK.md` | v2: every state x surface x viewer string, failure and retry copy, placement map, contradiction rules, accessibility rules, timekeeper flow. |
| `project/P-VS-*.dc.html` | 20 board files for the new canvas page (Design type format, 390 px dark; the map board is 1440 px wide). |
| `canvas-delta.json` | Additive canvas.json delta: one new page, 20 boards, 3 row titles, order entries. |
| `canvas.next.json` | The delta merged into canvas.json as read at version `1790970841-9c7a`. Reference only. |
| `boards.json` | Board sizes the generator wrote. |
| `generate.py` | Regenerates the boards: `CANVAS_SRC=<folder with the live 29/31/32/48 boards> python3 generate.py <heights.json>`. `TERM_APP` (highlight, in-app screens) and `TERM_NOTIFY` (reel, push and bell bodies) at the top set the two nouns. |
| `REVIEW-round1.md` | The independent review this version answers. |

## Publishing (coordinator only, after review)

1. Read `project/canvas.json` from the canvas and merge `canvas-delta.json` into that fresh copy
   (append the page, add the boards and notes, append the order). No existing key changes.
2. Publish with `url` = https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D, sending the 20
   `project/P-VS-*.dc.html` files plus `project/canvas.json`.

## UX rationale

1. **One source of truth, everything else is a digest.** The match detail Film status plate is
   canonical; the verdict uses the same component and strings, and the Film Room badge and upload
   strip follow one priority order. Each state has exactly one string (the build keeps them in one
   copy module with a lint test).
2. **Nothing offers what isn't there.** The verdict CTA says "Open match" until an angle is ready;
   the match detail hero has no play button and the angle switcher lists only ready angles.
3. **Rows per angle, labelled by owner,** with a separate variant for "your angle" on a device that
   did not record it (no Try again there).
4. **Every waiting state says what happens next,** including the 24 h late window ("can still be
   added until 9:42 PM") and its end ("Not in your highlight").
5. **Color carries ownership and actionability.** Red only for your own upload, on the recording
   phone, when Try again can work. Another person's angle is amber while it can still arrive and grey
   once final, described by what the server knows, never by guesses about their phone.
6. **Quiet for screen readers.** No live regions; announcements only on phase and row changes; rows
   expose progress semantics.
7. **One push per athlete per match.** The "No film" push replaces the highlight push when nothing
   usable arrives. The only other notification is device-local (upload paused while the app is
   closed).
8. **The timekeeper is record only,** and every timekeeper screen says so ("A timekeeper only
   records the match", "You only record", "your rating isn't affected"), under the owner's chosen
   name "Timekeeper".

## Backend contract asks (coordinator to file)

| Ask | Why | Bead |
|---|---|---|
| `server_now` in the `get_match_video_status` response | The countdown must be the same on every phone, whatever its clock (M10). | jr_be-1qz.20 |
| `wait_extended boolean` (or `wait_reason`) | "Giving it up to 10 more min" must not show during the first 10 minutes just because an angle is processing (M10). | jr_be-1qz.9 / .20 |
| `late_angle_until` (build dispatch + 24 h) | Row helper "It can still be added until {time}" and the end state "Not in your highlight" (M2). | jr_be-1qz.20 / .15 |
| Reel state `none` (plan produced no highlight) | "Film ready, no highlight possible" needs its own state; `none_dominant_fallback` still produces a highlight (M5). | jr_be-1qz.15 / .20 |
| Precise deadline dispatch (schedule at `wait_deadline_at`, or a 15 to 30 s sweep near open deadlines) | The 1 min cron makes "Any second now" common (Q9). | jr_be-1qz.9 |
| Grace rule for `no_film` (no rows and no intents: report a pre-grace state for 15 min after match end) | Old builds and pre-reservation clients would otherwise show "No one recorded it" while uploading (M11). | jr_be-1qz.20 |
| Byte progress for native background uploads (heartbeat or storage-read) | Without JS heartbeats a background upload reads as Paused to everyone else (M9). | jits-n2im.8 / .9 |
| `film_window_until` = coalesce(highlight `dispatched_at`, match `completed_at`) + 24 h; when it passes with nothing usable, phase `no_film` and the "No film" push fires | Without it, a match where no build ever starts waits for the 7-day reaper and the "No film" push never fires (round 2 N1). | jr_be-1qz.20 / .16 |
| Late-angle re-render uses highlight `origin = 'late_angle'`, which the push function skips (with a test); user "Make a new version" stays `regen` and keeps the shipped "Your new version is ready" push | Otherwise every late angle sends a second push via the shipped regen branch (`highlight-payload.ts:99-107`) (round 2 N2). | jr_be-1qz.15 / .16 |
| Push changes: drop `angle_arriving` and the separate `film_ready`; drop `upload_abandoned`; add `no_film` (trigger in COPY-DECK 6) and the timekeeper push at phase `ready` | One push per athlete per match (minor 11, M8, Q2, Q5). | jr_be-1qz.16, jits-n2im.13 |
| Gate the "uses both angles" and one-push copy on jr_be-1qz.9 + .15 being live | Before F1 the server never emits `waiting_for_angle` and still pushes per video (M10). | jits-n2im.25 |

Client bead amendments: jits-n2im.1 local notification copy = COPY-DECK 6; jits-n2im.2 AC1 amended
(strip hidden on the same match's verdict and detail); jits-n2im.25 keeps every string in one
`video-status-copy.ts` with a lint test.

## Round 2 changes (v2.1)

| Finding | Change |
|---|---|
| N1 no end state without a build | `film_window_until` in the deck's server contract and the backend asks. Collecting helper `If nothing arrives by {film_until}, we'll let you know there's no film.`; no_film reason `None of the video came in.`; push trigger uses it. Drawn on P-VS-08 (two new frames) and the map. |
| N2 regen push vs silent re-render | Deck 6: origin `late_angle` never pushes; a user-tapped `Make a new version` keeps the shipped `Your new version is ready` push. Drawn on P-VS-11 (push) and the map; bell row in deck 7. |
| m1 | Titles lowercase: `Your highlight is ready` (push, bell, map). |
| m2 | Film Room badges uppercase the whole string (`BUILDING HIGHLIGHT`). |
| m3 | No-film card has no centre caption (badge only). One label for my own failed upload everywhere: `Didn't upload` (strip, compact line, row, Film Room badge). Two labels were not justified: the strip and the row describe the same state. |
| m4 | P-VS-06 hero duration is the ready angle's `04:31`; rule 9 added. |
| m5 | P-VS-17 no longer promises a Film Room listing; open question 4 deferred. |
| m6 | Deck 2c names the fallback for each missing backend field. |
| m7 | `{p}` defined. |
| Nits 2, 3 | `Open match` has no film icon; the duplicate row helper on P-VS-05 "Wait ended" is dropped. |
| M-UPLOAD alignment | Keep-open strings and the local notification now use the shipped M-UPLOAD strings (table below). |

## Strings that differ from the M-UPLOAD branch

Branch `jits_web-wt-m-upload`, commit `7cbe537`, `apps/mobile/lib/video/upload-copy.ts` and
`upload-errors.ts`. Adopted from M-UPLOAD: `keepOpenCopy` (both variants) and the background
notification (`Your match film isn't uploaded yet` / `Open ELO RATED to finish uploading it.`).
Still different, for the implementer to align to the deck:

| Where | M-UPLOAD (7cbe537) | Deck | Why the deck |
|---|---|---|---|
| Retry button | `Retry` | `Try again` | The design system's voice rule ("The retry action is Try again") and shipped highlight copy (`HIGHLIGHT_COPY.tryAgain`). |
| Offline paused | `Upload paused: no connection. It picks up again when you're back online.` | tag `Paused` + `No connection right now. It picks up where it left off.` | The tag already says paused; one helper string across strip and row. |
| Server busy | `Upload paused: the server is busy. It will retry automatically.` | `Our server didn't answer. Trying again shortly.` | Either is fine; pick one. The deck's is shorter. |
| Rejected | `Upload failed: the server didn't accept this video. Tap Retry to try again. The recording stays on this phone for {n} days.` | `This match can't take a video anymore.` (terminal) or `The upload didn't finish.` + `Try again` | Retention days are useful; consider adding `The recording stays on this phone for {n} days.` to the deck's retryable helper. |
| File missing | `The recording is no longer on this phone, so it can't be uploaded.` | `The clip isn't on this phone anymore.` | Shorter; same meaning. |
| Too large | `This video is too large to upload (2 GB max).` | `This clip is too long to upload. Matches up to {limit} min upload.` | Athletes think in minutes, not GB; needs the limit value. Either is acceptable. |
| Still caption | `UPLOAD PAUSED · 42%`, `UPLOAD FAILED`, `PROCESSING FILM` | Film Room badge `Upload paused`, `Didn't upload`; `Processing` only as a row | Align `UPLOAD FAILED` to `DIDN'T UPLOAD` (m3). |
| Verdict CTA while uploading | disabled `Watch film` relabelled `Film uploading 42%` | enabled `Open match` | Open match still has a destination (the Film status); a disabled CTA hides retry. Owner or implementer may keep M-UPLOAD's if the verdict shows the Film block. |
| Generic failure | `Upload failed` | `Didn't upload` | m3. |
| Daily limit, uploads off, not in cohort, reslice limit, save failed | M-UPLOAD has them | not in the deck | Adopt M-UPLOAD's text, with `Retry` read as `Try again`. |

## Owner decisions applied (2026-10-05, v2.2)

| Decision | Change |
|---|---|
| Naming: keep "Timekeeper" (closes M12) | All user copy reverted from "Third camera / Sideline / Film a match / Join to film / You're filming" to: row `Timekeeper`, tag `Timekeeper`, sheet `Add a timekeeper`, join screen and CTA `Join as timekeeper`, headline `You're the timekeeper`, error `This match already has a timekeeper.` Record-only meaning is explicit in the helpers ("They only record", "A timekeeper only records the match from the sideline. They don't run the clock, and their rating isn't affected.", "Timekeepers only record...", "You only record. The players run the clock."). Recording-screen verbs are "record", not "film". |
| Nouns: keep both shipped terms (closes Q10) | `TERM_APP` = highlight on every in-app screen; `TERM_NOTIFY` = reel in push and bell bodies (`Your reel vs D. Okafor is ready. Tap to watch.` / `...is ready to watch.` / `Version 2 of your reel vs D. Okafor is ready.`). Push and bell titles keep the shipped literal `Your highlight is ready`, so the shipped title/body pair is unchanged. |
| Board files | Not renamed. `P-VS-12` to `P-VS-17` keep `Timekeeper` in their names, which now matches. `P-VS-19-Timekeeper-States.dc.html` keeps its file name (internal only; its title is "Timekeeper, other states"); rename it before the first publish only if the coordinator wants the file names consistent. |

## Round 1 resolutions

| Finding | Change |
|---|---|
| B1.1 collecting word | `Uploading` everywhere (phase tag, Film Room badge, map). `Processing` is only an angle row. Priority list fixed. |
| B1.2 `{n}` vs processing row | Timekeeper "building" now says 2 angles; the processing row carries the late-window helper. Contradiction rule 3 added. |
| B1.3 playable affordances | P-VS-03 CTA reads `Open match`; P-VS-07 hero has no play button or duration and reads STILL ARRIVES AFTER UPLOAD; the angle switcher is removed on 06 and 07 (fewer than two ready angles). Rule 4 added. |
| B2 your angle on another device | Deck 2b; P-VS-09 has a "on another device" group with no Try again. |
| M1 "finish faster" | Now `Keep ELO RATED open until your film uploads.` (v2.1, the shipped M-UPLOAD string) with a flag-gated post-background-upload variant; P-VS-17 says it once (plate helper). |
| M2 no end state | 24 h helpers (`until 9:42 PM`), `Not in your highlight` end state, "next 24 hours" building helper; drawn on 05, 08, 09 and the map. |
| M3 red with nothing to do | `act` only with the file on the phone; terminal causes are grey (deck 0.6, 2a, 8; boards 02, 08, 09). |
| M4 late angle after share/edit, reel failed | Drawn on P-VS-18 ("New angle available." + Make a new version) and as a P-VS-08 helper; processing-after-dispatch helper added. |
| M5 film-only reason | Mapped to reel `none` (backend ask) and reel `failed`; both drawn on P-VS-08. |
| M6 drift | Every listed string unified; boards use one constant per string. jits-n2im.1 amendment listed. |
| M7 two pending | `Waiting up to 10 min for 2 more angles.` (P-VS-06, deck 4a/4b). |
| M8 abandoned push | Dropped (push and bell); the in-app grey row stays. |
| M9 paused guess | `We haven't heard from {name}'s phone for a few minutes. It picks up where it left off.` |
| M10 server fields | Designed for `server_now`, `wait_extended`, `late_angle_until`; listed above. |
| M11 rollout false "nobody" | "No video yet" pre-grace state (P-VS-05, 08, deck 4a, rule 7). |
| M12 naming | v2 used record-only names; v2.2 reverts to "Timekeeper" per the owner, with the record-only meaning in the helper text. |
| M13 touch targets | Every new control is 44 px (Try again, Upload now, Add, Open Settings, Make a new version). |
| M14 live regions | All aria-live and role=status removed; rows are single labelled elements, uploading rows are progressbars; deck section 10. |
| Minors 1, 2, 3, 5, 6 | Deck 0.5 reworded; token names with light values; backgrounded helper reworded; v1 = 1 angle, v2 = 2 angles; one noun via `{term}`. |
| Minor 7 | New board P-VS-19: joined row, camera denied, join errors, leave while recording, match cancelled, landscape note. |
| Minor 8 | P-VS-17 says the match stays in their Film Room (open question 4). |
| Minor 9 | Retry-failed strip, terminal strip with Details, "Any second now" drawn (02, 08). |
| Minor 10 | Shipped push and bell bodies quoted with file paths (deck 6). |
| Minor 11 | Listed under backend asks. |
| Nits 1 to 3 | Titles without double colons; verdict boards now match the match detail sample (+18, 1469 to 1487, Armbar 04:12); "D. Okafor is recording too". |

Disagreements: none of substance. One partial: minor 5 suggested dropping "Version {n}" from the
meta; I kept it because it is shipped copy (`metaLine`) and the share/edit flow refers to versions.

## Assumptions

1. Only "Your angle" on the recording phone may use the local job; everything else is the RPC.
2. jits-n2im.3 lands `paused` vs `failed` in the upload store and the causes in COPY-DECK 8.
3. The extended wait is signalled by `wait_extended`, the late window by `late_angle_until`, and the
   countdown uses `server_now` (backend asks above). Until they exist the client hides the extended
   copy, the "until" helpers and the countdown digits (falls back to "Waiting up to 10 min").
4. One timekeeper code per match; either competitor can show it.

## Open questions: all closed or defaulted

Decided by the owner (2026-10-05):
1. Naming: "Timekeeper" (record only, said in the helpers).
2. Nouns: "highlight" in the app, "reel" in push and bell bodies, as shipped.

Coordinator defaults (owner may override):
3. "Make a new version" after a late angle: if jr_be-1qz.15 can't re-render this release, show the
   "New angle available." line without the button.
4. Where the timekeeper finds the match later: push and bell only; a Film Room listing is deferred
   to a follow-up.
5. "No video yet" grace window: 15 min after match end.
6. Film window (N1): 24 h (`film_window_until`).
7. Regen push (N2): keep "Your new version is ready" for a user-tapped new version.

Earlier resolutions: strip hidden on the same match's screens (Q1); "No film" push as the single push
(Q2); local paused notification yes, abandoned push no (Q3); timekeeper push at phase ready, "Tap to
watch the film." (Q5); softer fallback copy (Q6); "Upload now" only with the clip file found (Q7); the
timekeeper sees film, not highlights (Q8); "Any second now" with a server-driven countdown (Q9).
