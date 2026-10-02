# Live Chip header + Mat Board Arena (mobile)

Status: approved design, build-ready spec. Author: PM agent, 2026-09-28.
Platform: `apps/mobile` only (plus two small `jr_be` push changes). Web is out of scope (see the native-first rollout rule).
Interactive mockup (approved): https://claude.ai/artifact/6DMou3iSc7n8hSR4ioNhxK
Beads epics: mobile `jits-dq85`, backend `jr_be-v91` (issue map in section 13).

Code references below were verified against `origin/development` of both repos on 2026-09-28 (jits_web `1c3b2bf`, jr_be `296951f`). The local checkouts are behind; always read current code from `origin/development` before building.

---

## 1. Problem

Being live in the Arena is the single most important state in the app, and today it is almost invisible:

- The header shows a small `LivePill` only while live (`components/layout/live-header-signal.tsx`), and nothing at all while offline, so there is no one-tap path to go live from Home, Rankings or Profile.
- An incoming challenge is a bottom sheet that can only be accepted or declined. There is no way to set it aside, no sense of how long it stays valid, and a second challenge is silently dropped until recovery offers it later.
- A result waiting for confirmation is only discoverable from Home's Resume card.
- The bell is mounted four times (four realtime channels) and counts every pending challenge up to 7 days old, so the badge is noise.
- The Arena screen is prose-heavy plates (`GoLivePlate`, `WaitingPlate`, explainer paragraphs, `RematchHint`) with no answer to "who should I roll with right now".

## 2. Goals and non-goals

Goals:

1. A status chip in every tab-root header that shows live state, lobby size, and any challenge or pending result, and makes going live a single tap.
2. An incoming-challenge sheet that shows stakes and freshness, resists accidental taps, and can be minimized into the chip ("Later").
3. An Arena tab rebuilt as a "Mat Board": control bar, challenge strip, Closest Match, On The Mat, Just Rolled (online athletes only; see section 14, D1).
4. A tab-bar badge on Arena, a single app-wide bell with a fresh-only badge, and push notifications that land on the Arena.

Non-goals (deferred, filed as backlog, section 11): GEO proximity filtering, Just Rolled avatars and rating change, server-side 10-minute challenge expiry, a ROLLING / live-matches count, and any web work.

## 3. Brand and motion constraints (non-negotiable)

- One Signal Red (`--accent-cta`, `bg-cta`) CTA per surface. Red never decorates data.
- No shadows. Radius 2 to 4 (`--radius-xs`..`--radius-md`); sheets keep 8 (`--radius-lg`).
- No new animations. The only auto-animations remain the 480ms rating tick (`elo-tile.tsx`) and the 1400ms LIVE pulse (`components/ui/elo-system/live-pill.tsx`, `PULSE_DURATION_MS`). The chip's green dot reuses that pulse; it is the only pulse in the app. Countdown text updates once per second (a text change, not an animation).
- Fonts: JetBrains Mono Bold caps for chip and numerics (tabular-nums), DM Sans caps for tab titles and labels, Bebas only for the wordmark.
- Status colours: green (`--state-positive`) for live, ink-3 for offline and degraded states, red only for "someone wants you" (incoming) and the single CTA. Reconnecting and write failure are NEVER red.

## 4. Header (all four tab roots)

### 4.1 Layout

| Tab | Left | Right |
|---|---|---|
| Home | Wordmark | Status chip, then bell |
| Rankings | Wordmark | Status chip, then bell |
| Arena | Tab title "ARENA" (DM Sans caps) | Status chip, then bell |
| Profile | Tab title "PROFILE" (DM Sans caps) | Status chip, then bell |

The chip stays on the Arena tab even though the Arena control bar mirrors it (user decision: the double-up is intended).

Implementation: one shared component (working name `HeaderStatusChip`, `components/layout/header-status-chip.tsx`) replaces `components/layout/live-header-signal.tsx` in both `BrandHeader` and `AppHeader`. Today the four roots use `BrandHeader` (Home, Rankings) and `AppHeader` (Arena with `liveSignal="static"`, Profile). Move the Arena and Profile titles to the left per the table; this may be a new `AppHeader` prop (for example `titleAlign="left"`) so pushed screens keep their centred titles. The existing `jits-a8y.19` (Home and Rankings hand-roll header chrome) can be folded in if convenient but is not required.

Pushed screens (`match/[matchId]`, `practice`, `profile-setup`, settings, athlete, stats) do not get the interactive chip. They keep today's behaviour via a non-interactive live indicator exported from the same component (see open question Q1).

### 4.2 Chip geometry and type

- Visual height 28pt drawn inside a real 44pt-tall touch target (no reliance on `hitSlop`). Radius 2. Max width about 150pt.
- JetBrains Mono Bold, caps, 10 to 11px, `tabular-nums`. `maxFontSizeMultiplier` about 1.3.
- Truncation order: the athlete NAME truncates first (ellipsis). The count and the countdown never truncate.
- Border 1px hairline weight (no 2px borders).

### 4.3 States and copy

The chip is a pure function of: live state (`isLive`, `isSaving`, reconnecting, last write failed), lobby count (excluding self), outgoing challenge, incoming challenges (count, whether the top one is tucked away), and pending result to confirm. Precedence when several apply, highest first: incoming (tucked) or multiple incoming, waiting (outgoing), then the base live/offline state; the CONFIRM marker is appended to the base state only.

