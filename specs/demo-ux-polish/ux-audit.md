# Demo UX polish audit (P2 "UX polish and fun" track)

Date: 2026-09-26 (overnight demo run). Author: PM + UX pass, no product code.
Audience: the implementers and reviewers of the P2 polish batches, and whoever approves the OTA in the morning.

## Context and constraints

Tomorrow real people install the iOS app from TestFlight and play BJJ matches end to end: sign up, go live in the Arena, challenge, run the 8-step match wizard (wait, weight, ready, live, end, result, confirm, summary), record video, see their ELO move, and open older matches and their videos. This audit looks for small, safe changes that make that loop clearer and more satisfying on the day.

Every item below is:

- **JS-only and OTA-eligible.** No native dependency, no `app.json`, no metro or babel change. `expo-haptics`, `react-native-reanimated` and `react-native-toast-message` are already in the shipped binary and are already imported by app code.
- **Inside the brand rules** in `jits_web/CLAUDE.md`: Signal Red only for the one primary CTA per surface and for losses or destructive actions; Gain Green only for rating increases; amber for draws and pressure; JetBrains Mono with tabular-nums for every number; no drop shadows; 4px radius (8px max for modals); and only two auto-animations (the 480ms rating tick and the 1400ms LIVE pulse), everything else reactive.
- **Not a new tab or a new flow.** The Rematch item reuses the existing Arena challenge path end to end.

### Evidence base

Screenshots come from the match-loop harness runs under `tools/match-loop/.runs/`, chiefly:

- `2026-09-26T03-52-34-503Z` (core C1 to C6B, the newest full core run),
- `2026-09-26T03-48-33-516Z` (E17, match detail and videos),
- `2026-09-26T03-32-36-880Z` (extended E1 to E16),
- `2026-09-26T03-05-52-644Z` (C3 draw).

Paths in the items are relative to `tools/match-loop/.runs/`. The simulator was not driven for this audit; the "Camera access denied" banner on ready and live is a simulator artefact and is not an item.

### Harness contract: do not break these

The match-loop harness (`tools/match-loop/sim/screens.ts`) reads the UI by testID, accessibility label and copy. Every implementer must keep the following stable, or update the harness in the same PR and re-run it:

- Verdict strings `YOU WON`, `YOU LOST`, `DRAW`, `DISPUTED`, `MATCH COMPLETE` (regex `VERDICT_RE`), and the `▲` / `▼` prefix on `summary-elo-delta`.
- testIDs: `weight-confirm`, `ready-button`, `ready-panel-opponent`, `live-pause-toggle`, `result-outcome-*`, `result-record`, `confirm-verdict`, `confirm-result`, `confirm-dispute`, `dispute-reason`, `dispute-submit`, `summary-verdict`, `summary-elo-delta`, `summary-exit`, `match-video-watch-<id>`.
- Button labels `Go live`, `Go offline`, `Challenge <name>`, `Cancel challenge`, `Accept challenge`, `Decline challenge`, `Cancel match`; the text `Waiting for <name>`; the headings `Record result` and `Dispute result` (matched case-insensitively).
- The ready panel's accessibility label fallback `Opponent, ready|waiting`.

Unit tests that assert copy touched here: `apps/mobile/__tests__/screens/arena.test.tsx` (the "Nobody has the app open" note) and `apps/mobile/__tests__/components/match-flow/exit-navigation.test.tsx` (presses "Done" on the summary).

### Checked and deliberately NOT an item

- **Black text on the red WATCH (and every red CTA) is correct.** The token `textOnAccent` is `#0D0F14` on purpose: 4.60:1 on Signal Red `#E63946`, where the old white label was 3.54:1 and failed WCAG AA. It is pinned by `apps/mobile/__tests__/lib/tokens-contrast.test.ts`. Only the first playable video card gets the red WATCH, so match detail keeps one primary CTA.
- **Leader rank row red rule and the Home ELO tile's red accent bar** are canonical elo-system primitives shared with web (`rank-row.tsx`, `elo-tile.tsx` `accentBar`); changing them is a design-system decision, not demo polish.
- **Leaderboard em-dash under every rating** is a known placeholder already owned by `jits-4zp.10` / `jits-4zp.12` (needs a backend batch delta RPC).

