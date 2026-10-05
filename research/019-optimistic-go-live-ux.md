# 019: Optimistic Go Live, UX spec

Status: draft for build, 2026-10-04. Author: UX design pass (no app code).
Scope: the mobile app (`apps/mobile`), dark mode first, light mode by tokens.
Companion: the PM's backend and client spec, `jr_be` `specs/016-invites/addendum-optimistic-go-live.md` (the "location ladder", rungs 1 to 4, decisions D1 to D12). This spec uses its constants and rung names. Where the two disagree, section 9 names each difference and the recommended resolution.

## 0. The owner's goal and the binding rules

The owner's goal (2026-10-04): "optimistically allow a user to go live, and validate errors silently in the background. We need this to go very smoothly."

The owner then tightened the rule (binding, supersedes the first brief): "we can NOT let an athlete go live without some form of location; we might update our device to also store the last location too." There is therefore no "live but unverified" state and no grace window. An athlete is live only with a location tag less than 4 hours old whose accuracy is 100 m or better. The tag is found fastest first:

1. **Server tag** less than 4 h old: instant.
2. **Device-stored tag**: the app keeps the last location the server accepted (latitude, longitude, accuracy, time) on the device. If it is less than 4 h old the app reports it, and the athlete is live in one round trip.
3. **OS cached fix** (`getLastKnownPositionAsync`, less than 4 h old, 100 m or better): sub-second.
4. **Fresh fix**, only when none of the above exist. This is the only case with a visible wait (the "finding you" pending state), and the only case that may ask for permission, and only after the athlete's own tap.

After a go-live from a cached tag (1 to 3), one silent background refresh updates the tag (PM 4.2: when permission is already granted, and for rung 1 only when the tag is over 15 minutes old). It never prompts, and a failure never takes the athlete offline. The 60 s refresh while live is removed, and the server's 10-minute expiry is removed (PM section 2); the 12-hour cap stays. A live session whose tag passes 4 hours old stays live (PM D3).

"Valid" on the device means captured less than 4 h minus a 2 minute margin ago (`GO_LIVE_TAG_MAX_AGE_MS - GO_LIVE_TAG_MARGIN_MS`) with accuracy 100 m or better (PM 4.2).

Other binding rules carried over:

- Never show a system permission dialog without a user tap. iOS "Allow Once" lapses when the app goes to the background (status `undetermined`, `canAskAgain` true). Denied (`canAskAgain` false) can only be fixed in Settings. iOS Precise Location off gives readings of 1000 m or worse, which the server rejects.
- No location check at match start (that flag is off).
- A drift check (moved more than 500 m from the tag while live: prompt to update or go offline) exists behind a flag that is OFF for now. It is designed here anyway (section 3k).
- Going to the background takes the athlete offline and restores them on return. A match takes them offline and restores them after.

The target: in cases 1 to 3, which should be nearly every go-live after the first one of the day, the tap feels instant, with no spinner.

## 1. Principles

1. **Optimistic.** When the device has its own evidence that a go-live will succeed (a stored tag or an OS cached fix inside the window), the chip turns green on the tap, not on the server's answer. The server confirms in the background. The athlete never waits on a round trip they cannot do anything about. This does not break "never live without a tag": the flip only happens when a valid tag already exists on the device or in the OS cache, and the write that follows is what the server checks. (The PM spec shows GOING LIVE until the write lands; section 9, C1, gives the reasoning and a fallback that still shows no spinner on a good connection.)
2. **Silent.** Validation, the background tag refresh, and the drift reading run without UI. Nothing on screen changes when they succeed, and a refresh that fails leaves the athlete live and says nothing.
3. **Honest when it matters.** The chip never shows LIVE for an athlete other people cannot see for longer than a short, bounded confirmation window (section 2.3). When a go-live cannot happen, the athlete is told once, in plain words, with the one thing to do next. A failure is never red (spec 3 of the live chip: ink-3 for degraded states; red is reserved for "someone wants you" and the single CTA).
4. **Never a dead end.** Every failure state has a next step one tap away: Retry, Open Settings, or tap to go live again. The header chip's GO LIVE is always the way back.
5. **Never a surprise system dialog.** The iOS or Android location dialog only ever appears directly after the athlete tapped Continue on the explain sheet, which itself only appears after they tapped Go live. Automatic paths (restores after background, after a match, on cold start, the refresh) never ask, never open a sheet, and at most show one toast.
6. **One signal per event.** One haptic per go-live, one toast per failure cause per foreground session, no sheet and toast for the same thing.
7. **No new motion.** The flow reuses `PendingDot`, `LiveDot`, the blade clash and the modal fade. Nothing is added to the motion registry.

## 2. The athlete-perceived state machine

### 2.1 States

The states below are what the athlete perceives, not the store's internal phases. The chip model (`lib/arena/header-chip-model.ts`) already has `offline`, `going-live`, `live`, `reconnecting` and `retry`; this spec adds one chip kind, `finding-you`, and changes when the others show.

| State | Meaning | Is the athlete visible to others? |
|---|---|---|
| `offline` | Not live, nothing in flight. | No |
| `going-live` (instant path) | Tap made, local evidence found, write in flight. Rendered as `live`. | Not yet (bounded, section 2.3) |
| `live` | Live, server confirmed. | Yes |
| `finding-you` | Tap made (or a restore is running), no tag anywhere, a fresh fix is running. | No |
| `recovering` | An optimistic go-live or a restore write did not land on the first try for a network reason, and the app is quietly retrying. (A server refusal of the tag is not `recovering`: the ladder moves on to the next rung, see 2.3.) | No |
| `offline-needs-location` | Offline, and the last attempt failed for location (denied, lapsed, timeout, coarse). Looks like `offline`; the tap leads straight to the fix. | No |
| `in-match` | In a match. The app took the athlete offline and will restore. | No |
| `background` | App in the background. The app took the athlete offline and will restore. | No |

The old `live-verifying` / unverified state and its grace expiry are deleted by the owner's change (section 0).

### 2.2 Per-state appearance

Colors are NativeWind classes backed by `apps/mobile/lib/tokens.ts` (`text-positive` / `border-positive` = `statePositive`, `text-ink-3` / `border-ink-3` = `textTertiary`). Chip geometry, font and the 160 pt cap are unchanged (`CHIP_MAX_WIDTH`, `font-mono-bold text-micro uppercase`).