| State | Copy | Style | Tap |
|---|---|---|---|
| Offline | `○ GO LIVE · 12` | Hollow ring, ink-3 outline, no fill | Go live (1 tap). |
| Going live | `◌ GOING LIVE` | ink-3, disabled | None. |
| Live | `● LIVE · 12` | Green dot with the 1400ms pulse, green border, 10% green fill | Opens popover (4.4). |
| Live, empty lobby | `● LIVE · JUST YOU` | As Live | Popover. |
| Waiting (outgoing) | `● WAITING · ALEX · 8:12` | As Live | Opens the Arena. Countdown to the 10-minute freshness window (`ARENA_CHALLENGE_FRESH_MS`, `packages/shared/src/constants.ts:32`) measured from the outgoing challenge's creation. |
| Incoming, tucked away ("Later") | `! ALEX · 8:41` | Red border | Reopens the challenge sheet. Countdown to the same window from the incoming challenge's `createdAt`. |
| Multiple incoming | `! 3 WANT TO ROLL` | Red border | Reopens the sheet on the first (oldest fresh) challenge. |
| Live + pending result | `● LIVE · 12 ▪ CONFIRM` | Green (live styling kept) | CONFIRM segment opens the match; the rest opens the popover. |
| Offline + pending result | `○ GO LIVE · 12 ▪ CONFIRM` | Grey (offline styling kept) | CONFIRM segment opens the match; the rest goes live. |
| Reconnecting | `◌ RECONNECTING` | ink-3 | None (or popover if live). |
| Flag write failed | `○ OFFLINE · RETRY` | ink-3, never red | Retries going live. |

Rules:

- **Counts** are the lobby size EXCLUDING self (section 6.1). Offline chips still show the count, so "12" means "12 people you could roll with if you went live".
- **Go live guard (F11):** the chip and the Arena toggle are disabled while `isSaving`, and a go-live or go-offline action is followed by a 2s cooldown before the next one. There is deliberately NO after-the-fact undo, because the realtime server closes a presence channel after more than 5 track/untrack calls per 30s (jits-fa9x, `lib/arena/use-lobby-presence.ts:42-54`).
- **Pending result never changes live state.** The app already restores live after "Leave and confirm later" (`use-arena-live.ts:393-414`); the CONFIRM marker is additive. The pending/active match source is the existing `getMyActiveMatch()` (`packages/shared/src/api/queries.ts:677`) via `useMyActiveMatch` (`lib/match-flow/use-my-active-match.ts`), promoted to an app-wide store (F10). No new RPC.
- **Accessibility labels must not collide with the Arena toggle.** The match-loop harness finds buttons labelled exactly `Go live` / `Go offline` (`tools/match-loop/sim/screens.ts:86-102`). The chip must use distinct labels, for example `Live status: offline, 12 on the mat. Go live` and `Live status: live, 12 on the mat. Open live menu`, and a separate `Confirm result` label on the CONFIRM segment. Every chip state carries a testID (`header-status-chip`, plus `header-status-chip-confirm`).

### 4.4 Live popover

Opened by tapping a live chip. Two actions and one line of copy:

- `[Open Arena]` (outline) and `[Go offline]` (outline). Going offline is therefore two taps.
- Copy: "Leaving the app takes you offline. Your screen stays on while you're live."
  Both behaviours already exist: backgrounding goes offline (`use-arena-live.ts:366-391`) and the screen stays awake while live (`useArenaLiveKeepAwake`, `lib/arena/arena-bootstrap.tsx:36-57`). The copy documents them; no new behaviour.
- Radius 4, no shadow (surface tier shift plus hairline), dismiss on outside tap.

### 4.5 Bell

- Mounted through ONE app-wide store (F4). Today `NotificationBell` renders in 4 always-mounted tab headers, each running its own `usePendingChallenges` realtime channel (`challenges-${athleteId}:${mountId}`). This supersedes `jits-qx1z`.
- Badge counts only FRESH (created within 10 minutes) incoming challenges plus unseen highlights (F3). Today `packages/shared/src/hooks/use-pending-challenges.ts:40-71` counts every pending, unexpired challenge (up to 7 days).
- Older pending challenges appear in a "Missed" section of the panel, not in the badge.
- Rows are tappable: challenge rows go to `/arena`. The `match_result` rows still carry the retired `/session/<id>` route (`jits-r01i`); fix that route in the same slice or keep those rows non-tappable until it lands.

## 5. Incoming challenge sheet

Upgrade the existing `components/arena/challenge-prompt-sheet.tsx` (mounted once in `lib/arena/arena-bootstrap.tsx:149-155`).