## Ranked list

Ranked by demo impact over risk. Impact is 1 to 5 (5 = every tester sees it and it shapes how the app feels). "Batch" refers to the implementation batches in the next section.

| Rank | ID | Bead | Title | Surface | Effort | Risk | Impact | Batch |
|---|---|---|---|---|---|---|---|---|
| 1 | UX-01 | jits-0b37 | Rating tick actually plays (480ms) + closing haptic | Summary | S | low | 5 | A |
| 2 | UX-02 | jits-v6ri | Before/after ELO tiles overflow at 4-digit ratings | Summary | S | low | 5 | A |
| 3 | UX-03 | jits-00fr | Rematch shortcut via the existing Arena challenge | Summary + Arena | M | low-med | 5 | A + C |
| 4 | UX-04 | jits-4zp.7 (extended) | Haptics on incoming challenge, result recorded, confirm | Prompt, Result, Confirm | S | low | 4 | B |
| 5 | UX-05 | jits-9cgj | Summary outcome colours (draw amber, no decorative red) + disputed note | Summary | S | low | 4 | A |
| 6 | UX-06 | jits-v203 | Arena: contradictory lobby copy, offline title, send haptic | Arena | S | low | 4 | C |
| 7 | UX-07 | jits-g2zv | Confirm: plain subtitle, "Your call" state instead of a spinner | Confirm | S | low | 4 | B |
| 8 | UX-08 | jits-48a6 | Weight step: "At stake" Win/Draw/Loss preview; gap not red | Weight | M | low | 4 | A |
| 9 | UX-09 | jits-4zp.4 (extended) | Branded toasts (no shadow, no library blue) | App-wide | S | low | 3 | B |
| 10 | UX-10 | jits-plt6 (+ jits-4zp.2) | Name the opponent on Ready and Live; timer never red | Ready, Live | S | low | 3 | A |
| 11 | UX-11 | jits-feq5 | Result/End: draw amber, End not green, honest copy | Result, End | S | low | 3 | B |
| 12 | UX-12 | jits-sdh3 | Dispute form explains what a dispute does | Dispute | S | low | 3 | B |
| 13 | UX-13 | jits-sq3a | Home Arena card is live-aware | Home | S | low | 3 | C |
| 14 | UX-14 | jits-32ah | Match detail: tappable play area, readable match length | Match detail | S | low | 3 | D |
| 15 | UX-15 | jits-4zp.8 (extended) | Data colour cleanup: green "submission" on Home, red rank caption | Home, Profile | S | low | 2 | D |

## Items

### UX-01: Summary rating tick actually plays, with a closing haptic (jits-0b37)

- **Surface / files:** Summary step. `apps/mobile/components/ui/elo-system/elo-tile.tsx`, `apps/mobile/components/match-flow/steps/summary-step.tsx`.
- **Problem:** The summary is the emotional peak of the demo, and the one auto-animation the brand allows is missing. `summary-step.tsx` documents that "the animated tick (480ms) is handled by EloTile when both before and after are supplied", but `elo-tile.tsx` renders before and after as two static numbers with no animation code at all. Evidence: `2026-09-26T03-52-34-503Z/C1/22-Blue_reaches_the_summary.png` (1000 → 1016, static).
- **Change:** In EloTile's before/after mode, count the after tile from `before` to `after` over exactly 480ms with an ease-out curve, in integer steps, keeping `tabular-nums` so the width never jitters. Play once per mount, never loop. Honour `AccessibilityInfo.isReduceMotionEnabled()` by rendering the final value immediately. The ticking Text's `accessibilityLabel` is always the final value. When the tick lands, fire one `Haptics.impactAsync(Light)`. Do not animate the `▲ +16` delta line, which the harness reads.
- **Brand check:** This is the sanctioned 480ms rating tick; no other motion is added.
- **Effort S. Risk low. Impact 5.**