**offline**
- Chip: `○ GO LIVE` or `○ GO LIVE · 12`; hollow 6 pt ring View, `border-ink-3`, text `text-ink-3`, `border-ink-3` outline. No animation.
- Arena bar: OFFLINE segment selected (`bg-surface-4`, `text-ink`); LIVE segment unselected, static `bg-ink-3` dot, `text-ink-3`, label "Go live".
- Haptic: none. Toast or sheet: none.
- Accessibility: label `Live status: 12 on the mat. Go live`, value `offline` (unchanged).

**going-live (instant path)**
- Chip: renders exactly as `live` (`● LIVE · 12`, green) from the frame after the tap. This is the optimistic flip. The model gains an input `optimisticLive: boolean` that the chip treats as `isLive` for drawing; the accessibilityValue is `live`.
- Arena bar: LIVE segment selected, green dot, `text-positive`, label "You are live".
- Haptic: `haptics.goLive` (Light impact) fires once, at the flip.
- Toast or sheet: none.
- Accessibility: announce "You're live" once at the flip (polite, `AccessibilityInfo.announceForAccessibility`). Not announced again when the server confirms.
- Motion: `LiveDot` on the Arena tempo clock; the Arena tab icon blade clash plays once (existing Moment). Reduce Motion: static green dot, no clash.

**live**
- Chip: `● LIVE · 12` / `● LIVE · JUST YOU`, green border, 10% green fill, pulsing `LiveDot` (Arena tempo). Unchanged.
- Arena bar: as above. Unchanged.
- Haptic: none on entry from `going-live` (it already fired). Fires `goLive` only on a direct entry that did not pass through `going-live` with a haptic (the fresh-fix path, section 2.2 `finding-you`).
- Accessibility: unchanged (`Live status: 12 on the mat. Open live menu`, value `live`).

**finding-you** (new chip kind)
- Chip: `◌ FINDING YOU`, `PendingDot` (ink-3 ring on the fixed `duration.pulse` 1400 ms cycle) in the 6 pt glyph slot, `text-ink-3`, `border-ink-3`, no fill. Disabled (a second tap does nothing). It is revealed only after `duration.fast` (240 ms) from the tap; before that the chip shows its pressed state and nothing else (section 2.3).
- Arena bar: LIVE segment shows `PendingDot` (existing `arena-segment-live-pending`), label "Live", accessibilityState `busy: true`. The counts text stays as is.
- Haptic: none at entry. `goLive` when it resolves to `live`.
- Sheet: if this state was reached by a tap, the location sheet may be up over it (explain, then its busy line "Finding your location..."). If reached by a restore, never a sheet.
- Accessibility: label `Live status: finding your location`, no accessibilityValue (like GOING LIVE today, since "finding your location, offline" would contradict). Announce "Finding your location" once, only if the state lasts longer than 1 second.
- Reduce Motion: static ring (opacity 1, scale 1); the label carries the meaning.

**going-live (network wait, existing GOING LIVE)**
- Kept for two cases: the tap had local evidence but the device knows it has no connection (section 3g), and the OS cached fix lookup (rung 3) is still running at 240 ms (it has a 500 ms budget). Chip `◌ GOING LIVE`, `PendingDot`, ink-3. If rung 3 then fails and a fresh fix starts, the label moves once to `FINDING YOU`; that is the only label change allowed inside one attempt.
- Accessibility: unchanged (`Live status: going live`).

**recovering**
- Chip: `◌ RECONNECTING` (the existing `reconnecting` kind: `◌` text glyph, ink-3, no fill), disabled for taps that would go live again, but its popover still opens (Go offline stays available).
- Arena bar: LIVE segment unselected with `PendingDot`; OFFLINE segment tappable.
- Haptic: none.
- Accessibility: label `Live status: reconnecting. Open live menu` (existing). Announce "Reconnecting" once.
- Outcome within the recovery window: `live` (no second haptic and no second "You're live") or `offline` (`OFFLINE · RETRY`) with exactly one message.

**offline-needs-location**
- Chip: identical to `offline` (`○ GO LIVE`). Deliberately no new error chip: a persistent "LOCATION OFF" would also show for a brand new athlete who has never been asked, and the fix is one tap away anyway.
- Arena bar: identical to `offline`.
- What differs: the tap goes straight to the right sheet (explain for `undetermined`, denied for `canAskAgain` false, Precise Location for a coarse-only device), with no pending reveal in between. The chip's accessibility hint becomes "Location needed to go live" so VoiceOver users hear why.
- Haptic: none. Toast: at most the one that brought the athlete here (see scenarios), never repeated on later foregrounds.

**in-match**
- No chip on match screens (pushed screens show the non-interactive `HeaderLiveDot`, unchanged). Tab roots under the match keep their last chip; they are not visible.
- The return from a match restores per section 3m: instant if the tag is valid, which it almost always is.

**background**
- Nothing is drawn. The app clears the live flag on `background` (existing) and remembers the intent. Any sheet or pending flow is cancelled (existing 1e). No toast is queued for later.

### 2.3 Transitions and timings

Named timings (new constants, values from motion tokens where a token fits):

| Name | Value | Meaning |
|---|---|---|
| `PENDING_REVEAL_MS` | `duration.fast` (240 ms) | Time after a tap before any pending state is drawn. Anything that resolves faster shows no spinner at all. |
| `OS_CACHE_BUDGET_MS` | 500 ms | Longest the OS cached fix lookup is waited on before it counts as absent and the fresh fix starts. |
| `OPTIMISTIC_CONFIRM_MS` | 5 s | Longest the chip shows green before the server confirms. After it, the chip goes to `recovering`. |
| `BACKGROUND_REFRESH_AFTER_MS` | 15 min (PM) | Rung 1 go-lives take the one silent refresh only when the tag is older than this. |
| `DRIFT_INTERVAL_MS` / `DRIFT_DISTANCE_M` | 5 min / 500 m (PM) | Drift check cadence and threshold (flag off). |
| `RECOVERY_WINDOW_MS` | 15 s from the tap | Total time the app keeps trying silently before giving up with one message. |
| `FIX_TIMEOUT_MS` | 10 s (existing) | Fresh fix timeout. |
| `PROMPT_TIMEOUT_MS` | 30 s (existing) | System prompt bound. |
| `TAG_MAX_AGE` | 4 h | Tag validity, checked at the moment of the go-live. |
| `CTA_TOAST_MS` | 8 s (existing `LOCATION_OFF_CTA_VISIBLE_MS`) | Tap-to-go-live toast. |

