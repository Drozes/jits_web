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

Target: the core tier takes about 2.5 to 3 minutes; the extended tier about
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

- The incoming-challenge prompt is a gorhom `BottomSheetModal`; its children
  are not in the accessibility tree (only a "Bottom Sheet" slider), so the
  harness taps Accept/Decline by offset from the sheet handle. That same
  fact means VoiceOver users cannot reach the buttons (a11y finding).
- Text testIDs do not surface through idb; the wizard step is read from the
  step marker's accessibility label ("Step N of 8, <Label>").
- Pressables surface as Button, Link, Slider or GenericElement depending on
  what else is mounted; selectors match by label/testID, not type.
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
- History rows near the bottom of a tab sit under the tab bar: a tap on
  their centre lands on a tab. `sim/match-detail.ts` scrolls every target
  into the band between the header and the tab bar before tapping.
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