### UX-02: Before/after ELO tiles overflow at 4-digit ratings (jits-v6ri)

- **Surface / files:** Summary step. `apps/mobile/components/ui/elo-system/elo-tile.tsx`.
- **Problem:** Every athlete starts at 1000, so the normal summary has two 4-digit ratings, and at `size="large"` (64px mono) the pair is wider than the content column: the left tile starts about 3pt from the screen edge and the right tile touches the other edge. 3-digit results fit. Evidence: overflow in `2026-09-26T03-52-34-503Z/C1/22-Blue_reaches_the_summary.png` and `2026-09-26T03-32-36-880Z/E12/21-Blue_reaches_the_summary.png`; fits in `2026-09-26T03-52-34-503Z/C3/22-Blue_reaches_the_summary.png`. Arithmetic: about 144pt of glyphs plus 40pt padding per tile, times two, plus arrow and gaps, is about 409pt against about 366pt of content width on a 402pt iPhone.
- **Change:** In the before/after row, make each tile `flex-1` (drop `min-w-[120px]` there) and give the number `numberOfLines={1}` with `adjustsFontSizeToFit` and `minimumFontScale={0.6}`, or step the pair down to `size="medium"`. It must fit four digits on a 375pt device. EloTile is also used by the weight step and Home; confirm those render unchanged.
- **Brand check:** No change to tokens or type.
- **Effort S. Risk low. Impact 5.** (Implement together with UX-01, same file.)

### UX-03: Rematch shortcut (jits-00fr)

- **Surface / files:** Summary (batch A: `summary-step.tsx`, `match-step-renderer.tsx`) and Arena (batch C: `app/(app)/(tabs)/arena/index.tsx`, `components/arena/arena-plates.tsx`, optionally `components/arena/competitor-row.tsx`).
- **Problem:** After a match the exits are Back to Arena and Done. Running it back, the most common next action at a demo, means finding the opponent again in the roster. Evidence: `2026-09-26T03-52-34-503Z/C1/22-Blue_reaches_the_summary.png`.
- **Change:**
  - Summary: new optional props `opponentId` and `opponentName`, passed by the renderer from `opponent.athlete_id` and `opponent.display_name`. Render an outline (secondary, never red) button **"Rematch <first name>"** (accessibility label "Rematch <full name>") that calls `router.replace("/arena?rematch=<opponentId>")`. Hide it for disputed matches. Back to Arena stays the single Signal Red CTA. Demote Done to a text link but keep the text "Done" and testID `summary-done`.
  - Arena: read `useLocalSearchParams().rematch`. If that athlete is in Online now, pin their row to the top with a `MetaTag` "Rematch"; their existing Challenge button does the work (same `sendChallenge`, same 3-cap, same live rules). If they are not online yet, show one line above Online now: **"<Name> isn't back in the Arena yet. Their Challenge button appears here the moment they are."** Clear the param once the athlete challenges or navigates away. Never auto-send a challenge.
  - **Cross-batch contract:** query param `rematch`, value is the opponent's athlete id. Batch A emits it, batch C consumes it; each half is safe alone (A alone lands on the Arena as today; C alone is inert without the param).
- **Brand check:** One red CTA per surface is preserved on both screens.
- **Effort M. Risk low-med** (touches roster ordering; unit-test both the online and not-yet-online states). **Impact 5.**

### UX-04: Haptics on the decisive moments (jits-4zp.7, scope extended)

