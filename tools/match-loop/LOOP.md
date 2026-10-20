# Match-loop runbook (one iteration)

This is the orchestrator's per-iteration procedure for the mobile match-flow
verification loop. The harness lives in `tools/match-loop/`; runs land in
`tools/match-loop/.runs/<iso>/` (gitignored), with `result.json`, one folder
per scenario (screenshots per step, `trace.jsonl`, `metro.slice.log`,
`device.log`, `realtime.log`, `scenario.json`) and `idb-commands.log`
(redacted).

Hard rules, every iteration (these run UNATTENDED, so they are absolute):

- **Never push.** This OVERRIDES the "Session Completion: work is not complete
  until `git push` succeeds" rule in the repo `CLAUDE.md` and the workspace
  policy. The loop only makes LOCAL commits; a human pushes.
- LOCAL stack only. `config.ts` refuses anything but `127.0.0.1:54321`, the
  fixed local database in `lib/psql.ts` (PG* env vars are stripped), a
  publishable bot key, every Expo dotenv file pointed at the local stack,
  and a `supabase_realtime_*` container; preflight then proves at runtime that
  the simulator app is on the local realtime. Never weaken those guards.
- Never modify `/Users/msponagle/code/EloRated/jr_be`. Backend bugs become
  beads labelled `backend`; frontend mitigations are allowed.
- The seed password is loaded at runtime from jr_be and redacted from every
  artifact. Never print it, never paste it into a bead.
- Another session may be editing `apps/web/**`. Never modify `apps/web`
  unless a fix genuinely needs web parity, and then touch and stage ONLY the
  loop's own hunks.