Transitions (athlete tap is "tap"; everything else is automatic):

```
offline --tap, local tag valid--------------------------> going-live(shown as live) --server ok--> live
offline --tap, no local tag, OS cache valid (<500 ms)---> going-live(shown as live) --server ok--> live
offline --tap, no local evidence, permission granted----> [240 ms hold] --> finding-you --fix+server ok--> live
offline --tap, no local evidence, not granted-----------> sheet (explain or denied) --> finding-you or offline-needs-location
going-live --no ack in 5 s, or network error-----------> recovering --ok within 15 s--> live
going-live --server refuses the tag, a later rung lands-> live (no redraw: still green)
going-live --every cached rung refused, rung 4 needed--> finding-you (tap flow: sheets allowed) --ok--> live
recovering --15 s, or no silent path left---------------> offline (OFFLINE · RETRY) or offline-needs-location, one message
finding-you --fix fails (timeout, coarse, accuracy)-----> sheet with Retry (tap path) / one toast (restore path) --> offline-needs-location
live --tap Go offline-----------------------------------> offline (instant)
live --app background-----------------------------------> background --return--> restore (see 3i)
live --match starts-------------------------------------> in-match --match ends--> restore (see 3m)
live --server ends session------------------------------> offline, one toast (see 3j)
live --drift > 500 m (flag on)--------------------------> live + "Still on the same mat?" sheet (see 3k)
```

Flicker rule: in a single attempt the chip changes at most twice (offline to pending or optimistic, then to the outcome). It never goes green, grey, green within one attempt except in two rare cases: a network failure (`recovering`), or every cached rung refused by the server so a fresh fix is needed (`finding-you`). Falling from rung 1 to rung 2 or 3 keeps the chip green, because those resolve in a round trip or two.

## 3. Scenario walkthroughs

Each walkthrough starts on any tab root with the header chip, or on the Arena with the control bar. "Tap" means the chip's GO LIVE or the Arena's LIVE segment; every Arena go-live surface (Mat Board row, Closest Match, offer strip) behaves the same.

### (a) Permission granted, valid tag

1. Athlete taps `○ GO LIVE · 12`. Press opacity (existing `active:opacity-70`, or `PressableScale` on the Arena).
2. Same frame: the device finds its stored tag, 40 minutes old, 22 m accuracy. The chip draws `● LIVE · 12`, green. `haptics.goLive`. Blade clash on the Arena tab icon. VoiceOver: "You're live".
3. In the background the live write lands (about 300 ms). Nothing changes on screen.
4. If the tag came from rung 2 or 3, or from rung 1 and is over 15 minutes old, and permission is granted, one silent refresh takes a reading and reports it as the new tag. Nothing changes on screen. If it fails (no fix indoors, coarse, network), nothing changes either, and the athlete stays live.

No toast, no sheet, no spinner.

### (b) Permission granted, no tag anywhere, fresh fix succeeds silently

1. Tap. No stored tag (first go-live, or more than 4 h since the last). The OS cache is empty or too old or too coarse (answered inside 500 ms).
2. 0 to 240 ms: only the press feedback.
3. At 240 ms: chip `◌ FINDING YOU` with the pending ring; Arena LIVE segment shows the pending ring.
4. The fix arrives (typically 1 to 4 s) at 35 m; the report and live write land.
5. Chip `● LIVE · 12`. `haptics.goLive`. Blade clash. VoiceOver: "You're live" (and "Finding your location" before it, only if step 3 lasted over a second).

The 240 ms hold matters mostly on rung 3: an OS cached fix that answers in 150 ms means the athlete sees offline then live, nothing between.

### (c) Permission granted, no tag, fresh fix fails

Replaces the old grace-expiry scenario. The athlete stays offline with a clear next step; there is no "live then dropped".

1. Tap, 240 ms hold, `◌ FINDING YOU`.
2. One of:
   - **Timeout** (no fix in 10 s): the "No location" sheet: title "No location", body "We couldn't get your location. Check your signal, then try again.", buttons Retry, Not now.
   - **Too rough** (server says `accuracy_too_low`, worse than 100 m but not Precise-off scale): "Location too rough" sheet: "Can't pin your location. Try near a window." Retry, Not now.
   - **Coarse** (1000 m or worse): the Precise Location sheet, see (f).
3. While the sheet is up the chip shows `○ GO LIVE` under the scrim (the attempt has ended; no pending under a sheet that is waiting on the athlete).
4. Retry: the sheet's busy line "Finding your location..." with the activity indicator; the chip shows `◌ FINDING YOU`. Success closes the sheet and goes live (haptic, announcement). Another failure re-shows the matching sheet.
5. Not now: sheet closes, chip `○ GO LIVE`, plain `offline` (not `offline-needs-location`: permission is fine, and the next tap simply tries again from step 1, since a better signal may exist by then).

No toast in this scenario: the sheet already said it (one signal per event).

### (d) iOS "Allow Once" lapsed (status `undetermined`, can ask again)

**With a valid tag** (stored less than 4 h ago):
1. Tap. The stored tag is valid, so no permission is needed to report it. Instant path, exactly as (a): green on the tap, haptic, live.
2. No explain sheet and no system dialog: asking now would turn an instant tap into a modal interruption for no gain.
3. The silent refresh is skipped (no permission) and nothing is said. The athlete stays live. The drift check (when on) cannot run either (PM 4.4 requires permission already granted), which is acceptable.

**Without a valid tag:**
1. Tap. No local evidence and no permission. No 240 ms pending: the explain sheet appears right away (fade, `useModalAnimation`): title "Location to go live", body "ELO RATED uses your location to put you on the mat with athletes near you. We only check it when you go live." Buttons Continue, Not now.
2. Continue: the sheet goes busy ("Finding your location...") and the iOS dialog appears (it follows a tap, so it is never a surprise). Chip `◌ FINDING YOU` underneath.
3. "Allow Once" or "Allow While Using": fix, report, live. Sheet closes. Haptic, "You're live".
4. "Don't Allow": the denied sheet, see (e).
5. Not now on the explain sheet: closes, chip `○ GO LIVE`, state `offline-needs-location` (the next tap goes straight back to the explain sheet).