- **Surface / files:** `apps/mobile/components/arena/challenge-prompt-sheet.tsx`, `apps/mobile/lib/match-flow/use-record-result.ts`, `apps/mobile/components/match-flow/steps/confirm-step.tsx`.
- **Problem:** The incoming challenge prompt can appear on any tab and is completely silent, and `matchHaptics.resultRecorded` and `matchHaptics.error` are defined in `lib/match-flow/use-haptics.ts` but never called. Only match start, end and the time warning buzz. Evidence: `2026-09-26T03-32-36-880Z/E1/06-Blue_sees_the_incoming_prompt.png`.
- **Change:** `Haptics.notificationAsync(Warning)` once when the prompt presents; `matchHaptics.resultRecorded()` after the record succeeds; a light impact when the confirm succeeds; `matchHaptics.error()` on the failure toasts of those paths. No haptic on ordinary taps. The summary-landing haptic belongs to UX-01.
- **Brand check:** Haptics are not motion; the vocabulary stays minimal.
- **Effort S. Risk low. Impact 4.**

### UX-05: Summary outcome colours and disputed note (jits-9cgj)

- **Surface / files:** Summary step. `summary-step.tsx`, `elo-tile.tsx`.
- **Problem:**
  1. A draw shows its ELO loss as Signal Red `▼ 8`, but draws are amber by rule. Evidence: `2026-09-26T03-52-34-503Z/C3/22-Blue_reaches_the_summary.png`, `2026-09-26T03-32-36-880Z/E16/23-Blue_reaches_the_summary.png`. The match detail screen already does this correctly with `components/match-detail/use-amber.ts`, so the two screens disagree about the same match.
  2. The after-rating tile always has a Signal Red border (`accent` → `border-cta`), even on a win where the number just went up. That is decorative red on a non-CTA. Evidence: `C1/22-Blue_reaches_the_summary.png`.
  3. The disputed note opens with "This result was disputed." directly under a DISPUTED heading.
- **Change:** Draw verdict and delta use `useAmber().text`. Add an optional `tone` to EloTile (`positive`, `negative`, `amber`) and pass positive on a gain, negative on a loss, amber on a draw; never `border-cta`. Disputed note becomes **"An admin will review it. Your rating change stands until they do."** Keep the verdict strings and the `▲`/`▼` prefix exactly.
- **Brand check:** Fixes two violations.
- **Effort S. Risk low. Impact 4.**

### UX-06: Arena lobby copy and offline title (jits-v203)

- **Surface / files:** Arena. `components/arena/go-live-plate.tsx`, `components/arena/arena-plates.tsx`, `app/(app)/(tabs)/arena/index.tsx`, `components/arena/competitor-row.tsx`, `__tests__/screens/arena.test.tsx`.
- **Problem:**
  1. With nobody online, the Arena says "Nobody has the app open right now. The athletes below are open to challenges and will see it next time they are on." and, right below, "Not in the app right now, so they cannot answer a live challenge." These make opposite promises, and those rows offer nothing to tap except the profile. "Nobody has the app open" is also false for the viewer, who is live. Evidence: `2026-09-26T03-52-34-503Z/C1/04-Blue_live_on_the_Arena.png`, `2026-09-26T03-32-36-880Z/E14/04-Blue_offline_on_the_Arena.png`.
  2. While offline the plate is titled "Looking for Match", which reads as if you already are (E14/04).
  3. Sending a challenge gives no tactile acknowledgement.
- **Change:**
  - GoLivePlate title: offline **"You're offline"**, live **"Looking for a match"**. Body copy unchanged.
  - NobodyOnlineNote, live: **"Nobody else is live right now. Stay live and anyone who goes live shows up here."** Offline: **"Nobody is live right now. Go live and you'll be first in the lobby."**
  - Open to challenges subtitle: **"Not in the app right now. They can take a challenge once they open it and go live."**
  - A light impact haptic when Challenge is tapped.
  - Keep every harness label listed above; update the arena unit test.