- Git hygiene, all mandatory:
  - Before staging, `git diff --cached --quiet -- . ':!.beads'` must succeed
    (nothing pre-staged outside `.beads/`; see the `.beads` rule below). If
    anything else is already staged, STOP and report: never
    commit pre-staged foreign changes. Prefer `git commit -- <paths>` with an
    explicit list of the loop's own files.
  - Never `git add -A`, `git add .`, `git add -u`, or a directory glob.
    Stage named files only. Never stage any `.env*` file.
  - Never `--no-verify`. If the pre-commit hook fails because of foreign
    uncommitted changes (another session's work), STOP and report; do not
    bypass it, stash it, or "fix" someone else's files.
  - `git commit -- <paths>` commits the WHOLE working-tree content of each
    path. Before committing, `git diff -- <path>` every file on the list: if
    any file contains a hunk the loop did not write (another session's edit),
    STOP and report. Never commit it, never try to split it out.
  - Bead state: the loop commits bead state ONLY as `.beads/issues.jsonl`,
    in its own separate `chore(bd): ...` commit, made when nothing else is
    staged. `bd create` / `bd update` may re-stage `.beads/issues.jsonl` by
    themselves; that is expected. Check "nothing pre-staged" for everything
    EXCEPT `.beads/` (`git diff --cached --quiet -- . ':!.beads'`), and check
    `.beads/` separately. Never unstage, restore or reset `.beads/*`.
  - To revert the loop's own change, apply the reverse patch of the loop's
    own diff (`git diff <paths> > loop.patch` beforehand, then
    `git apply -R loop.patch`). Never `git checkout <file>`, `git restore`,
    `git reset` or `git stash`: those also destroy foreign edits in the file.
- Time cap: 3 hours total for the loop, 25 minutes per iteration. When an
  iteration hits 25 minutes, finish the current step, record it in history,
  and stop the iteration.

## Configuration (machine-specific, not committed)

Copy `tools/match-loop/local.config.example.json` to
`tools/match-loop/local.config.json` (gitignored) and fill in the simulator
`udid`, `idbPython` (a Python with fb-idb; the `idb` CLI is broken on 3.14)
and `metroLog` (Metro's stdout, e.g. `npx expo start --dev-client >
metro.log 2>&1`). Env vars override it: `MATCH_LOOP_UDID`,
`MATCH_LOOP_IDB_PYTHON`, `METRO_LOG`, `MATCH_LOOP_REQUIRE_METRO_LOG=0|1`.
With `requireMetroLog` true (the default) preflight fails when the log is
unreadable; with it false every scenario records `logs:metro-clean` as
SKIPPED (never as a pass).

Ctrl-C / SIGTERM is safe: the runner unpauses the realtime container (E8)
and kills its child processes; every run also unpauses it at start.

## 1. Context

1. `tail -n 20 tools/match-loop/.runs/history.jsonl` (what happened last).
2. `bd list -l match-loop --status open --json` (open findings; a failing
   scenario whose fingerprint matches an open bead's
   `external_ref = match-loop:<fp>` is reported as `known` and still runs).
3. `git status --short`. If there are changes the loop did not make, STOP,
   unless they are confined to paths the loop never touches (for example
   `apps/web/**` from the parallel session). Record what you saw.

## 2. Preflight (auto-fix once, then stop)

```
npm run match-loop -- --preflight-only
```

Checks: config safety; Supabase auth health; `psql select 1`; realtime
container `supabase_realtime_jr_be` running and NOT paused (auto-unpauses);
Metro `packager-status:running`; Metro log readable (`METRO_LOG`, else the
log oracle is skipped); simulator booted; app installed; camera + microphone
revoked for core runs (auto-revokes, which relaunches the app); app in the
foreground (auto-launches); alert sweep; simulator signed in as Demo Blue;
the bot can sign in as Demo Red AND sees Blue's app in `app:online` on the
local realtime (runtime proof the simulator app is on the local stack; this
same check also runs at the start of EVERY scenario, inside `prepare()`, and
fails the scenario as `env_error`); Blue/Red/Green active; `submission_types`
non-empty; `realtime-publication` (informational: whether `matches` is
published, i.e. whether H1 still holds); `match-loop:typecheck`.

If preflight fails twice in a row, stop the loop and report.

## 3. Simulator signed in as Demo Blue

```
npm run match-loop -- --signin-blue --preflight-only
```

It first re-runs the STATIC local-only config check (`assertSafe`: API,
every Expo dotenv file, bot key, container name) and refuses before any
password is typed if it fails; `loadConfig()` has already run it too. Then it
opens `elorated://settings`, reads the signed-in email, signs out
(Sign out -> confirm) and signs in through `login-email` / `login-password`
/ `login-submit`, dismissing the iOS "Save Password?" sheet. If the UI
sign-out fails it falls back to terminate + `simctl keychain reset` +
relaunch. It logs the previous user's `looking_for_ranked` after sign-out
(it should be false; if it is true, that is a finding).

## 4. Run

### The flag-OFF guard (gate runs)

Core is the flag-OFF guard for the timekeeper mode build: it proves the
two-athlete Arena match still works with every timekeeper flag off. A gate
run is core with NO `--rerun-failures`:

```
npm run match-loop -- --tier core
```

Without reruns there is no `flake` status: a scenario that would only pass
on a second attempt is `fail`, and a gate counts it as red. Never add
`--rerun-failures` to a gate run, and never call a gate green on a run that
needed one. The strict press oracles (`ui:weight-check-one-press`,
`ui:end-one-hold`, `ui:back-to-arena-one-tap`, see "Known harness facts")
exist for the same reason: a press the app dropped must fail the guard, not
be retried away. The extended tier's gate run is the same, also with no
`--rerun-failures`:

```
npm run match-loop -- --tier extended
```

An excused second Back to Arena tap passes `ui:back-to-arena-one-tap` but is
not a silent pass: review every one before calling a gate green. After each
gate run, this must print 0, and anything else is a review item (open the
run's trace, `logbox_retap` note, and say in the gate notes why the LogBox
excuse holds):

```
grep -c '"logBoxRetap": true' tools/match-loop/.runs/<iso>/result.json
```

Baseline flag states (local `public.feature_flags`, read 2026-10-20 on the
jr_be-tk-build stack with Rating V9 and TK Wave 1 backend):
`timekeeper_role=false` (the mode under guard is OFF),
`timekeeper_weight_check=true`, `opponent_weight_check_required=false`,
`match_location_required=false`, `match_proximity_required=false`,
`live_location_drift_check=false`, `invites_enabled=true`,
`video_upload_enabled=true`, `highlight_clips_enabled=true`,
`highlight_share_enabled=true`, `multi_angle_highlights_enabled=false`,
`multi_angle_sync_enabled=false`, `match_capture_1080p=false`,
`ai_labels_public=false`, `video_position_taxonomy=false`. A baseline is
only comparable with a run on the same flag states; re-read them before a
gate with
`psql "host=127.0.0.1 port=54322 dbname=postgres user=postgres" -Atc "select key || '=' || enabled from feature_flags order by key"`.

### Loop iterations (triage)

Inside the unattended loop, reruns are a triage tool only (they tell a
`flake` from a reproducible failure), never a gate:

```
npm run match-loop -- --tier core --rerun-failures 2
```

Add the extended tier when core is fully green OR every third iteration:

```
npm run match-loop -- --tier extended --rerun-failures 2
```

Other flags: `--only C1,E4`, `--repeat N`, `--fidelity strict|lenient`
(default strict: one realtime channel per wizard step, like the app),
`--timing human|fast`, `--no-typecheck`.

Exit code: 0 when every scenario is `pass`, `flake` or `known`; 1 when any is
`fail`, `harness_error` or `env_error`; 2 for a preflight/env refusal.

Core is expected fully green (7 of 7: C1 to C6B) on the local stack, with
Rating V9 applied and face-off weight checks on; it is the flag-OFF guard for
the timekeeper mode build. Any core failure is a regression to triage.
Extended is expected fully green too (every implemented scenario, E1 to E20;
E13 is not implemented). A failure that is a real app bug stays red until
the app is fixed (never waived in the harness); none is open on 2026-10-20
(E17's `ui:no-app-error-athlete` went green with the jits-i5ih fix, see
"Known harness facts").

Target: the core tier takes about 3.5 minutes; the extended tier about
13 to 16 minutes (E18 to E20 add roughly 1.5 to 2 minutes each: the toast
control once per run, the 12 s accepted fallback in E20, and the
accept + 14 s re-count in E18 and E19).

## 5. Triage (per fingerprint)

Each failed oracle gets `sha1(scenario | oracle id | normalised EXPECTED
value)[:12]` (the generic `error` oracle hashes its normalised actual
message instead; a scenario that died with no failed oracle hashes its error).
`fingerprint` is the first one (the bead's external ref); `fingerprints`
lists all. A scenario is `known` only when EVERY fingerprint matches an open
or in-progress bead; one new failure keeps it `fail`. Keep this formula
stable: filed beads' external refs depend on it.
Open `result.json`, then the scenario folder: `scenario.json` (steps,
oracles with expected/actual), the `FAIL-*.png` screenshot, `trace.jsonl`
(every bot RPC, broadcast sent/received, channel status, and the `spy`
socket's view of every broadcast on the match topic), `metro.slice.log`.

- `env_error`: fix the environment (preflight should have caught it).
- `harness_error`, or a failure whose evidence shows the harness did the
  wrong thing (wrong selector, tapped during an animation): fix in
  `tools/match-loop/` only, commit `chore(match-loop): ...`.
- `flake`: passed on a rerun. Promote to a race bug when the same
  fingerprint flaked in >= 2 of the last 5 iterations (history.jsonl).
- product bug: reproduces >= 2 of 3 attempts with DB and/or UI evidence.
  Useful discriminators:
  - spy saw the event but the step channel did not -> a channel-lifetime
    race (H3/H6/H8). Re-run with `--fidelity lenient`: if it passes, the
    protocol is right and the lifetimes lose events.
  - spy never saw the event -> the sender never sent it.

## 6. Product bug fix

1. Dedup: `bd search <keywords>` and look for `external_ref
   match-loop:<fp>`. Otherwise
   `bd create -t bug -l match-loop --external-ref match-loop:<fp> "..."`
   with the evidence paths (never the password).
2. Fix subagent: the smallest fix plus a unit test, in `apps/mobile` and/or
   `packages/shared` (web parity only when the shared protocol changes).
   If the fix changes the realtime protocol (a new event, a poll), update
   the bot to mirror the app: `bot/match-side.ts`, `bot/opponent.ts`,
   `bot/protocol.ts` (payload validators).
3. The failing scenario must turn green, then re-run the core tier.
4. INDEPENDENT reviewer subagent (fresh context, never the implementer)
   approves.
5. Full gate: `npm run typecheck && npm run test && npm run
   match-loop:typecheck` and `cd apps/mobile && npx expo export --platform
   ios --no-bytecode --output-dir <outside the repo>` (delete it after).
6. `CHANGELOG.md` entry under `## [Unreleased]`.
7. `git diff --cached --quiet -- . ':!.beads'` first (see the `.beads` rule); then `git commit -- <the loop's own
   files>` naming the bead (hook runs; no `--no-verify`); never push. Close
   the bead with the SHA.
8. Two reviewer rejections on the same fingerprint: revert the loop's own
   change with the reverse patch (never `git checkout`), note it on the
   bead, move on.
9. Backend-only bugs: bead labelled `backend`, no jr_be edits.
10. Relaunch the app after every commit so Metro reloads the bundle
    (`xcrun simctl terminate <udid> com.elorated.mobile && xcrun simctl
    launch <udid> com.elorated.mobile`).

## 7. UX ideas

`bd create -t feature -l match-loop,ux-idea,needs-approval --external-ref
match-loop-ux:<slug> "..."` after a dedup search. Never built by the loop.

## 8. History

Append one line to `tools/match-loop/.runs/history.jsonl` (the runner
already appends a `{"type":"run",...}` line per run):

```
{"type":"iteration","iter":N,"ts":"...","shaBefore":"...","shaAfter":"...",
 "results":{...},"flakes":[...],"beadsFiled":[...],"commits":[...]}
```

## 9. Stop when

- 3 consecutive fully-green iterations with nothing new, or
- preflight fails twice, or
- 2 failed fix attempts on the same fingerprint, or
- unexpected foreign changes appear in files the loop needs, or
- 10 iterations, or 3 hours total, or an iteration exceeding 25 minutes
  twice in a row.

## Known harness facts

- The incoming-challenge prompt is a centered React Native `Modal` (a gorhom
  sheet before jits-02vo.3). Since jits-ef2a its Accept/Decline buttons are in
  the accessibility tree, and the harness taps them by testID plus label
  (`PROMPT_BUTTONS`: `#challenge-prompt-accept` "Accept challenge",
  `#challenge-prompt-decline` "Decline challenge"), never by element type and
  never by an offset (the old offset-from-handle fallback is gone). The prompt
  ignores taps for `PROMPT_INPUT_GUARD_MS` (600ms) after it appears and
  disables its buttons for that window, so the harness waits out the guard
  plus a margin and then for the button to be enabled.
- The modal hides everything under it from idb, the tab root's header chip
  and the Arena's control bar included. Going live with a pending incoming
  challenge (E14) raises the recovered prompt at once
  (`use-pending-challenge-recovery.ts`), so E14 taps Go live
  (`Screens.tapGoLive`) and waits for the PROMPT, not for `Go offline`
  (`ensureLive` would time out behind the modal); it then checks the DB says
  Blue is live, declines, and checks the challenge is `declined` and Blue is
  still live.
- Live state is read from the header status chip (`#header-status-chip`,
  AXValue `live` / `offline`) on the four tab roots, or the non-interactive
  `#header-live-dot` on pushed screens. Every chip label starts with
  `Live status:`, so it never answers the Arena control bar's exact `Go live`
  / `Go offline` queries; the live popover uses `Live menu: go offline` and
  the offline offer strip `Go live to answer <name>` for the same reason.
  `tests/label-contract.test.ts` pins these against the app source (spec 9.3)
  without a simulator.
- Text testIDs do not surface through idb; the wizard step is read from the
  step name in the step marker's accessibility label ("Step N of T, <Label>",
  pinned to the app's labels by `tests/label-contract.test.ts`). A
  `match-step-<step>` testID counts only for one of the app's `MATCH_STEPS`
  (`stepFromTestId`). On the full-bleed live step idb sometimes reports no
  marker at all, so `currentStep` falls back to controls only one step
  renders (`STEP_BY_CONTROL`: `#live-end` / `#live-pause-toggle` mean live,
  `#summary-exit` means summary).
- Stakes are informational only. Rating V9 (jr_be `20261013100200`) made
  `calculate_elo_stakes` a stub that returns NULL, and decision O1 removes
  stakes and Elo hints from the app in both modes. `stakesFor` returns null
  then, and every stakes oracle (`stakes:*`, `stakeOracle`) is recorded as
  SKIPPED, never as a pass and never as a gate. The rating a match moved is
  checked from the database instead: the winner gained and the loser lost
  (`db:rating-moved-by-outcome`; V9 has a WIN_FLOOR / LOSS_FLOOR of 1), one
  `elo_history` row per athlete that agrees with its participant row, and
  `current_elo` = `elo_after` (`checkRatingApplied`). The size of a change is
  never predicted. A V9 draw between equals is no change at all.
- The verdict's rating card is ONE accessible element labelled "Rating N, up
  D" / "Rating N, down D" (just "Rating N" for no change), so idb never sees
  the delta chip inside it; `readSummary` / `parseDelta` read the card's
  label, and `ui:summary-elo-delta` is compared with Blue's own
  `match_participants.elo_delta` (the row the verdict reads), null for a
  zero change.
- The fixture reset also sets V9's `athletes.rating` to the fixture
  `current_elo` (1000) where the column exists: V9 rates from `rating` and
  writes `current_elo` back from it, so resetting `current_elo` alone would
  start every match from whatever rating the last run left. RD, volatility
  and the match history are kept.
- Face-off weigh-in (jits-c3vd): after "Confirm <N> lbs" (`#weight-confirm`)
  the opponent's plate becomes Blue's check of their weigh-in
  (`#faceoff-weight-check-plate`, Confirm `#weight-check-confirm`, "Doesn't
  look right" `#weight-check-flag`), and the app stays on the weight step
  until Blue's OWN check is confirmed. `Screens.confirmWeights` answers
  Confirm and `blueConfirmsWeights` records `ui:weight-check-plate-answered`
  (every Arena match is challenge-backed, so the plate must be there). The
  bot mirrors it: `MatchSide.confirmWeights` reads the checks and confirms
  its own (`check_opponent_weight`, `weightCheckAction`) before entering
  ready. The flag-OFF tiers never flag.
- Live: the wizard reads "live" from the start of the 3-2-1 countdown, but
  the live step (End, Pause and its channel) mounts only at GO (server
  `started_at` plus `COUNTDOWN_MS`, `LiveStage`). The harness waits for
  `#live-end` before it treats Blue as live, and the bot waits for GO
  (`liveGoAt`) before it ends or pauses; ending during the countdown would
  end before the other phone's live channel exists. The bot's auto-end
  counts the clock from GO too.
- End is "Hold to end match": a tap never ends. `Screens.endMatch` presses
  `#live-end` for `HOLD_TO_END_MS` (1.2 s, pinned to the app) plus a margin
  and checks the press took. Two holds that both fail to end the live step
  are the app's failure (ExpectationTimeout, status `fail`), not a harness
  error.
- Strict presses. Three controls are pressed again when the first press did
  not take, and every one counts its presses so the retry can never hide a
  dropped press: `ui:weight-check-one-press` (the face-off check plate's
  Confirm, `blueConfirmsWeights`), `ui:end-one-hold` (`blueEnds`) and
  `ui:back-to-arena-one-tap` (`exitToArena`). Each expects exactly one; a
  second press fails the oracle (and so the scenario). Back to Arena is
  tapped a second time ONLY when a dev-build LogBox could physically have
  taken the first tap: a toast was closed just before it (that close tap
  can open the LogBox inspector), a toast's frame held the tap's point in
  the screen read just before the tap, or the LogBox inspector is open
  after it. The oracle then accepts the second tap and records
  `logBoxRetap: true` with `logBoxExcuse` (`closed-before`,
  `toast-over-tap` or `inspector-open`), plus a `logbox_retap` trace note
  and a REVIEW note on the oracle; a gate reviews every one (section 4,
  "The flag-OFF guard"). A toast elsewhere on screen excuses nothing: the
  exit was scrolled 150pt clear of the toast band before the tap, so the
  verdict ignoring the tap is a `fail` at once. `dismissLogBox` minimises
  an open inspector (its Minimize button, found with its "Log n of m"
  title) before closing the toast.
- The live pause toggle (`#live-pause-toggle`) is ONE accessible element
  whose label names the action it offers: "Pause match clock" while running,
  "Resume match clock" while paused (since 35d87d0f). The drawn PAUSE /
  RESUME text is inside it and never reported on its own; `pauseLabel` maps
  the label to `PAUSE` / `RESUME` (`PAUSE_TOGGLE`, pinned to the app by
  `tests/label-contract.test.ts`) and returns any other label as itself, so
  a relabel shows up as the oracle's actual value.
- DB oracles beyond the rating checks: `db:weight-checks-confirmed` (after
  Blue's weigh-in, Blue's own `match_weight_checks` row, checker Blue and
  subject the opponent, is `confirmed`), `db:participant-delta-consistent`
  (`checkRatingApplied`: every participant row has `elo_before`,
  `elo_after` and `elo_delta` written and `elo_delta = elo_after -
  elo_before`; the verdict shows `elo_delta`) and `db:draw-symmetric`
  (`checkDrawDb`: a draw between equals moves both athletes by the same,
  written delta; Rating V9 moves neither).
- `fillField` clears a field before typing (the finish time is prefilled
  from the match clock) and compares case-insensitively (iOS capitalises a
  text field's first letter).
- A dev-build LogBox toast can also cover the verdict's Back to Arena;
  `exitSummary` closes it and scrolls the exit clear of that band before
  the tap, and re-taps only as described under "Strict presses".
- C4: the app declines with the RPC first and broadcasts `declined` after
  it, so the challenger's status UPDATE and the broadcast race. C4 asserts
  the outcome and that the broadcast was delivered
  (`bot:declined-broadcast-received`); which arrived first is
  informational.
- Keep the host awake with its lid open. On 2026-10-19 two runs stalled
  for 2 and 12 minutes on one idb `describe-all`: both were the Mac in
  clamshell sleep on battery (`pmset -g log`: "Entering Sleep state due to
  'Clamshell Sleep'"), with the app's device log silent for exactly that
  window. A long gap in `idb-commands.log` is that, not the app.
- Pressables surface as Button, Link, Slider or GenericElement depending on
  what else is mounted, and sometimes even as StaticText (2026-10-19: the
  prompt's Accept / Decline and the face-off's Leave, all
  `accessibilityRole="button"`, while a status plate beside them read as
  Button); selectors match by label/testID, not type. Controls with a
  testID are selected by testID plus label (`PROMPT_BUTTONS`,
  `FACEOFF_LEAVE`); `type: "Button"` stays only where a same-label text
  could otherwise match (the Arena's Go live / Go offline, the tabs).
- A dev-build LogBox toast can cover the tab bar; the harness closes it.
- E13 (camera granted) is not implemented: the simulator has no camera.
- Session-match channels use `ack: true` since 55061f5, so a websocket "ok"
  means the server received the broadcast, not that the other side did;
  delivery is judged by the spy socket and receiver oracles.
- Scenario E3B is an addition to the spec: Blue cancels while Red is still on
  the weight step (the weight step mounts a channel since jits-bh2v).
- The bot mirrors the app's DB reconciler (`reconcile` entries in
  `trace.jsonl`): the ready and confirm steps can advance from a DB snapshot
  when a broadcast was lost, exactly like the app. Delivery of match_ended,
  result_submitted, result_confirmed and match_disputed is still asserted
  separately (`waitEvent`, spy oracles, `waitDisputeSignal`), so those show
  up as a failed delivery oracle, not a stuck bot. A ready step finished from
  the DB is not a failure; its `ready_outcome` / ReadyOutcome `via` says so.
  A `completed` row never finishes the confirm step (only a dispute or both
  confirmations do).
- E17 (match video history) seeds one real MP4 per athlete through the
  publishable key (`lib/video-seed.ts`) and removes the rows and objects
  again as each uploader (sign-out is LOCAL scope, so the simulator's Blue
  session survives). It assumes NO local video slicer/worker is running:
  `db:video-rows` expects status `ready`, and a worker could move it on.
  The backend caps uploads at 10 per athlete per rolling 24h, counted from
  the append-only `public.video_upload_events` ledger, which a row DELETE
  does not refund; E17 deletes its own ledger rows through the local psql
  in its cleanup, checks the remaining budget before seeding, and reports a
  spent cap as `env_error` with the reason.
- The local realtime server rate-limits presence: 5 presence events per 30
  seconds per channel. Past it the server logs
  `ClientPresenceRateLimitReached` and CLOSES that client's channel; the app
  does not rejoin it (jits-fa9x), so e.g. Blue is never in `lobby:online`
  again until the app relaunches. Running presence-churning scenarios back
  to back (go live, go offline, match, back live, repeated) can trip it.
  Do NOT raise the local limit to make runs green: the app must survive a
  server-closed channel, and raising the limit would hide exactly this class
  of product bug.
  Every scenario writes the realtime container's `RateLimit|error` lines
  since its start to `realtime.log` (tokens masked, local
  `supabase_realtime_*` container only) and records the informational oracle
  `env:realtime-no-rate-limit` (always ok; its actual value counts and lists
  any `ClientPresenceRateLimitReached` lines). When it reports a hit, treat
  later presence failures in that scenario as possibly environmental, but
  the app not rejoining a closed channel is itself the product bug.
- Every scenario that asserts `presence:blue-left-lobby-in-match`
  (`checkOfflineInMatch`) first asserts `presence:blue-in-lobby-before-match`
  (`checkBlueInLobbyBeforeMatch`, right after Red goes live, before the
  challenge), so "left the lobby" cannot pass vacuously when Blue was never
  in it. `checkOfflineInMatch` throws a HarnessError if the pre-match oracle
  was not recorded.
- History rows near the bottom of a tab sit under the tab bar, and a scroll
  with momentum can leave a row under the header bar: a tap on either lands
  on the bar, not the row (E17, 2026-10-20: a Stats row centred at y=117,
  under the pushed header whose bar ends at 118, opened nothing).
  `sim/match-detail.ts` scrolls every target into `hittableBand` before
  tapping: below the header bar (its controls' centre plus half the 56pt
  bar, plus a 12pt margin; 130 on the iPhone 17 Pro) and above the tab bar
  (minus 12pt).
- Match detail has no fixed header: its back control (FilmBackButton,
  "Go back", `#match-back`) sits in the hero, inside the ScrollView, and
  scrolls away with the content. A detail scrolled down stays scrolled while
  a screen above it is open, so after that screen pops, idb reports the
  detail's "Go back" with its real, off-screen frame (E17, 2026-10-20: the
  Stats detail under the athlete page, scrolled to its opponent row, at
  y=-169), and a tap there does nothing. Every pop goes through
  `Screens.goBack` (`sim/screens.ts`): it taps only a back control a tap
  can reach (`backTappable`: on screen, its centre at y >= 62, below the
  status bar and the Dynamic Island), scrolls an unreachable one back down by its own frame first
  (`backRevealMove`, slow), and throws ExpectationTimeout when it cannot.
  `Screens.backToTabRoot` (used by `sim/match-detail.ts` and
  `normaliseApp`) also throws when a back control is still there after its
  pops, so a stranded screen fails where it happens instead of as a missing
  tab button later. `normaliseApp` relaunches the app (trace notes
  `stuck_pushed_screen_relaunch`, `normalise_last_resort_relaunch`) when it
  cannot bring back the tab bar, so one stranded scenario does not fail the
  next ones in setup (E18 to E20 did on 2026-10-20).
- The Matches tab is labelled Film since 2026-10-09 (its route is still
  `matches`): the tab bar's button is "Film" (`TAB_LABELS`, pinned to the
  tabs layout). The Film tab root is proven by BrandHeader's
  accessibility-only heading, which idb reports as a Heading labelled "Film",
  usually without its `tab-header-title-film` testID (it is a Text), so
  `TAB_PROOF` accepts either; the tab bar's Film button is never a Heading.
  The label is matched case-sensitively (`/^Film$/`): match detail's
  FilmAngles header is a Heading too and reads "FILM" with one usable
  angle, and string labels match case-insensitively.
  E17 opens the match from the Film tab's card `#film-card-<matchId>` and
  plays Demo Red's recording from there (`ui:player-loaded`,
  `ui:no-error-panel`); its oracle keeps the route's name
  (`ui:detail-from-matches`).
- E17 checks after each entry point that the app is not on its error screen
  (`ui:no-app-error-<home|stats|athlete|film>`, read from the error
  boundary's "SOMETHING WENT WRONG" or the dev red box). When it is, that
  oracle fails (with the error message as its actual value), and the app is
  relaunched and Blue put back live on the Arena, so the later entry points
  and the player still report on their own. The two live-state oracles
  (`db:blue-still-live-after-history`, `ui:live-pill-after-history`) are
  then SKIPPED, not evaluated: once the harness has relaunched the app and
  gone live itself, live state no longer reflects history browsing.
  The athlete entry is the only one that stacks two match detail screens
  for the same match (Stats detail, opponent profile, head-to-head row, the
  same match again). The second one crashed until jits-i5ih (2026-10-20)
  with "cannot add `postgres_changes` callbacks for
  realtime:video_progress:<videoId> after `subscribe()`": `useVideoProgress`
  (packages/shared/src/hooks/use-video-progress.ts) named its channel
  `video_progress:<videoId>` with no per-subscription suffix, realtime-js
  returned the first screen's already joined channel for the same topic,
  and `.on()` on it threw. It fired while the recording was still in the
  pipeline (E17's seeded rows stay `ready` with no analysis, `useMatchFilm`
  `watching`). jits-i5ih gave the hook a per-subscription topic, and E17
  keeps `ui:no-app-error-athlete` as the regression guard (verified: with
  the old hook E17 fails on it and on `logs:metro-clean`, fingerprint
  `a7f90f794337`, run 2026-10-20T04-59-20-221Z, a deliberate red run).
- E18 to E20 exercise the Arena concurrency rules in
  `apps/mobile/lib/arena/use-arena-challenge.ts`. E18 (crossing) has two
  legitimate branches, picked by which challenge id is lower (random per
  run); the trace's `crossing` and `red_accept_outcome` notes say which ran,
  and both must end in ONE match. E19 reads which challenger Blue accepted
  from the DB (the prompt sheet's children are not in the accessibility
  tree). E20 deliberately waits out the app's 12 s accepted fallback, so it
  takes about 20 s longer than a plain handshake (the observed start delay
  is the trace note `fallback_start_observed_ms`). All three end the match
  by Blue cancelling from the ready step (`blueCancelsFromReady`), not by
  playing it, and E18 / E19 then re-count the matches once the fallback
  window has passed (`db:still-one-match-after-fallback-window`).
- The toast oracles (`ui:no-error-toast`, `ui:no-info-toast`) sample the
  screen in the background for BrandToast testIDs (`toast-<type>`). A watch
  that cannot see toasts would pass them vacuously, so the first of E18 to
  E20 in a run first runs a positive control (Blue challenges Red, Red
  declines, `ui:toast-visible` must capture the info toast "Demo Red
  declined."). Only when that control passed in the SAME run are the
  no-toast oracles hard; otherwise they are informational (ok, with the
  toasts seen as the actual value), and with zero screen samples they are
  skipped. A failing `ui:toast-visible` is either the app not toasting a
  decline or idb not surfacing the toast's testID: check the screenshot.