- **Stakes:** win/loss ELO for the viewer (the existing `StakesStrip` / `useViewerStakes` stays).
- **Freshness countdown:** `m:ss` until 10 minutes after the challenge was created. Requires `createdAt` (and `expiresAt`) on `IncomingChallenge` (F5): today the type (`lib/arena/use-arena-challenge.ts:64-70`) has neither, `loadIncoming()` (261-278) does not select them, and the realtime `ChallengeRow` (186-192) has `expires_at` but not `created_at`.
- **Buttons:** 56pt tall. Decline takes 1/3 of the row (outline), ACCEPT takes 2/3 (Signal Red, the sheet's one red CTA). Keep the accessibility labels `Accept challenge` and `Decline challenge` (the harness taps them by label).
- **Input guard:** Accept and Decline ignore taps for 600ms after the sheet appears (a stale finger from the previous screen must not accept).
- **Later:** an explicit text button, no swipe (`enablePanDownToClose` stays false). Later minimizes the sheet into the chip (`! ALEX · 8:41`). It sends NOTHING to the challenger: the challenge stays pending and the challenger keeps seeing `WAITING`.
- **Auto-clear:** the sheet and the tucked chip clear when the 10-minute window passes, when the challenge leaves `pending`, or when the challenger leaves the lobby.
- **Multiple incoming:** the sheet shows the first challenge only, plus a line `+2 more`. Keep the existing rules: the first challenge keeps the surface (`use-arena-challenge.ts:911-930`, `offerIncoming` 1470-1491), and entering a match declines every other fresh pending incoming challenge (`declineOtherPendingChallenges`, `packages/shared/src/api/mutations.ts:256-300`, via `settleOthersAfterEntry`). The store needs an incoming COUNT (F9), which requires tracking the other fresh incoming challenges rather than dropping them.
- Existing a11y fix (jits-ef2a, sheet content reachable by VoiceOver/idb) must be preserved.

## 6. Arena tab: the Mat Board

Top to bottom inside `app/(app)/(tabs)/arena/index.tsx`:

1. **Control bar** (sticky, 56pt): segmented `[OFFLINE | ● LIVE]` toggle bound to the same store and guard as the chip, and the counts line `12 ON MAT · 7 IN BAND`. The two segments keep the accessibility labels `Go live` and `Go offline` (harness contract).
2. **Challenge strip** (48pt), rendered only when relevant:
   - incoming: red rail, `ALEX WANTS TO ROLL · 8:41`, action `OPEN` (reopens the sheet);
   - waiting: `WAITING · ALEX · 8:12`, action `Cancel` (accessibility label stays `Cancel challenge`, and the text `Waiting for Alex` must remain readable by the harness, see 9.3);
   - result to confirm: `RESULT TO CONFIRM`, action `Confirm` (opens the match).
3. **Closest Match card:** the live athlete with the smallest `|ΔELO|` versus you, their stakes, and the surface's single red CTA `CHALLENGE <NAME>` (accessibility label `Challenge <name>`). Offline: the CTA becomes red `GO LIVE TO ROLL`. When an incoming or waiting challenge exists, this CTA demotes to outline, so red means "someone wants you". Empty lobby: the card shows an empty state without a red CTA.
4. **On The Mat:** rows of live athletes sorted by `|ΔELO|` ascending, 48pt each: `Avatar`, name, ELO, `±Δ` vs you (mono, state coloured), weight, and an outline `ROLL` button (accessibility label `Challenge <name>`). A row you have challenged shows `SENT 8:12` instead of ROLL. A rematch pin becomes a small tag on the row (replaces `RematchHint` prose).
5. ~~**Just Rolled**~~: removed by the owner, 2026-10-01 (the Arena no longer shows it; `JustRolled`, `formatJustRolled` and `useArenaRoster().recentActivity` are deleted, the backend `recent_activity` payload is unchanged). Original text: text ticker from `get_arena_data.recent_activity` as returned today: `winner def. loser · method · age` (columns `winner_name`, `loser_name`, `result`, `match_type`, `completed_at` from `get_recent_activity`). No avatars or rating change (deferred).
6. ~~**Off The Mat**~~: removed (section 14, D1). The Arena lists online athletes only; athletes who are not in `lobby:online` (including stale "open to challenges" athletes, F13) are not shown anywhere on it.

Remove: `GoLivePlate` prose, `WaitingPlate`, the static LIVE pill on the Arena header (`AppHeader liveSignal="static"`) and the `LivePill` inside `GoLivePlate`, the explainer paragraphs (`arena-plates.tsx`, the "Open to challenges" subtitle), `RematchHint` prose, and the excess bottom padding (`PageContainer` uses `96 + insets.bottom`; verify the right value on device, and note `PageContainer` is shared, so scope the change to the Arena).

### 6.1 Counts (F6)

Superseded by section 14, D2 (every number is derived from the list it summarises):

- ON MAT = the number of On The Mat rows: the roster (`get_arena_data.looking_athletes`) intersected with `lobby:online`, self excluded. A presence key with no roster athlete is never counted.
- IN BAND = the On The Mat rows whose displayed ELO gap (the rating the row shows, from the roster) is within ±100, inclusive. The presence payload's `current_elo` is not used.
- Both are selectors on the existing listen-only observation (the channel is observed app-wide without tracking until `joinLobby()`), so offline athletes also see counts. No new presence calls.

## 7. Tab bar badge (F12)

`components/layout/elo-tab-bar.tsx` renders only icon and label and ignores `tabBarBadge`; add badge support. Arena tab badge:

| Condition | Badge |
|---|---|
| Fresh incoming challenges (1+) | Red count |
| Live (including live + pending confirm), no incoming | Static green dot (no pulse) |
| Offline + pending confirm | Hollow ring |
| Offline, idle | Nothing |

## 8. Push and deep links

- **F1 (jr_be + mobile):** the challenge INSERT push (`jr_be supabase/functions/push/index.ts:300-304`, today `data: { type: "challenge", id }`) adds `arena_href: "/arena?challenge=<id>"`. Status pushes (accepted, declined, cancelled, expired, :311-401) add `arena_href: "/arena"` (section 14.2: a new key, not `route`, so older builds ignore it). Follow the `highlight-payload.ts` pattern (pure builder module + `*_test.ts`). Mobile `lib/notifications/handlers.ts:69-78` already honours `data.route`. The Arena reads `?challenge=` (it reads only `?rematch=` today, `use-rematch-pin.ts:58`): if live, the existing listener/recovery raises the sheet; if offline, the Arena offers go-live, after which `use-pending-challenge-recovery.ts` raises the sheet (only while the challenge is fresh and the challenger is still in the lobby). A challenge that is no longer fresh shows nothing (no error toast).
- **F2 (jr_be):** stop the "Challenge Expiring Soon" push (`Deno.cron("check-expiring-challenges", "*/15 * * * *")`, `push/index.ts:549-610`). It selects pending challenges whose `expires_at` falls within the next hour and notifies BOTH parties; with the 7-day default `expires_at`, that fires about 7 days after an unanswered Arena challenge. Also review the "Challenge Expired" push (:371-390), which fires on the pg_cron sweep and notifies both parties. There is no arena column on `challenges`, so the change applies to all challenges (web profile-sheet challenges included); that is acceptable because the frontend already withdraws stale outgoing challenges after 10 minutes (jits-celf). Related: `jits-zoru` (quiet cancels still push).

## 9. Delivery, testing and constraints

### 9.1 Delivery

JS-only: every dependency the design needs (reanimated, gorhom bottom-sheet, expo-keep-awake, expo-haptics, expo-notifications) is already in the 0.4.0 binary, and no `app.json` or plugin change is required. Ship mobile via OTA per `jits_web/CLAUDE.md` (runtime 0.4.0, confirm the TestFlight submission for that runtime first). If any slice adds a native dependency or touches `app.json`, it escalates to a TestFlight build. The jr_be push change deploys with `supabase functions deploy push`.

### 9.2 Quality gate

Per `jits_web/CLAUDE.md`: `npm run typecheck` and `npm run test` (Jest + jest-expo in `apps/mobile/__tests__/`, mirroring the source tree; vitest in `packages/shared`). Existing tests that will need updating: `__tests__/components/layout/live-header-signal.test.tsx`, `__tests__/components/layout/elo-tab-bar.test.tsx`, `__tests__/lib/arena/arena-store.test.ts`, `__tests__/lib/arena/use-lobby-presence.test.ts`, `__tests__/lib/arena/use-arena-challenge.test.ts`, `__tests__/components/arena/challenge-prompt-sheet.test.tsx`, `__tests__/components/notifications/notification-bell.test.tsx`, `__tests__/screens/arena.test.tsx`, `__tests__/app/tabs-layout.test.tsx`. jr_be: `deno test --allow-read supabase/functions/` for the push payload builder.

### 9.3 Match-loop harness contract

`tools/match-loop` drives the simulator by accessibility label. Keep these exact labels or update the harness in the same change: buttons `Go live`, `Go offline`, `Challenge <name>`, `Cancel challenge`, `Accept challenge`, `Decline challenge`; StaticText `Waiting for <name>`. The chip must not reuse `Go live` / `Go offline` (4.3). The harness waits 600ms after the sheet appears before tapping, which equals the new input guard; raise its wait (for example to 800ms) and re-check its fallback tap offset (sheet handle + 160pt, x 0.26 / 0.74), which the new layout will move.

## 10. Acceptance criteria (testable)

### 10.1 Header chip

- AC-H1: On Home, Rankings, Arena and Profile the header shows exactly: left (wordmark on Home/Rankings, caps title on Arena/Profile), right (chip, then bell). No other right-side actions.
- AC-H2: Offline with 12 others in the lobby renders `○ GO LIVE · 12`; tapping it calls `arenaActions.goLive()` exactly once.
- AC-H3: While `isSaving` the chip renders `◌ GOING LIVE` and is disabled; a tap does nothing.
- AC-H4: After a go-live or go-offline completes, a second action within 2s is ignored (chip and Arena toggle both); after 2s it works. No undo toast exists.
- AC-H5: Live with 12 others renders `● LIVE · 12` with green styling and the existing 1400ms pulse; with 0 others renders `● LIVE · JUST YOU`. The count never includes self, and is the same number of On The Mat rows the Arena renders (D2); with no roster loaded or the lobby unknown it reads `● LIVE` / `○ GO LIVE` with no number.
- AC-H6: Tapping a live chip opens a popover with `Open Arena`, `Go offline` and the copy "Leaving the app takes you offline. Your screen stays on while you're live."; `Go offline` takes the athlete offline; `Open Arena` navigates to the Arena tab.
- AC-H7: With an outgoing challenge to Alex created 1:48 ago the chip renders `● WAITING · ALEX · 8:12` and the countdown decrements each second; at 0:00 it returns to the base state.
- AC-H8: With one incoming challenge tucked away via Later, the chip renders `! ALEX · m:ss` with a red border; tapping it reopens the sheet on that challenge.
- AC-H9: With three fresh incoming challenges the chip renders `! 3 WANT TO ROLL`.
- AC-H10: With a pending result and live, the chip renders `● LIVE · 12 ▪ CONFIRM` in green; tapping the CONFIRM segment opens that match; tapping the rest opens the popover. Offline equivalent renders `○ GO LIVE · 12 ▪ CONFIRM` in grey, and tapping the rest goes live. In neither case does the pending result change `isLive`.
- AC-H11: Reconnecting renders `◌ RECONNECTING`; a failed flag write renders `○ OFFLINE · RETRY` and tapping retries. Neither uses red.
- AC-H12: With a very long name and the largest Dynamic Type size, the name truncates and the count and countdown remain fully visible; font scaling caps at about 1.3x; the chip stays within about 150pt.
- AC-H13: Chip accessibility labels never equal `Go live` or `Go offline`; the hit area is at least 44pt.
- AC-H14: Only one bell instance and one pending-challenges realtime channel exist app-wide, regardless of tabs visited.
- AC-H15: The bell badge counts fresh (under 10 min) incoming challenges plus unseen highlights only; a 2-hour-old pending challenge appears under "Missed" and is not counted; tapping a challenge row navigates to `/arena`.

### 10.2 Incoming sheet

- AC-S1: The sheet shows the challenger, the viewer's win/loss stakes, and a countdown to 10 minutes after the challenge's `createdAt`.
- AC-S2: Decline and Accept are 56pt tall; Accept is Signal Red and about twice Decline's width; labels are `Accept challenge` / `Decline challenge`.
- AC-S3: Taps on Accept or Decline within 600ms of the sheet appearing are ignored; after 600ms they work.
- AC-S4: Later minimizes the sheet into the chip, sends no write to `challenges` and no push; the challenger's state is unchanged.
- AC-S5: The sheet (or tucked chip) clears automatically at the 10-minute mark, when the challenge leaves `pending`, or when the challenger leaves `lobby:online`.
- AC-S6: With three fresh incoming challenges the sheet shows the first plus `+2 more`; the store exposes an incoming count of 3; entering a match from the first still declines the others (existing behaviour).
- AC-S7: The sheet cannot be swiped closed.

### 10.3 Arena (Mat Board)

- AC-A1: The control bar is sticky, 56pt, shows `[OFFLINE | ● LIVE]` mirroring the chip (toggling one updates the other) and `N ON MAT · M IN BAND`, where N is exactly the number of On The Mat rows (self and presence keys with no roster athlete never counted) and M counts those rows whose displayed ELO gap is within ±100. With nobody else it reads `NOBODY ELSE ON MAT` (no number); while the roster or the lobby is not known it reads `CONNECTING` (D2).
- AC-A2: The challenge strip renders only for incoming (red rail + OPEN), waiting (Cancel), or result to confirm (Confirm); otherwise it is absent.
- AC-A3: Closest Match shows the live athlete with the smallest |ΔELO|, their stakes, and a red `CHALLENGE <NAME>`; offline shows red `GO LIVE TO ROLL`; with an incoming or waiting challenge the CTA is outline, not red. Exactly one red CTA is on screen at any time (the incoming strip rail is a rail, not a CTA).
- AC-A4: On The Mat rows are sorted by |ΔELO| ascending, 48pt, show avatar, name, ELO, signed Δ, weight and outline ROLL; a challenged athlete's row shows `SENT m:ss` and no ROLL.
- AC-A5: ~~Just Rolled~~ (removed by the owner, 2026-10-01): the Arena renders no Just Rolled section, pinned by `__tests__/screens/arena.test.tsx`. Original: Just Rolled lists `recent_activity` entries as `winner def. loser · method · age`, with no avatars.
- AC-A6: ~~Off The Mat~~ (removed, D1): no athlete who is not in `lobby:online` is listed anywhere on the Arena, so none has a challenge action. Every count on the Arena and the header chip's `· N` equals the number of On The Mat rows it summarises (D2), pinned by an invariant test (`__tests__/lib/arena/mat-board.test.ts`, `__tests__/screens/arena.test.tsx`).
- AC-A7: None of `GoLivePlate`, `WaitingPlate`, `RematchHint` prose, explainer paragraphs or the header static LIVE pill render; the last row clears the tab bar without excess blank space (verified on device).
- AC-A8: Opening `/arena?challenge=<id>` while live raises the sheet for that challenge if it is fresh; while offline it offers go-live, and going live raises it via recovery; a stale id shows nothing.
- AC-A9: The match-loop harness core scenarios pass (go live, challenge, waiting, cancel, accept, decline).

### 10.4 Tab bar badge

- AC-T1: Two fresh incoming challenges show a red `2` on the Arena tab.
- AC-T2: Live with no incoming shows a static (non-pulsing) green dot; live plus pending confirm also shows the green dot.
- AC-T3: Offline plus pending confirm shows a hollow ring.
- AC-T4: Offline and idle shows nothing.

### 10.5 Backend

- AC-B1: The challenge INSERT push carries `data.arena_href = "/arena?challenge=<id>"`; status pushes carry `data.arena_href = "/arena"` (the key is `arena_href`, not `route`, see 14.2); existing `type`, `id`, `action` keys are unchanged; no `data.route` on challenge pushes; covered by a Deno unit test.
- AC-B2: No "Challenge Expiring Soon" push is sent for any challenge; the "Challenge Expired" decision is recorded on the bead.

## 11. Deferred (backlog, explicitly future)

- **GEO:** show only athletes near you with a user-controlled range ("later on we'll include GEO data ... give users controls on range"). It will change ON MAT and IN BAND counts and the Closest Match source.
- **Just Rolled avatars + rating change:** needs extra `recent_activity` columns (size M, backend + mobile).
- **Server-side 10-minute challenge expiry:** requires changing the `expire_pending_challenges` sweep (`20260220300000_challenge_expiration_cron.sql`, `expires_at < now() + interval '15 minutes'`, every 15 minutes) to `< now()` every minute, plus push suppression. Naively shortening the `expires_at` default to 10 minutes would expire challenges immediately because of the 15-minute lead. Related: `jits-75jt`.
- **ROLLING / live-matches count** in the control bar.
- **Stale `looking_for_ranked` heartbeat sweep** (optional backend half of F13; there is no last-seen column today). Related: `jits-hlm1.5`.
- **Practice walkthrough on the Mat Board (needs a bead):** the practice lobby (`components/practice/practice-steps.tsx`) still teaches the pre-Mat-Board Arena with `GoLivePlate`, `WaitingPlate`, `SectionLabel` and `CompetitorRow` under an "Online now" label. Move it to the Mat Board leaves (control bar, strips, Closest Match, On The Mat rows), then delete `components/arena/go-live-plate.tsx` and the `WaitingPlate` / `SectionLabel` exports in `components/arena/arena-plates.tsx`, which nothing else uses. Recorded by the build; the orchestrator files the bead and records its id here (the practice-steps.tsx header comment points to this entry).

## 12. Assumptions and open questions

Assumptions:

1. ON MAT and IN BAND are computed client-side from the On The Mat rows (roster intersected with presence, D2); no RPC is added.
2. The 10-minute countdown is measured from the challenge's `created_at` (server time), consistent with `ARENA_CHALLENGE_FRESH_MS` elsewhere; client clock skew is accepted (see `jits-75jt`).
3. "Result to confirm" is whatever `getMyActiveMatch()` returns in a confirm-pending state; no new RPC.
4. F2 applies to all challenges because `challenges` has no arena marker.

Open questions:

- Q1: Pushed screens (match, practice, settings, athlete) today show a LIVE pill in the header. Keep a non-interactive live indicator there, or drop it entirely?
- Q2: Should the "Challenge Expired" push also be removed, or kept only for the challenger?
- Q3: When the athlete goes offline with a tucked incoming challenge, should the tucked chip clear (compare `jits-1m14`) or remain until the window passes?

## 13. Issue map

| Item | Bead | Depends on |
|---|---|---|
| Epic (mobile) | `jits-dq85` | |
| F5 createdAt/expiresAt on IncomingChallenge | `jits-dq85.1` | |
| F9 incoming count in arena-store | `jits-dq85.2` | .1 |
| F8 Later / tucked state | `jits-dq85.3` | .2 |
| F6 lobby + in-band counts | `jits-dq85.4` | |
| F10 active-match store (CONFIRM) | `jits-dq85.5` | |
| F11 go-live guard | `jits-dq85.6` | |
| F4 single bell store (supersedes `jits-qx1z`) | `jits-dq85.7` | |
| F3 fresh-only badge, Missed, tappable rows | `jits-dq85.8` | .7, .1 |
| F12 EloTabBar badge support | `jits-dq85.9` | |
| F13 stale athletes not challengeable | `jits-dq85.10` | |
| F1 mobile: Arena reads `?challenge=` | `jits-dq85.11` | cross-repo `jr_be-v91.1` |
| F7 HeaderStatusChip component | `jits-dq85.12` | .1 .2 .3 .4 .5 .6 |
| Build: header chip on four tab roots | `jits-dq85.13` | .12, .7 |
| Build: sheet upgrade | `jits-dq85.14` | .1 .2 .3 |
| Build: Mat Board | `jits-dq85.15` | .2 .3 .4 .5 .6 .10 .12 |
| Build: Arena tab badge | `jits-dq85.16` | .9 .2 .5 |
| Harness update | `jits-dq85.17` | .13 .14 .15 |
| Gate: tests, review, QA, OTA | `jits-dq85.18` | .8 .11 .13 .14 .15 .16 .17 |
| Future: GEO range | `jits-dq85.19` (P4) | |
| Future: Just Rolled avatars | `jits-dq85.20` (P4) | cross-repo `jr_be-v91.5` |
| Future: ROLLING count | `jits-dq85.21` (P4) | |
| Epic (backend) | `jr_be-v91` | |
| F1 challenge push routes | `jr_be-v91.1` | |
| F2 stop Expiring Soon push | `jr_be-v91.2` | |
| Future/optional: heartbeat sweep | `jr_be-v91.3` (P4) | |
| Future: server-side 10-min expiry | `jr_be-v91.4` (P4) | |
| Future: recent_activity columns | `jr_be-v91.5` (P4) | |

## 14. Decisions (resolved)

Recorded 2026-09-28. These product decisions override anything contrary earlier in this spec.

- **D1 (no Off The Mat):** the "Off the mat" section is removed entirely. The Arena shows ONLINE athletes only (roster intersected with `lobby:online`). No component, state, rematch auto-expand, accessibility copy or test for it remains. A pinned rematch opponent who is not on the mat is not listed; their Rematch tag appears on their On The Mat row once they are back.
- **D2 (no placeholder numbers):** every number shown is derived from exactly the list it summarises. `N ON MAT`, `N IN BAND` and the header chip's `· N` are all computed from the set the On The Mat rows render: the roster from `get_arena_data.looking_athletes` intersected with lobby presence, self excluded. IN BAND uses the ELO the rows display. Zero others reads `● LIVE · JUST YOU` / `○ GO LIVE` (no number) on the chip and `NOBODY ELSE ON MAT` on the control bar. A presence key with no matching roster athlete is never counted; with the roster not loaded yet (or the lobby unknown) no number is shown (`CONNECTING` on the bar, no count on the chip). Code: `isOnTheMat`, `onTheMatRows`, `matCounts`, `countOnTheMat` in `lib/arena/mat-board.ts`; `useOnMatCount` in `lib/arena/use-lobby-presence.ts`; invariant tests in `__tests__/lib/arena/mat-board.test.ts` and `__tests__/screens/arena.test.tsx`.

- **Header chip placement:** a compact chip at the right of the header (Option 1 style) on ALL four tab roots, INCLUDING the Arena tab. The chip plus the Arena control bar double-up is intentional.
- **Pending result to confirm never changes live state:** the chip keeps its LIVE (green) or OFFLINE (grey) coding and appends "▪ CONFIRM", for example "● LIVE · 12 ▪ CONFIRM" or "○ GO LIVE · 12 ▪ CONFIRM".
- **Closest Match and Just Rolled:** the Closest Match card stays. Just Rolled stays a text ticker fed by `get_arena_data.recent_activity`; no backend change.
- **Q1 (pushed screens):** pushed (non-tab) screens keep a small NON-interactive live dot.
- **Q2 (expiry pushes):** remove the `Deno.cron` "Challenge Expiring Soon" push entirely, and suppress the "Challenge Expired" push for challenges. Both arrive about 7 days late and are noise.
- **Q3 (tucked challenge on go-offline):** a MANUAL go-offline clears a challenge tucked away with "Later" from the chip WITHOUT sending a decline (the challenge lapses naturally). Being taken offline by backgrounding does NOT clear it.
- **Arena tab red count vs the Arena (AC-T1; decided in the third review fix pass, 2026-09-28, as the option most consistent with AC-T1 and the bell; PM to confirm):** the tab keeps counting every fresh incoming challenge (the larger of the Arena store's count and the bell's fresh count), and the Arena shows every challenge behind that count. A fresh challenge whose challenger is OFF the mat (not in `lobby:online`), live or offline, gets a neutral, actionless strip: `ALEX WANTS TO ROLL · 8:41 · +1` with a plain "Not on the mat" note (neutral rail, no button, so the one-red-CTA rule holds). When the challenger returns it becomes the red offer (offline) or the prompt (live). Offline, other fresh on-mat challenges that are neither in hand nor the offer are added to the leading strip's `+N`. The rejected alternative (drive the tab count from the Arena store only) would have left an offline athlete with pushed challenges and no tab count, contradicting AC-T1. The chip is unchanged: offline it still never shows `! N WANT TO ROLL`. Code: `away` / `moreOnMat` in `lib/arena/use-challenge-deep-link.ts`, `AwayStrip` in `components/arena/mat-board.tsx`.

### 14.1 Implementation readings awaiting PM confirmation

Recorded 2026-09-28 during the review fix pass. Each item is a place where this spec is ambiguous or contradicts itself and the build had to pick one reading. The build ships the reading below; if the PM prefers the alternative, it is a small, contained change.

- **Chip width cap (spec 4.2, AC-H12):** the build caps the whole chip at **160pt**, not "about 150pt". 160 is the smallest cap that fits the spec's own AC-H10 copy `○ GO LIVE · 12 ▪ CONFIRM` (157pt) in full and `● LIVE · JUST YOU ▪` (153pt, CONFIRM compacted to its marker) at the default text size, so no state shrinks its text at 1x. Alternative: cap at 150 and let `layoutChip` also compact `▪ CONFIRM` to `▪` at 1x for `○ GO LIVE · 12 ▪ CONFIRM`. Code: `CHIP_MAX_WIDTH` in `apps/mobile/lib/arena/header-chip-model.ts` (the component only re-exports it).
- **On The Mat gap colour (spec 6.4 vs section 3):** 6.4 says the `±Δ` is "mono, state coloured"; section 3 says red never decorates data. The build draws the gap in mono ink (`text-ink-2`), which satisfies both the brand rule and legibility. Alternative: colour it with non-red state tokens (for example `positive` for a favourable gap, `ink-3` otherwise). Code: `components/arena/mat-board.tsx` (MatRow gap).
- **Offline Closest Match on an empty mat (spec 6.3 vs AC-A3):** 6.3 says "Empty lobby: the card shows an empty state without a red CTA"; AC-A3 says "offline shows red GO LIVE TO ROLL". The build reads 6.3 as the LIVE empty lobby (no CTA at all) and keeps the red `GO LIVE TO ROLL` offline even when the mat is empty. Reason: offline athletes are not in `lobby:online`, so when nobody is live every athlete who opens the Arena sees an empty mat; without the red prompt nobody is nudged to go live first and the mat never fills. Alternative: return `{ kind: "go-live", red: false }` when offline and `!hasClosest` in `closestCta` (`apps/mobile/lib/arena/mat-board.ts`).
- **WAITING chip while offline (spec 4.3 table):** the table gives WAITING the style "As Live". The build follows the live/offline colour-coding decision above instead: a WAITING chip is green `● WAITING · ALEX · 8:12` while live and grey `○ WAITING · ALEX · 8:12` while offline, so the chip never shows green for an athlete who is not live. Alternative: always render WAITING with the live tone and `●`.
- **Arena tab red count while offline (spec 7, AC-T1):** implemented as written: fresh incoming challenges give a red count whatever the live state. The count is the larger of the Arena store's incoming count and the bell's fresh-incoming count (`useArenaTabBadge`), so the Arena tab and the bell always agree, and the bell uses the Arena's own freshness rule (min(`created_at` + 10 min, `expires_at`), exclusive, on the server-clock-corrected clock) so neither counts a challenge the Arena has lapsed. Offline, the header chip shows only the challenge already in hand: one tucked with Later before the athlete was taken offline by backgrounding (Q3 keeps it), which reads `! ALEX · m:ss` with its IncomingStrip and a red 1 on the tab and the bell. It never shows `! N WANT TO ROLL` for challenges it cannot raise while offline; the offline athlete reaches those through the bell or the push deep link (`/arena?challenge=<id>`), or by opening the Arena tab itself: with no deep link and no prompt in hand, the Arena seeds the same offer strip (red `Go live to answer <name>`) from the oldest fresh challenge the bell counts whose challenger is on the mat and which is not dismissed. A seeded offer never outranks a prompt in hand (only a deep-linked one, which the athlete picked, does), so the chip and the strip never name different challengers. Everything else the tab counts shows as described in section 14 ("Arena tab red count vs the Arena"). Code: `freshIncomingCount` in `lib/arena/use-challenge-deep-link.ts`.

- **"Later" only where a chip can bring the challenge back (spec 5, AC-S4):** Later is offered only while a focused tab-root chip is registered as a reopen surface. When the prompt appears over a pushed screen (athlete profile, settings, a match), it shows Accept and Decline only: pushed screens carry a non-interactive live dot (Q1), so nothing on screen could bring a tucked challenge back. A prompt already tucked when the athlete pushes a screen comes back up after the `arena-bootstrap` grace. Alternative: offer Later everywhere and rely on the tab-root chip and the Arena strip after navigating back. Code: `useIncomingReopenSurface` in `components/layout/header-status-chip.tsx`.
- **"Exactly one red CTA" read as "at most one" (AC-A3):** the same AC and spec 6.3 demote the Closest Match button whenever something else owns red, and several states have no red owner at all: live with an incoming challenge tucked away (the strip's Open is outline), waiting on my own challenge, at the 3-challenge cap (the challenge button is disabled, so it is outline), and live on an empty mat (no CTA). The build therefore guarantees at most one red CTA on the Arena, never two, and allows zero in those states. Alternative: reword AC-A3 to "at most one". Code: `closestCta` in `apps/mobile/lib/arena/mat-board.ts`.
- **A challenge dropped by a manual go-offline (Q3) in the bell and the tab badge:** Q3 drops a challenge tucked with Later from the chip without a decline, so it stays pending server-side for the rest of its window. The build takes it out of the bell's fresh count and the Arena tab's red count on this device too, and lists it under "Missed" (no unread dot, plain `/arena` route), because no Arena surface will raise it again and a red count or a deep link would lead nowhere. Code: `splitPendingByFreshness` (`apps/mobile/lib/notifications/notification-items.ts`) and `BellHost` (`components/notifications/bell-bootstrap.tsx`).
- **My own challenge under a tucked incoming one:** when a challenge tucked with Later and my own unanswered challenge exist at once, the incoming strip leads (red rail) and the waiting strip (`Waiting for <name>`, `Cancel challenge`) shows under it, so my challenge stays cancellable. Strip precedence decides which leads, not whether a challenge can be reached. Code: `chooseStrip` (`alsoWaiting`).
- **ConfirmStrip names the opponent (spec 6.2, AC-A2):** the strip reads `RESULT TO CONFIRM · VS <NAME>`, not the bare `RESULT TO CONFIRM` the spec shows, so an athlete with several recent rolls knows which result is waiting. The suffix truncates first and the strip keeps its single outline action. Alternative: drop the `· VS <NAME>` suffix. Code: `ConfirmStrip` in `components/arena/mat-board.tsx`.
- ~~**Pushed screens' live dot does not pulse (spec 3, decision Q1):** Q1 asks for "a small non-interactive live dot" and spec 3 makes the chip's dot "the only pulse in the app", so `HeaderLiveDot` is a static green dot (a plain View), the same reasoning that removed Home's Arena-card LIVE pill. Alternative: reuse the pulsing `LiveDot` (same 1400ms pulse, no new animation). Code: `components/layout/header-live-dot.tsx`.~~
  **Superseded 2026-10-01 by the Adding Flare Motion Rule (DESIGN.md, "Motion"; owner decision):** `HeaderLiveDot` pulses on the ONE shared Arena tempo clock (`lib/arena/arena-tempo.ts`), in phase with the chip's `LiveDot`, so the app still has a single pulse rhythm. It stays its own small mark (not `LiveDot`), non-interactive, static under Reduce Motion and paused in the background.
- **A go-offline whose flag clear fails (spec 3, 4.4):** the app still commits offline (presence untracked, grey `○ GO LIVE`), so nothing on screen could retry the clear. `useArenaLive` now retries it by itself: one follow-up clear 15s later, and again on the next foreground while the athlete still means to be offline; a go-live cancels it. The neutral toast says so: "You're offline here, but we couldn't update your status. We'll retry." Code: `CLEAR_RETRY_MS` in `lib/arena/use-arena-live.ts`, `GO_OFFLINE_FAILED_MESSAGE` in `lib/arena/constants.ts`.
- **Challenge pushes tapped during a match (spec 8):** every tab-root tap during a match is DROPPED, and only highlight taps are held until the exit. That covers the status pushes' plain `/arena` (the Arena state they point at is stale by then) and a new challenge's `/arena?challenge=<id>`: entering the match already declined every other fresh pending incoming challenge (`settleOthersAfterEntry`), so opening it after the exit would override the exit destination the athlete chose and show nothing. The bell still lists it. Holding only highlights also means a challenge tap can never displace a held highlight from the single held slot. Code: `holdsDuringMatch` / `dropsDuringMatch` in `lib/notifications/handlers.ts`.
- **Control bar segment labels (spec 6.1, AC-A1):** only the segment that would change state is labelled `Go live` / `Go offline`. The selected segment reads `You are live` / `You are offline` and is disabled, so exactly one `Go live` or `Go offline` button exists at a time, and the match-loop harness taps the actionable one. Selection is also exposed through `accessibilityState.selected`. Alternative: label both segments `Go live` / `Go offline` always and express selection only through `accessibilityState.selected` (the harness would then have to skip the disabled one). Code: `ControlBar` in `components/arena/mat-board.tsx`.
- **Just Rolled draws (spec 6.5, AC-A5):** AC-A5 writes every line as `winner def. loser · method · age`. A draw has no winner (`get_recent_activity` returns the pair in name order), so the build writes `A drew B · Draw · age` instead of claiming a result that did not happen. Alternative: keep the AC shape for draws too. Code: `formatJustRolled` in `lib/arena/mat-board.ts`.
- **Offline ring drawn as a shape (spec 3, 4.2):** the bundled JetBrains Mono Bold has no `○` (U+25CB), so iOS would draw it from a fallback font at a different weight, baseline and width. The chip draws the offline ring as a 6pt hollow circle (1px ink-3 border), the same size as the LIVE dot, and the width budget counts it as such. The copy in this spec still writes it as `○`. Code: `VIEW_GLYPHS` in `lib/arena/header-chip-model.ts`; a test checks every text glyph against the font's cmap.
- **Lapsed outgoing challenges are silent (jr_be push):** the challenger's app withdraws an unanswered challenge once its 10-minute window passes (`cancelChallenge(..., { onlyIfPending: true })`). The jr_be `push` function sends no "Challenge Cancelled" for a pending challenge cancelled 9 minutes or more after its `created_at` (the window minus a 60s `LAPSE_GRACE_MS` for a fast device clock), so the recipient does not get a misleading "<challenger> cancelled the challenge" for every unanswered challenge (the noise decision Q2 removed). This silences ANY pending cancel past that point, whoever makes it: web's Sent Challenges list, the web waiting plate and lobby actions can cancel a pending challenge of any age (before this change the recipient was told), and a mobile plate stays cancellable while a failed lapse is retried. The recipient's Arena already treats such a challenge as stale and the bell lists it under Missed, so the push would be noise. Alternative: mark the app's lapse withdrawal (for example a cancel reason) and silence only that. On the mobile side, while no server clock sample is known yet (a cold relaunch restored the plate from a read), the lapse waits 30s past the device-time deadline (`OUTGOING_LAPSE_UNLEARNED_CLOCK_MARGIN_MS`), so a fast device clock does not withdraw the challenge while the recipient still has time left.
- **A challenge dropped by a manual go-offline stays dropped only until relaunch (Q3):** the dismissed set is in memory. After the app is killed and relaunched inside the challenge's window, the bell and the tab count it again and recovery can raise it once the athlete is live. Accepted as a known limit: it needs a force-quit inside a 10-minute window, and the worst case is the prompt the athlete would have seen had they not tucked it. Alternative: persist dismissed ids per athlete until their fresh deadline. Code: `dismissedRef` in `lib/arena/use-arena-challenge.ts`.
- **Tab-root taps during a match are dropped whatever their type (spec 8):** `dropsDuringMatch` drops ANY push whose target is a tab root (`/`, `/leaderboard`, `/profile`, `/arena...`), not only challenge pushes. A future push that must survive a match should target a non-tab-root screen or be added to `holdsDuringMatch`. Code: `lib/notifications/handlers.ts`.
- **WAITING chip on the Arena tab (spec 4.3):** on the Arena tab itself the WAITING chip has no action and no ". Open Arena" in its label (read as text by VoiceOver); the waiting strip right below it carries `Cancel challenge`. Elsewhere it still opens the Arena. Code: `onArena` in `lib/arena/header-chip-model.ts`.
- **Control bar IN BAND while the viewer's rating is unknown (spec 6.1):** `matCounts` returns a null IN BAND while the viewer's `current_elo` is not a number (every row gap is taken against it), so the bar reads `CONNECTING` rather than a false `0 IN BAND`.
- **Chip count before the Arena has loaded its roster (D2):** the roster is read by the Arena screen and published app-wide (`lib/arena/mat-roster-store.ts`). Tab screens mount on first visit, so until the athlete opens the Arena once the chip on Home, Rankings and Profile reads `● LIVE` / `○ GO LIVE` with no number; an athlete who goes live after the last roster read is counted once the Arena re-reads it, exactly when they become a row. Alternative: read the roster app-wide in `ArenaBootstrap` so the chip has a number from launch (one more `get_arena_data` read per session).

### 14.2 Rollout ordering (cross-repo)

The jr_be `push` edge function puts the Arena link on challenge pushes under a NEW key, `data.arena_href` (`/arena?challenge=<id>` and `/arena`), not under `data.route`. Builds without this branch honour `data.route` with a bare `router.push`, which would stack a second Arena (or a second `(tabs)` from a pushed screen); they ignore `arena_href`, so their challenge-push tap keeps doing nothing, as before. This branch's `lib/notifications/handlers.ts` reads `arena_href` (Arena hrefs only) when `route` is absent. So **no deploy order is required**, and binaries that never take this OTA are safe. Deploy the jr_be `push` function no later than the jits_web OTA when possible: the OTA adds the timed lapse withdrawal, and until the new function is live each withdrawal sends the recipient a "Challenge Cancelled" push.