- **Brand check:** Copy only, plus one haptic.
- **Effort S. Risk low. Impact 4.**

### UX-07: Confirm step clarity (jits-g2zv)

- **Surface / files:** Confirm step. `steps/confirm-step-panels.tsx`, `steps/confirm-step.tsx`.
- **Problem:** The subtitle "RANKED. ELO ALREADY APPLIED. DISPUTES ARE REVIEWED BY AN ADMIN." is jargon in 10px mono capitals and does not tell a first-timer what to do. Before the athlete acts, their own "YOU" panel shows the same spinner as the opponent's, which reads as "we're waiting on something" rather than "your turn". Evidence: `2026-09-26T03-52-34-503Z/C1/19-Blue_reaches_the_confirm_step.png`, `2026-09-26T03-52-34-503Z/C6/17-Blue_is_moved_to_the_confirm_step.png`.
- **Change:** Ranked subtitle in body 12px sentence case: **"Your rating is already updated. Confirm if this is right, or dispute it and an admin will review."** Casual: **"Confirm if this is right, or dispute it."** The viewer's panel before confirming shows a hairline empty circle and **"Your call"**; the opponent's shows the spinner and **"Confirming..."**; confirmed keeps the check. After confirming: **"Waiting for <opponent name> to confirm..."**.
- **Brand check:** Signal Red stays on Confirm Result only.
- **Effort S. Risk low. Impact 4.**

### UX-08: Weight step stakes preview; weight gap not red (jits-48a6)

- **Surface / files:** Weight step. `steps/weight-step.tsx`, `match-step-renderer.tsx`.
- **Problem:** The last calm moment before the roll shows two weights and a red button, and nothing about what the match is worth. A division gap is shown on a Signal Red "loss" plate with a red warning glyph, but a weight gap is neither a loss nor destructive. Evidence: `2026-09-26T03-52-34-503Z/C1/09-Blue_lands_on_the_weight_step.png`; gap case `2026-09-26T03-32-36-880Z/E12/09-Blue_lands_on_the_weight_step.png`.
- **Change:** For ranked matches, call the existing typed wrapper `getEloStakes(supabase, myElo, oppElo, myWeight, oppWeight)` (`packages/shared/src/api/queries.ts:309`; the `calculate_elo_stakes` RPC is live and the web lobby already uses it) once on mount with a cancelled-ref guard. Render an "At stake" row under the weight tiles: **WIN +16** (Gain Green), **DRAW -8** (amber), **LOSS -16** (`text-negative`), all mono tabular-nums. On null or error, hide the row: no spinner and no error UI. Gap plate: default plate with an amber scale icon and **"<N> weight classes apart. The heavier athlete's rating is adjusted."** The renderer passes `me.current_elo` and `opponent.current_elo`.
- **Brand check:** Green only on the gain number, amber on draw, red only on the loss state.
- **Effort M. Risk low** (read-only RPC; failure hides the row). **Impact 4.**

### UX-09: Branded toasts (jits-4zp.4, extended)

- **Surface / files:** App-wide. `apps/mobile/components/ui/toast.tsx` only.
- **Problem:** Toasts appear after cancel, decline, dispute and errors, and they render as the library's stock white card with a blue info rule and a drop shadow. Evidence: `2026-09-26T03-32-36-880Z/E3/13-Blue_is_returned_to_the_Arena.png`.
- **Change:** Export `Toaster` as a small wrapper that renders the library Toast with a `config` prop, so `app/_layout.tsx` does not change. Use surface-2/3 background, hairline border, 4px radius and no shadow or elevation. The rule colour is ink-3 for info, neutral ink for success (not Gain Green), and Signal Red for error. This also closes item 1 of `jits-8mxc`.
- **Brand check:** Removes a shadow and an off-palette blue.
- **Effort S. Risk low. Impact 3.**

### UX-10: Name the opponent on Ready and Live; timer never red (jits-plt6, bundles jits-4zp.2)