### (e) Denied (`canAskAgain` false)

**With a valid tag:** instant path as (a). Live. The silent refresh is skipped. No message.

**Without a valid tag:**
1. Tap. The denied sheet appears at once: title "Location is off", body "Location is off for ELO RATED. Turn it on in Settings to go live." Buttons Open Settings, Retry, Not now.
2. Open Settings: the sheet closes and iOS Settings opens. The app goes to the background (it was offline, so nothing changes). On return, nothing happens on its own: no auto go-live, no sheet. The chip reads `○ GO LIVE`, and one tap now finds permission granted and runs (b).
3. Retry: re-reads permission. Granted: busy line, fix, live. Still denied: the sheet stays.
4. Not now: closes, `offline-needs-location`.

### (f) iOS Precise Location off

**With a valid tag:** instant path. Live. The silent refresh gets a coarse reading, the server refuses it, and nothing is said; the athlete stays live on the existing tag (a refused report never replaces the tag).

**Without a valid tag:**
1. Tap, 240 ms hold, `◌ FINDING YOU`. The reading comes back at 1000 m or worse.
2. Sheet: title "Turn on Precise Location for ELO RATED", body "Settings > ELO RATED > Location > Precise Location. Already on? Move near a window or turn on Wi-Fi, then Retry." Buttons Open Settings, Retry, Not now.
3. As (e) from there. A coarse OS cached fix never counts as local evidence, so a Precise-off device without a stored tag always lands here, and the copy tells them the actual fix.

### (g) No network on the tap, then recovering

**With local evidence, and the device knows it is offline** (NetInfo says no connection at the tap):
1. Tap. Do not flip green: the write cannot land and the system offline banner (board 48) is already up. 240 ms hold, then `◌ GOING LIVE`.
2. If the connection returns within 15 s of the tap, the write lands: `● LIVE`, haptic, "You're live".
3. If not: chip `○ OFFLINE · RETRY` (existing `retry` kind, ink-3, never red). From the header chip no toast (the failure shows in place, AC-H11). From an Arena surface, toast "Couldn't take you live. Try again." (existing).

**With local evidence, the connection looked fine but the write fails** (timeout, 5xx):
1. Tap: green, haptic, "You're live" (optimistic).
2. No ack within 5 s, or an error: chip `◌ RECONNECTING`, VoiceOver "Reconnecting". The app retries with backoff.
3. Lands within 15 s of the tap: `● LIVE`, no second haptic, no announcement.
4. Does not land: `○ OFFLINE · RETRY` and the same message rule as above.

**Fresh-fix path with no network:** the fix may succeed but the report cannot land. Same as the first case: `◌ FINDING YOU` until 15 s, then `○ OFFLINE · RETRY`. The reading is kept and reported on Retry if still under 2 minutes old, so Retry is instant.

### (h) Cold start while the server says live

The process was killed while live (or the athlete is live on web).
1. First frame of the tab root: if the stored tag is valid, the chip draws `● LIVE` from the first frame (no GO LIVE flash), and the re-assert write (existing) goes out. No haptic, no toast, no announcement: the athlete did not tap anything, and they were already live.
2. No valid stored tag, permission granted: first frame `◌ FINDING YOU` (honest: they were live, the app is putting them back). A silent fresh fix, no prompt. Success: `● LIVE`, no haptic. Failure (timeout or coarse): `○ GO LIVE`, one toast "Couldn't find your location. Tap to go live again." (8 s; its tap runs the full tap flow, which can show sheets because the athlete tapped).
3. No valid tag, permission not granted: first frame `○ GO LIVE`, the stale server flag is cleared, one toast "Location is off for ELO RATED. Tap to go live again." (existing copy, 8 s).
4. A cold start into the background (silent push) or straight into a match: unchanged, the intent is parked and step 1 to 3 run on the first foreground or after the match.

### (i) Return from background

The app took the athlete offline on `background` and remembered the intent (existing).