- **Surface / files:** Ready and Live steps. `steps/ready-panel.tsx`, `steps/ready-step.tsx`, `steps/live-step.tsx`, `steps/timer-display.tsx`, `match-step-renderer.tsx`.
- **Problem:** From Ready to End the opponent is never named: the panel says "OPPONENT", and under the clock it says "RANKED MATCH". The timer numeral turns Signal Red at 0:00, and "PAUSED" is red, though neither is a loss. Evidence: `2026-09-26T03-52-34-503Z/C1/11-Blue_taps_Ready.png`, `C1/13-Blue_reaches_the_live_step.png`.
- **Change:** The opponent's ready panel shows their display name. Keep testID `ready-panel-opponent` by adding an explicit `testID` prop, because it is currently derived from the label. Keep the accessibility label `Opponent, ready|waiting`, or update the harness regex in the same PR. The timer caption reads **"RANKED · VS DEMO RED"**. The numeral stays ink at all times; PAUSED and a new TIME caption at 0:00 use amber. Do not touch the auto-end logic (jits-2y8i); `live-step-auto-end.test.tsx` and `ready-step.test.tsx` must stay green.
- **Brand check:** Removes red from a number and from a non-loss state.
- **Effort S. Risk low. Impact 3.**

### UX-11: Result and End step colours and copy (jits-feq5)

- **Surface / files:** `steps/result-step.tsx`, `steps/end-step.tsx`.
- **Problem:** Choosing Draw shows a red "loss" plate with a red handshake. The End step shows a Gain Green plate and check for "MATCH ENDED", and its caption "RECORDING RESULT..." is untrue: it is an 800ms beat before the form, and it collides with the camera meaning of "recording". Evidence: `2026-09-26T03-52-34-503Z/C1/14-Blue_ends_the_match.png`, `2026-09-26T03-05-52-644Z/C3/17-Blue_records_a_draw.png`.
- **Change:** The draw plate becomes the default plate with an amber handshake and the copy **"Match ends in a draw" / "Draws cost both athletes rating."** The End step uses the default plate and an ink check, with the caption **"Up next: record the result"**. Keep the `Record result` heading and the `result-*` testIDs.
- **Brand check:** Fixes an amber violation and a green violation.
- **Effort S. Risk low. Impact 3.**

### UX-12: Dispute form explains itself (jits-sdh3)

- **Surface / files:** `steps/dispute-form.tsx`.
- **Problem:** "Tell us what happened. A reviewer will follow up." does not say whether disputing undoes the result, freezes ELO or notifies the opponent. Evidence: the confirm screen `2026-09-26T03-52-34-503Z/C6/17-Blue_is_moved_to_the_confirm_step.png` leads here.
- **Change:** Body: **"Wrong winner, wrong submission, or it never happened? Tell us. An admin reviews every dispute; ratings stay as recorded until then, and your opponent will see it was disputed."** Placeholder: **"What went wrong? (optional)"**. The warning glyph moves from red to amber. Submit Dispute stays the one red CTA. Keep the heading "Dispute Result" and all `dispute-*` testIDs.
- **Brand check:** Red glyph on a non-loss becomes amber.
- **Effort S. Risk low. Impact 3.**

### UX-13: Home Arena card is live-aware (jits-sq3a)

- **Surface / files:** Home. `components/dashboard/arena-nudge-card.tsx`.
- **Problem:** While the header shows LIVE, Home still says "Go live in the Arena to challenge athletes...". Evidence: `2026-09-26T03-52-34-503Z/C2/05-Blue_on_the_Home_tab.png`.
- **Change:** Read `isLive` from `useArenaState()`, read-only; never mount `useArenaLive` here. When live, show **"You're live"** with a LivePill, **"You're in the lobby. Challenges reach you on any tab."**, and the CTA **"Open the Arena →"**. The offline state is unchanged.
- **Brand check:** It stays the single red CTA on Home. The LIVE pulse is the existing sanctioned one.
- **Effort S. Risk low. Impact 3.**

### UX-14: Match detail play area and match length (jits-32ah)

- **Surface / files:** Match detail. `components/match-detail/match-video-card.tsx`, `components/match-detail/match-meta-row.tsx`.
- **Problem:** The large 16:9 area with a centred play glyph is the most obvious tap target on the screen, and it does nothing; only the WATCH button plays. The meta row shows "10:00" next to "Submission" for a match that ended within seconds, because the value is the configured clock (`matches.duration_seconds`), and without a unit it reads as elapsed time. Evidence: `2026-09-26T03-48-33-516Z/E17/25-detail_from_Home_Me_scope_.png`, `E17/29-detail_from_Past_Match_Videos.png`.
- **Change:** Make the poster or placeholder a Pressable calling the same `onWatch` (disabled while processing; label "Play <angle label>"), and keep WATCH and its testID. Render the clock as a labelled length, for example **"10 MIN ROUND"**, in mono tabular-nums.
- **Brand check:** No new red; still one primary WATCH.
- **Effort S. Risk low. Impact 3.**

### UX-15: Data colour cleanup on Home and Profile (jits-4zp.8, extended)

- **Surface / files:** `components/dashboard/activity-feed-item.tsx`, `components/profile/profile-header.tsx`, `components/athlete/competitor-header.tsx`.
- **Problem:** The Home activity feed paints the word "submission" in Gain Green, which is reserved for rating increases (evidence: `2026-09-26T03-52-34-503Z/C2/05-Blue_on_the_Home_tab.png`). The Profile "#1 · Global" rank caption is a number in Signal Red.
- **Change:** "submission" becomes `text-ink` in mono medium. The rank number becomes `text-ink`, with the "· Global" suffix in ink-3.
- **Brand check:** Fixes two data-colour violations.
- **Effort S. Risk low. Impact 2.**

## Implementation batches (disjoint file sets)

Each batch owns its files exclusively, so the four implementers can run in parallel worktrees without colliding. The only coupling is UX-03's `rematch` query-param contract between A and C, and each half is safe to merge alone.

### Batch A: "The summary moment" and the pre-match wizard (owns the step renderer)

- **Items:** UX-01, UX-02, UX-05, UX-03 (summary half), UX-08, UX-10 (with jits-4zp.2).
- **Files:**
  - `apps/mobile/components/ui/elo-system/elo-tile.tsx`
  - `apps/mobile/components/match-flow/steps/summary-step.tsx`
  - `apps/mobile/components/match-flow/match-step-renderer.tsx`
  - `apps/mobile/components/match-flow/steps/weight-step.tsx`
  - `apps/mobile/components/match-flow/steps/ready-panel.tsx`
  - `apps/mobile/components/match-flow/steps/ready-step.tsx`
  - `apps/mobile/components/match-flow/steps/live-step.tsx`
  - `apps/mobile/components/match-flow/steps/timer-display.tsx`
  - Tests: `__tests__/components/match-flow/exit-navigation.test.tsx`, `ready-step.test.tsx`, `live-step-auto-end.test.tsx`, plus new tests for the tick (reduced motion shows the final value; the label is always final) and for the Rematch button.
- **Suggested order inside the batch:** UX-02 and UX-01 first (same file, highest impact), then UX-05, the UX-03 summary half, UX-10, and UX-08.

### Batch B: Result, confirm, dispute, and feedback