**Less than 4 h away** (tag still valid, which is the common case: a phone check between rounds):
1. On `active`, the chip draws `● LIVE` from the first frame. The live write goes out with the stored tag. No haptic, no toast, no announcement, no blade clash.
2. Permission lapsed meanwhile ("Allow Once"): irrelevant, the stored tag is enough. No toast. (This removes today's behaviour where every foreground after an "Allow Once" grant could show the tap-to-go-live toast.)
3. The write fails: `◌ RECONNECTING`, then within 15 s either `● LIVE` or `○ GO LIVE` with the existing toast "You're offline. Go live again in the Arena."

**More than 4 h away:**
1. Permission granted: first frame `◌ FINDING YOU`, silent fresh fix, no prompt. Success: `● LIVE`, no haptic. Failure: `○ GO LIVE`, one toast "Couldn't find your location. Tap to go live again."
2. Permission not granted: first frame `○ GO LIVE`, one toast "Location is off for ELO RATED. Tap to go live again."
3. In both failure cases the remembered intent is cleared, so the next background and foreground do not try again and do not toast again.

Rejected alternative: auto-restoring after more than 4 h with no UI at all and dropping silently on failure. The athlete believes they are live and would wait on a mat nobody can see; one toast is the honest minimum.

### (j) The server ends the live session on its own

The old "ended as unverified" cases are gone, and so is the 10-minute expiry. What remains is the 12-hour cap (PM 3.8) or an admin action. A tag passing 4 hours old does not end the session (PM D3).

**While the app is open:**
1. A realtime update of the athlete row, or `dropIfServerOffline` on the next return to the foreground (PM 4.2), sees `looking_for_ranked` false.
2. Chip goes `○ GO LIVE` at once (no RECONNECTING detour). One toast: "You're offline now. Tap to go live again." Its tap runs the tap flow.
3. No haptic. VoiceOver hears the toast (toasts announce).

**While the app is closed or in the background:** the app had already gone offline on `background`. On return it runs (i) as normal; if (i) restores them, there was nothing to report. The athlete never sees a toast about something that happened while they were away and that the restore already undid.

### (k) Drift check (flag on; OFF for now)

Trigger (PM 4.4): flag `live_location_drift_check` on, live, not in a match, foreground, permission already granted, a stored `go_live` tag. Every 5 minutes one silent reading; drifted when `haversine(tag, reading) - min(tag accuracy + reading accuracy, 100) > 500 m`. One prompt per drift streak: once closed, no further prompt until a later check is not drifted or the tag changes.

New component: `DriftPromptSheet` (`components/arena/drift-prompt-sheet.tsx`), a gorhom bottom sheet using `useSheetChrome()` (Reduce Motion: appears in place). It is a sheet, not the centered `GoLiveLocationSheet`, because it is non-blocking (DESIGN.md: a centered dialog is only for prompts that must be answered); a backdrop tap or swipe down closes it.

1. The sheet waits until nothing else is up (the incoming challenge prompt, a location sheet, the live menu) and the app is active. It never shows in the background or over a match, and a pending prompt is dropped (not queued) if the app goes to the background.
2. Sheet: title "Still on the same mat?", body "You've moved since you went live. Update your location so people nearby can find you." Buttons Update (primary `Button`), Go offline (secondary). Copy is the PM's (4.4, D9: no place names exist).
3. Update: the button shows its busy state, the reading is reported as `go_live` (it becomes the tag), the sheet closes. Chip stays `● LIVE` throughout. No haptic (no state change). If the report fails, the sheet closes anyway and nothing else is said; the next check will prompt again if still drifted.
4. Go offline: same as (l), through `goOfflineWithFeedback`.
5. Closed without a choice: stays live on the old tag.
6. The athlete stays live while the sheet is up: drift is a prompt, not a penalty.
7. Accessibility: the sheet title is a header; on open, VoiceOver focus moves to the title. No announcement beyond that.

Rejected alternative: the distance in the body ("about 1.2 km from where you went live"). It reads as surveillance and adds nothing the athlete can act on.

### (l) Going offline manually

1. Tap the chip's live menu Go offline, or the Arena OFFLINE segment.
2. Same frame: `○ GO LIVE · 12`, OFFLINE selected. No haptic (none is defined for going offline, and adding one would make it feel like an event). VoiceOver: "You're offline".
3. The flag clear goes out; a failure retries itself (existing) with the existing toast `GO_OFFLINE_FAILED_MESSAGE` only from the explicit control.
4. The stored tag is kept, so the next go-live within 4 h is instant. The resume intents are cleared, so a later background and foreground do not resurrect them.

### (m) Accept a challenge, and face-off

1. A challenge arrives while live: the incoming prompt (unchanged; `challengeArrived` haptic from the prompt only).
2. Accept: `haptics.accept`, the Accept sweep, straight to face-off. No location step, no wait (match-start location check is off).
3. Entering the match takes the athlete offline (existing). Match screens show `HeaderLiveDot` only.
4. After the match (verdict, confirm): the restore runs as (i). Matches are well under 4 h, so it is the instant path: the tab root chip draws `● LIVE` on the first frame, no haptic, no toast.
5. An offline athlete opening a challenge from a push (offer strip "Go live to answer ALEX"): its tap is a normal go-live tap (a to g), then the athlete can accept.

### Is "verifying" visible at all?

There is no verifying state any more: the owner's rule means the athlete is never live without a tag. The question becomes how visible the wait is, and the answer is:

- **Instant path (1 to 3): invisible.** The device has evidence; the server's answer is a formality in all but rare cases, so a spinner would only add doubt and slow the tap down. Failures there are rare enough (network, a server refusal) that one `RECONNECTING` beat is the right cost.
- **Fresh fix (4): visible after 240 ms.** It can take several seconds, the athlete is not live yet and nobody can see them, and a still chip would read as a dead tap. The 240 ms hold (`duration.fast`) keeps any fast answer from flashing a spinner.

## 4. Copy deck

All strings are short, second person, sentence case in source, no exclamation marks, no em dashes. "New" means a new constant; "changed" replaces the current text in `packages/shared/src/utils/invite-copy.ts` or the named file.

### Header chip (`lib/arena/header-chip-model.ts`)

| Key | Copy | Where | Status |
|---|---|---|---|
| offline | `GO LIVE` / `GO LIVE · 12` | chip | unchanged |
| live | `LIVE · 12` / `LIVE · JUST YOU` / `LIVE` | chip | unchanged |
| finding-you | `FINDING YOU` | chip, fresh fix and restores without a tag | new kind |
| going-live | `GOING LIVE` | chip, network wait only | unchanged copy, narrower use |
| reconnecting | `RECONNECTING` | chip, `recovering` | unchanged |
| retry | `OFFLINE · RETRY` | chip, write failure | unchanged |
| a11y finding-you | `Live status: finding your location` | chip label | new |
| a11y hint needs-location | `Location needed to go live` | chip accessibilityHint in `offline-needs-location` | new |

### Location sheets (`components/arena/go-live-location-sheet.tsx`, copy in `invite-copy.ts`)

| Phase | Title | Body | Buttons | Status |
|---|---|---|---|---|
| explain | Location to go live | ELO RATED uses your location to put you on the mat with athletes near you. We only check it when you go live. | Continue, Not now | body changed (today's says "only used to start matches", which is no longer true with the match-start check off) |
| denied | Location is off | Location is off for ELO RATED. Turn it on in Settings to go live. | Open Settings, Retry, Not now | body changed (drops the match-start claim) |
| precise | Turn on Precise Location for ELO RATED | Settings > ELO RATED > Location > Precise Location. Already on? Move near a window or turn on Wi-Fi, then Retry. | Open Settings, Retry, Not now | body changed (drops "confirm you're on the same mat") |
| accuracy | Location too rough | Can't pin your location. Try near a window. | Retry, Not now | unchanged |
| unavailable | No location | We couldn't get your location. Check your signal, then try again. | Retry, Not now | unchanged |
| movement | Location check | Can't pin your location. Try again. | Retry, Not now | unchanged |
| busy line | | Finding your location... | | unchanged |

### Drift prompt (`components/arena/drift-prompt-sheet.tsx`, flag off)

| Element | Copy | Status |
|---|---|---|
| Title | Still on the same mat? | new (PM 4.4) |
| Body | You've moved since you went live. Update your location so people nearby can find you. | new (PM 4.4) |
| Primary | Update | new |
| Secondary | Go offline | new |

The "Location to start" title variant for the challenger's `arena` purpose is unchanged.

### Toasts (`lib/arena/go-live-feedback.ts`, `lib/arena/use-arena-live.ts`)

All are `toast.info` (ink-3 rule, never red).

| Copy | When | Tap action | Status |
|---|---|---|---|
| Location is off for ELO RATED. Tap to go live again. | An automatic restore (cold start, background over 4 h) with no valid tag and no permission | Full tap flow | unchanged copy; no longer shown when a valid tag exists, and never while live |
| Couldn't find your location. Tap to go live again. | An automatic restore with no valid tag whose silent fix failed | Full tap flow | new |
| You're offline now. Tap to go live again. | The server ended the session while the app was open | Full tap flow | new |
| You're offline. Go live again in the Arena. | An automatic restore with a valid tag whose write failed after recovery | none | unchanged |
| Couldn't take you live. Try again. | An Arena-surface go-live that failed after recovery | none | unchanged |
| (existing `GO_OFFLINE_FAILED_MESSAGE`) | A manual go-offline write failed | none | unchanged |

### Announcements (VoiceOver / TalkBack)

| Copy | When |
|---|---|
| You're live | The moment the chip turns green after a tap (optimistic flip or fresh fix). Not on restores. |
| Finding your location | `finding-you` lasting over 1 s, once per attempt. |
| Reconnecting | Entering `recovering`, once per attempt. |
| You're offline | A manual go-offline. |

## 5. Motion and haptics

### Motion

| Element | Tier | Spec | Reduce Motion |
|---|---|---|---|
| Pending ring (`PendingDot`) in the chip and LIVE segment | Ambient | ink-3 ring on the fixed `duration.pulse` (1400 ms) cycle via `useFixedPulseStyle`, paused in the background | Static ring |
| Pending reveal delay | (timing, not an animation) | `duration.fast` (240 ms) after the tap | Same delay |
| LIVE dot | Ambient | Arena tempo clock (`tempo.quiet/normal/busy`) | Static green dot |
| Blade clash on the Arena tab icon | Moment | Existing, on an athlete-tapped go-live only (see haptics) | No clash |
| Location sheets | Moment | RN Modal fade via `useModalAnimation("fade")` | Appears in place |
| Drift prompt sheet | Moment | Gorhom sheet present, `useSheetChrome()` (existing "Sheet / modal present" registry entry) | Appears in place |
| Chip state change | none | Instant swap of copy, color and glyph. No cross-fade is added (it would read as hesitation on the instant path, and would need a registry entry) | Same |
| Press | Reactive | Chip `active:opacity-70`; Arena segments `PressableScale` (0.97, `instant`, `spring.press`) | 0.85 opacity dip |

### Haptics (`haptics` from `@/lib/motion`)

| Event | Haptic | Rule |
|---|---|---|
| Tap Go live (any surface) | none at the tap | The haptic marks the result, not the press |
| Chip turns green after a tap (optimistic or fresh fix) | `goLive` (Light impact) | Exactly once per attempt. A `recovering` beat followed by success does not fire it again |
| Automatic restore (foreground, after a match, cold start) | none | Change from today: the tab-icon clash currently fires `goLive` on every live false to true. A buzz each time the athlete opens the app is a surprise, so restores must pass a `reason: "restore"` that suppresses the haptic and the clash |
| Pending, recovering, rollback, sheet, toast | none | Never a haptic on a failure here (the sheet or toast says it; `error` is for mutations the athlete is waiting on) |
| Go offline | none | |
| Drift sheet, Update | none | No state change |
| Accept a challenge | `accept` | Unchanged |

Haptics stay on under Reduce Motion (DESIGN.md).

## 6. Edge cases and anti-patterns

1. **Flicker on restore.** The chip must not draw `GO LIVE` for a frame and then `LIVE` on foreground, after a match, or on cold start. With a remembered intent and a valid tag, the restore state is drawn as `live` from the first frame.
2. **Flicker on the instant path.** Never green, grey, green inside one attempt unless the write actually failed (`recovering`). A late server ack never redraws anything.
3. **Pending flash.** Nothing pending is drawn before 240 ms. A label chosen at 240 ms (GOING LIVE or FINDING YOU) never changes to the other within that attempt.
4. **Double toasts.** One go-live toast at a time: a new one replaces the old (`toast.hide()` first). A sheet and a toast are never shown for the same failure. The header chip's own tap never toasts (its RETRY state is the message).
5. **Toast spam on every foreground.** Location toasts fire only from a restore that actually failed, and the failure clears the remembered intent, so the next foreground is silent. The old 1d "permission lost while live" CTA is removed: a refresh failure never takes the athlete offline, so there is nothing to tell them.
6. **Sheets in the background.** Sheets only open from an athlete tap while active; backgrounding cancels the flow and closes any sheet (existing 1e). The drift sheet is dropped, not queued.
7. **Stale chip after a server end.** Any refresh that reads `looking_for_ranked` false while the chip is green drops the chip at once with the one toast in (j). A realtime update of the athlete row must be enough; the chip must not wait for the next foreground.
8. **Double taps.** `finding-you` and `going-live` are disabled; the optimistic green chip's tap opens the live menu, which is correct.
9. **Tap during a sheet.** The chip is under the modal scrim; it cannot be tapped. The Arena LIVE segment likewise.
10. **Settings round trip.** Returning from Settings never starts a go-live by itself; the athlete's next tap does. (Starting automatically would be live without a fresh tap, and the athlete may have only been looking.)
11. **App switcher snapshot.** iOS snapshots the screen on background while the chip is still green. Acceptable: the app is offline by then and the chip is correct the moment it is active again (restore draws `live` from the first frame when it will restore).
12. **Clock skew.** The stored tag's time is the server's `captured_at` (PM 4.1), and the server clamps or refuses skewed capture times (PM 3.4), so a wrong device clock cannot make an old tag look fresh for long. If the server refuses the tag after an optimistic flip, the ladder moves on (rung 3, then rung 4 with `finding-you`).
13. **Stored tag from another account.** The stored tag is keyed by athlete id and cleared on sign-out and account deletion.
14. **Incoming challenge while `finding-you`.** Cannot happen: the athlete is not live yet.
15. **Match ends while the app is in the background.** The restore runs on the next active, per (i).
16. **Coarse OS cached fix.** Never counts as evidence. Neither does a cached fix over 4 h old or worse than 100 m.
17. **Anti-pattern: a permanent "location off" chip.** Rejected (section 2.2): it would greet new athletes with an error.
18. **Anti-pattern: asking for permission when a valid tag exists.** Rejected: it turns the instant path into a modal for no gain.

## 7. UX acceptance checklist (iOS simulator, screenshots)

Simulate location with `xcrun simctl location`; toggle permission in Settings; use Network Link Conditioner (or airplane mode on device) for (g). Each item: what the screenshot must show.

1. **Offline, Home tab.** Chip `○ GO LIVE · N`, grey ring, grey outline, no fill.
2. **Instant go-live (a).** Screenshot within 200 ms of the tap: chip `● LIVE · N` green with fill; no pending ring captured in any frame (record a screen video; no frame shows `◌`).
3. **Instant go-live on the Arena (a).** Control bar LIVE segment selected, green dot, `Live` in green; counts unchanged.
4. **Fresh fix (b).** Clear the stored tag; a frame between 240 ms and the fix shows chip `◌ FINDING YOU` with the grey pending ring; the final frame shows `● LIVE`.
5. **Fresh fix timeout (c).** Location set to none: after about 10 s the "No location" sheet with Retry and Not now over the scrim; chip under it `○ GO LIVE`.
6. **Fresh fix too rough (c).** Location with 300 m accuracy: "Location too rough" sheet.
7. **Allow Once lapsed, valid tag (d).** Grant Allow Once, go live, background, return, go offline, tap Go live: chip green at once, no sheet, no system dialog in any frame.
8. **Allow Once lapsed, no tag (d).** Explain sheet "Location to go live" with the new body; after Continue, the system dialog over the busy sheet ("Finding your location..."); after Allow, chip `● LIVE`.
9. **Denied, no tag (e).** Denied sheet with the new body and Open Settings, Retry, Not now. After Not now: chip `○ GO LIVE`.
10. **Denied, valid tag (e).** Chip green at once; no sheet.
11. **Precise off, no tag (f).** Precise Location sheet with the new body.
12. **No network (g).** Airplane mode with a valid tag: frame at 240 ms shows `◌ GOING LIVE`; after 15 s `○ OFFLINE · RETRY`; no toast from the chip; the same from the Arena segment shows the toast "Couldn't take you live. Try again."
13. **Recovering (g).** Throttle so the write takes over 5 s: green, then `◌ RECONNECTING`, then green; only one haptic (verify by log).
14. **Cold start live (h).** Kill while live, relaunch within 4 h: the first rendered frame of the tab root shows `● LIVE` (no `○ GO LIVE` frame in the video).
15. **Cold start live, no tag, no permission (h).** Chip `○ GO LIVE` and the toast "Location is off for ELO RATED. Tap to go live again."
16. **Return under 4 h (i).** Background 1 minute, return: first frame `● LIVE`; no toast.
17. **Return over 4 h, granted (i).** Advance the stored tag time past 4 h (debug hook): first frame `◌ FINDING YOU`, then `● LIVE`; no toast.
18. **Return over 4 h, fix fails (i).** Toast "Couldn't find your location. Tap to go live again."; background and return again: no second toast.
19. **Server end while open (j).** Set `looking_for_ranked` false server-side: chip `○ GO LIVE` and toast "You're offline now. Tap to go live again."
20. **Drift (k, flag on).** Move the simulated location 1.2 km while live and wait for the 5 minute check: bottom sheet "Still on the same mat?" with Update and Go offline; chip still `● LIVE` behind it. After a swipe down, the next drifted check does not re-prompt.
21. **Go offline (l).** Chip `○ GO LIVE · N` on the tap frame; Arena OFFLINE selected.
22. **Challenge accept (m).** Accept goes straight to face-off with no location sheet or wait; after the match, the tab root chip's first frame is `● LIVE`.
23. **Reduce Motion.** With Reduce Motion on, screenshots of `FINDING YOU` and `LIVE` show the static ring and static green dot; sheets appear without a fade.
24. **Dynamic Type at 1.3x.** `◌ FINDING YOU` and `◌ FINDING YOU ▪ CONFIRM` fit the 160 pt cap without truncating `FINDING YOU` (CONFIRM compacts to `▪` if needed).
25. **VoiceOver.** Chip label in `finding-you` reads "Live status: finding your location"; "You're live" is announced once after a tap and not after a restore.
26. **Light mode.** Items 1, 2 and 4 repeated in light mode: green is `#116A33`, grey is `#575C68`.

## 8. Canvas boards that change after ship (list only)

Do not touch the canvas until the code ships; then `/canvas-sync` redraws these on "ELO RATED Native Screens", "Current app" page:

- **12-Arena-Offline** ("Arena: offline (Go Live)"): the control bar and the chip's offline state, and the GOING LIVE pending as it applies.
- **13-Arena-Live** ("Arena: live roster"): the control bar LIVE state (unchanged look, but a check after ship).
- **58-Go-Live-Location**: the explain, denied and Precise Location sheets (new bodies).
- The drift prompt (`DriftPromptSheet`) goes on a proposed page while `live_location_drift_check` is off, and moves to "Current app" only when the flag is turned on.
- **48-System-Overlays** ("System: offline + update"): if it shows the location-off toast, the toast set (unchanged copy plus the two new toasts) and the RETRY chip with the offline banner.
- Every board that draws the header chip in a pending state (the GOING LIVE chip): add the new `◌ FINDING YOU` chip state wherever the GOING LIVE chip is drawn (likely 12 and 58; check `board-map.json` for `components/layout/header-status-chip.tsx`).

## 9. Differences from the PM spec, and resolutions

Checked against `addendum-optimistic-go-live.md` (DRAFT 2026-10-04) before commit. The PM spec already resolves what this spec first flagged: the 10-minute expiry is removed (PM 3.8), the gate moves to a 4 h `captured_at` tag (3.4, 3.6), the device store is specified and the "never stored on the device" docstrings are corrected (4.1), the 60 s refresh and the live-time permission CTA (old item 1d) are removed (4.2), and a tag aging past 4 h does not end a session (D3). The remaining differences:

- **C1. When the chip turns green (PM 4.2, "The athlete is shown LIVE only once the live write landed"; rungs 1 to 3 show the GOING LIVE pending state).** This spec flips the chip green on the tap when a valid tag exists on the device (rungs 1 and 2) or in the OS cache (rung 3), and confirms in the background. Reason: rungs 2 and 3 are two round trips (PM D5, 200 to 400 ms on a good connection, far more on gym Wi-Fi or LTE in a basement), so the PM flow shows a pending ring on most taps, which misses the owner's "instant, no spinner" target. The flip does not make anyone live without a tag: the tag exists, and the server still gates the write. Fallback if the PM or owner rejects the flip: keep the PM's rule but apply this spec's 240 ms reveal (`PENDING_REVEAL_MS`), so a write that lands within 240 ms shows no pending state at all, and keep `GOING LIVE` as the label after that.
- **C2. Restores show `FINDING YOU` (PM 4.2: restores run rung 4 silently, "no sheet, no FINDING YOU").** Agree on no sheet and no prompt. Disagree on no visible state: a silent fix can take 10 s, during which the chip would read `○ GO LIVE` for an athlete the app is about to put live, and a tap on it would race the restore. This spec shows `◌ FINDING YOU` (disabled) for a restore that runs rung 4 (sections 3h, 3i). With a valid tag, restores draw `● LIVE` from the first frame (C1 applies).
- **C3. The restore failure toast when the silent fix fails (PM 4.2: "You're offline. Go live again in the Arena.").** This spec uses "Couldn't find your location. Tap to go live again." with a tap that runs the tap flow, because the cause is location and the athlete can act on it right there; the PM's copy stays for a write failure with a valid tag. Minor; either works.
- **C4. Drift prompt presentation.** Aligned with the PM's copy, buttons, threshold, cadence and once-per-streak rule. This spec picks the bottom sheet (PM allows "bottom sheet or banner") and names the component `DriftPromptSheet`.
- **C5. Haptic and blade clash on automatic restores.** Not covered by the PM spec. This spec suppresses both on restores (section 5), which changes the DESIGN.md registry entry for the blade clash ("live false to true").
- **C6. A new toast when the server ends a session while the app is open** (section 3j). Not in the PM spec, which keeps `dropIfServerOffline` without UI. Additive.
- **C7. Explain, denied and Precise Location sheet copy** (section 4) drops the "same mat as your opponent / start matches" claims, since the match-start check is now off (PM decision 3). Not in the PM spec; the copy lives in `packages/shared/src/utils/invite-copy.ts`, which the PM's mobile slice touches anyway.

## 10. Assumptions and open questions

Assumptions:

1. A valid stored tag is enough to go live even when location permission is now denied, lapsed or coarse (PM Q3; this spec designs for "yes").
2. The PM's constants hold: 4 h tag minus a 2 minute margin, 100 m, one background refresh (15 minute floor for rung 1), drift every 5 minutes at 500 m net of accuracy.
3. NetInfo is available to know "no connection" at the tap (section 3g); without it, the tap takes the `recovering` path instead.
4. The drift flag stays OFF; `DriftPromptSheet` is built behind it and drawn on a proposed canvas page until it is turned on.

Open questions for the owner:

1. C1: may the chip turn green on the tap when the device already holds a valid tag (recommended), or only after the server confirms?
2. C2: should a restore that needs a fresh fix show `FINDING YOU` (recommended) or stay `GO LIVE` until it resolves?
3. C5: suppress the go-live haptic and tab-icon clash on automatic restores (recommended), or keep buzzing on every live transition?
4. Should the 12-hour-cap toast name the reason ("You've been live for 12 hours, so we took you offline.") instead of the generic "You're offline now. Tap to go live again."?
5. PM Q4 has a UX side: with the drift flag off, "On the mat" can be up to 4 h stale. Is the one background refresh enough until the drift check is turned on?

## Appendix A. Dev-only QA hooks (simulator testing)

Added in review round 1 so the UX checklist (section 7) can be run on the iOS simulator without a real 4 hour wait, a real dead network or a real bad fix. Source: `apps/mobile/lib/arena/dev-go-live-hooks.ts` and `__devAgeDeviceTag` in `apps/mobile/lib/location/device-location-store.ts`.

They exist only in development builds. Every entry point checks `__DEV__` first; Metro sets it to `false` in a production bundle, so the bodies are dropped by the minifier and the hooks can never change a release build. This was checked by exporting a production iOS bundle (`npx expo export --platform ios --no-bytecode`) and searching it for the menu titles below: none are present.

**How to trigger them.** With a development build or Expo Go running the app signed in as an active athlete:

1. Open the React Native dev menu (shake the device, or press Cmd+D in the iOS simulator).
2. Pick one of the "Go live: ..." items. Each fault is one-shot: it applies to the next matching call only.

| Dev menu item | Effect | Checklist items it serves |
|---|---|---|
| Go live: age stored tag by 4 h | Moves the stored go-live tag (and the in-memory browse reading) 4 hours into the past, so it no longer counts | 17, 18 (return after more than 4 h), restores without a tag |
| Go live: next report fails | The next `go_live` report fails at once, as a network error would | 12, 13 (recovery) |
| Go live: next write hangs 20 s, then fails | The next live write waits 20 s and then fails | 13 (RECONNECTING, then OFFLINE · RETRY) |
| Go live: next write fails | The next live write fails at once | 12, 13 |
| Go live: next fix times out | The next location fix reports a timeout | 5 (No location sheet), 18 (restore toast) |
| Go live: next fix 300 m (too rough) | The next fix comes back at 300 m | 6 (Location too rough) |
| Go live: next fix 1414 m (Precise off) | The next fix comes back at 1414 m (iOS treats 1000 m or worse as Precise Location off) | 11 (Precise Location sheet) |
| Go live: clear dev faults | Drops every queued fault | any |

**Other values.** In the JS debugger console (the dev menu's "Open JS Debugger"), the same hooks take any value:

- `__goLiveDev.ageTag(5)`: age the stored tag by 5 hours.
- `__goLiveDev.failNext("report")` or `__goLiveDev.failNext("write", 8)`: fail the next report, or hang the next write 8 s and then fail it.
- `__goLiveDev.nextFix({ accuracyM: 150 })` or `__goLiveDev.nextFix({ timeout: true })`: override the next fix.
- `__goLiveDev.clear()`: drop every queued fault.

Network faults go through the same recovery as real ones: a forced report failure is retried silently, so to see OFFLINE · RETRY queue the failing write together with a dead network (Network Link Conditioner, or airplane mode on a device), or use the hanging write.