- **Items:** UX-04 (jits-4zp.7), UX-07, UX-09 (jits-4zp.4), UX-11, UX-12.
- **Files:**
  - `apps/mobile/components/match-flow/steps/result-step.tsx`
  - `apps/mobile/components/match-flow/steps/end-step.tsx`
  - `apps/mobile/components/match-flow/steps/confirm-step.tsx`
  - `apps/mobile/components/match-flow/steps/confirm-step-panels.tsx`
  - `apps/mobile/components/match-flow/steps/dispute-form.tsx`
  - `apps/mobile/lib/match-flow/use-record-result.ts`
  - `apps/mobile/components/arena/challenge-prompt-sheet.tsx`
  - `apps/mobile/components/ui/toast.tsx`
  - Tests: `__tests__/components/arena/challenge-prompt-sheet.test.tsx`, `__tests__/components/match-flow/wizard-reconcile.test.tsx` and `record-upload-sequence.test.tsx` (these must stay green).

### Batch C: Arena and Home

- **Items:** UX-06, UX-03 (arena half), UX-13.
- **Files:**
  - `apps/mobile/app/(app)/(tabs)/arena/index.tsx`
  - `apps/mobile/components/arena/go-live-plate.tsx`
  - `apps/mobile/components/arena/arena-plates.tsx`
  - `apps/mobile/components/arena/competitor-row.tsx`
  - `apps/mobile/components/dashboard/arena-nudge-card.tsx`
  - Tests: `__tests__/screens/arena.test.tsx`, `__tests__/screens/arena-match-screen.test.tsx`, `__tests__/screens/dashboard.test.tsx`.
- **Rule reminder:** Never mount `useArenaLive`, `useArenaChallenge` or `useLobbyPresence` on a screen; read through `arena-store.ts` only.

### Batch D: History and profile

- **Items:** UX-14, UX-15 (jits-4zp.8).
- **Files:**
  - `apps/mobile/components/match-detail/match-video-card.tsx`
  - `apps/mobile/components/match-detail/match-meta-row.tsx`
  - `apps/mobile/components/dashboard/activity-feed-item.tsx`
  - `apps/mobile/components/profile/profile-header.tsx`
  - `apps/mobile/components/athlete/competitor-header.tsx`
  - Tests: `__tests__/lib/match-detail/*`, `__tests__/components/profile/*`, `__tests__/components/dashboard/*` where they assert these files.

### Gate for every batch

The gate is `npm run typecheck` and `npm run test` from the repo root, plus a match-loop harness core run (C1 to C6B) once the simulator is free, because batches A and B change screens the harness reads. Nothing in this list needs `expo export`, since no metro, native or `app.json` change is involved, but running it is cheap insurance before the OTA. Each batch also updates `CHANGELOG.md` under `## [Unreleased]`. To avoid merge conflicts there, append the batch entries at merge time rather than in each worktree.

## Assumptions

1. The morning OTA targets the build already on TestFlight, which embeds `expo-haptics`, `react-native-reanimated` and `react-native-toast-message`; all three are imported by shipped code today, so nothing here needs a new native build.
2. `calculate_elo_stakes` on production accepts the same arguments the web lobby sends (web calls it through the same `getEloStakes` wrapper).
3. When both athletes leave the summary, the existing "leaving a match restores live if you were live going in" behaviour puts them both back in `lobby:online`, which is what makes the Rematch row light up without any new realtime code.
4. `matches.duration_seconds` is the configured clock length, not the elapsed time (E17 shows 10:00 for a match of a few seconds, with a 0:03 video).

## Open questions

1. Rematch placement: should "Rematch" replace Share Result in the button stack instead of demoting Done to a text link? The recommendation is to keep Share, because sharing is a delight at a demo.
2. Should Ready and Confirm panels stop using Gain Green for "ready" and "confirmed"? Strictly, green is for rating increases only, but green-for-go is a strong convention. This audit leaves it alone pending a design call.
3. The stakes row uses the viewer as the `challenger` argument of `calculate_elo_stakes`. Confirm with the backend owner that the function is symmetric apart from the weight adjustment, so this is safe for the challenged side too.
4. Should the rating tick also run on the Home ELO tile the first time Home mounts after a match? That would be a second instance of the same sanctioned animation, but it needs a design call.
