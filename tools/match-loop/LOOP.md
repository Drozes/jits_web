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
log oracle is skipped); `metro-serves-this-checkout` (see section 4);
simulator booted; app installed; camera + microphone
revoked for core runs (auto-revokes, which relaunches the app); app in the
foreground (auto-launches); alert sweep; simulator signed in as Demo Blue;
the bot can sign in as Demo Red AND sees Blue's app in `app:online` on the
local realtime (runtime proof the simulator app is on the local stack; this
same check also runs at the start of EVERY scenario, inside `prepare()`, and
fails the scenario as `env_error`); Blue/Red/Green active;
`timekeeper-role-off` (the shared `timekeeper_role` flag is off: the flag-OFF
guard runs with it off, and the harness turns it on only around a
timekeeper match's creation; never auto-fixed, because the harness does not
change a flag it did not set; checked whenever the flag's row exists,
whatever other timekeeper tables the stack has, so it fails closed); `submission_types` non-empty;
`realtime-publication` (informational: whether `matches` is published, i.e.
whether H1 still holds); `match-loop:typecheck`. At EVERY start, with or
without `--preflight`, the runner first repairs what a killed run left inside
a timekeeper fixture (`~/.cache/elorated-match-loop/fixture-restore.json`,
one record for every worktree on this machine, since they all drive the same
local stack: flags put back, test-only windows removed, athlete columns put
back, T17's challenge invites deleted) and logs `recovered from an interrupted
run: ...`; it refuses (exit 2) while the run that wrote the record is still
alive (its pid still has the start time recorded with it), then refuses to run
at all while `timekeeper_role` is ON (the same check as
`timekeeper-role-off`), and then refuses (exit 2) when the Metro log says
Metro serves another checkout (the same check as
`metro-serves-this-checkout`, section 4).

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

One run at a time on this machine, from any worktree: every worktree's
harness drives the same simulator and the same local stack, and a second
run breaks the one in flight (it relaunches the app, unpauses realtime under
E8's outage, resets fixtures under a live match). The runner takes a lock
before it touches anything (`lib/run-lock.ts`,
`~/.cache/elorated-match-loop/run.lock`, holding its pid and that process's
start time, released after every cleanup hook) and refuses to start (exit 2,
`another match-loop run (pid N, ...) is using the simulator`) while another
live run holds it. A lock whose pid is gone (a run killed with SIGKILL) is
stale and is taken over, and so is one whose pid now has another start time
(`ps -o lstart=`: after a reboot or a pid wrap the pid can name any process,
a root-owned one included), so a stale lock or restore record never refuses
every run until someone deletes it by hand. A record without a start time
(written by an older harness) counts as alive only while its pid runs a
command naming `tools/match-loop/`. Seen before the lock existed (2026-10-21): a core run started
from another worktree relaunched the app between Red's accept and Blue
entering the match, and T14 failed for nothing the app or the harness did.
The lock covers runs of this harness only; anything else that drives the
simulator (a manual `simctl launch`, a recipe step) still has to wait for a
run to finish.

Run the harness from the checkout whose Metro the simulator bundles from.
The harness reads the app under test from its OWN tree: which timekeeper
slices are in (`scenarios/timekeeper/integration.ts`, so which timekeeper
scenarios run or stay pending), the copy deck its selectors are built from,
and the app's `.env` (`assertSafe`). A harness in one worktree driving
another worktree's Metro judges one tree by another's code. So every runner
start (and preflight's `metro-serves-this-checkout`) reads the project root
from the Metro log (Expo's `Starting project at <dir>` line) and refuses
(exit 2) when it is not this checkout's `apps/mobile`; a log that names no
project cannot tell, and the run goes on with a log line saying so. To test
a slice's harness against the build, apply it to the build worktree (the
one Metro serves) and run from there.

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

The capability-mixed run (TEST-PLAN 4.1, PLAN 5 Wave 3 step 3): on the
integrated build, core and extended once more with `timekeeper_role` ON and
the bots sending no capability header, which must behave exactly like flag
OFF (every simulator-plus-bot pair is mixed, so every match snapshots flag
OFF):

```
npm run match-loop -- --tier core --tk-flag-on
npm run match-loop -- --tier extended --tk-flag-on
```

`--tk-flag-on` holds the flag ON for the run only (it is restored at the
end, on Ctrl-C, and by the next run's start if this one is killed).
Preflight runs before the hold, so it still requires the flag off. The app
reads the flag only when it launches or returns to the foreground (slice
M6's `use-timekeeper-enabled.ts`, the Arena copy TK-AR1 and TK-AR2), so the
runner closes the app right after the hold (the first scenario's
`normaliseApp` launches it with the flag ON) and again after the flag is
restored (so the next run's app does not keep the ON it read).

What happens to the app on an interrupt: on Ctrl-C or SIGTERM the cleanup
hooks run in the order they were registered, so the flag is put back first
and then the app is closed (a hook the runner registers right after the
hold; T11 registers its own inside its window), and the next launch reads
the flag as it was put back. A run killed outright (SIGKILL) runs no hook:
the next run's start puts the flag back from the restore record, but the
app may still show the ON it read (TK-AR2 under the waiting strip, TK-AR1
on the prompt; copy only) until it is relaunched or foregrounded, so
relaunch it (`xcrun simctl terminate`, then launch) before the next gate.

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
`--timing human|fast`, `--no-typecheck`, `--tk-flag-on`, `--no-pending`.
`--tier all` is core plus extended, the flag-OFF guard; it never includes
the timekeeper tier, which runs only with `--tier timekeeper` or `--only`.

Exit code: 0 when every scenario is `pass`, `flake`, `known` or `pending`; 1
when any is `fail`, `harness_error` or `env_error`; 2 for a preflight/env
refusal. A scenario left pending is recorded `fail` instead on a build with
M8, and always with `--no-pending` (see "Pending scenarios" below).

### The timekeeper tier (T0 to T18, slice M7)

```
npm run match-loop -- --tier timekeeper
npm run match-loop -- --tier timekeeper --no-pending   # the Wave 3 gate
npm run match-loop -- --only T1,T1B
```

Never part of the flag-OFF guard (core and extended are). The scenarios are
TEST-PLAN 4.2's T1 to T18; T1 runs twice (T1, Blue the challenger; T1B,
Blue the opponent); T13 (the timekeeper's own resume) is the three-phone
device script's (TEST-PLAN 5.2 step 8) and is listed as not implemented;
T14 (the capture policy, slice M9's) runs a flag-OFF match and practice and
checks that ready and live stay portrait when the simulator rotates (the
9:16 preview and the TK-REC2 hint show only beside a granted camera's
preview, which no harness run has: M9's component tests and device script
5.2 step 3 cover them). The rotation is Simulator.app's own Device >
Rotate Left / Right, clicked through System Events once Simulator is the
frontmost app (the shell running the harness needs the macOS Accessibility
permission; without it T14 is an `env_error`). It is never a cmd+arrow
keystroke, which goes to whatever app is in front (seen 2026-10-21: the
terminal took focus back and the device stayed turned). `Simctl.rotate`
waits until the device has turned, read from the Simulator window's shape,
never from the app, so a portrait check can never pass on a rotation that
did not happen; it tries three times, then reports an `env_error`. A run
that dies between the two rotations of a check can leave the device turned:
the app is portrait-locked so the other scenarios do not mind, and
Device > Rotate Left / Right puts it back. The app's own orientation is
its Application frame in the screen read (`portraitIn`); measured on the
iPhone 17 Pro simulator (2026-10-21), Safari, which follows the device,
reports 874x402 once turned, and ELO RATED stays 402x874. Practice opens
offline in its own local lobby: T14 goes live there, challenges Practice
Partner, weighs in and readies (practice's tip and tag testIDs sit on Views
idb never reports, so its non-live chrome is read from the header title,
`Practice Match`, which live does not draw). T0 is an M7 addition: the
whole bot protocol with bots only (Red and Green the athletes, Demo Gold
the timekeeper, Blue idle and offline): request, seat, a flag probe,
verdicts, Start, pause, resume, the clock end, record, confirm, the edit
and the done state, each asserted in the database. It needs no mobile
slice, so every timekeeper-tier run exercises `bot/timekeeper.ts` and the
backend contract it drives. T0B is its companion for the sweep path, also
bots only and on any build: Red asks Gold under a 20 s `tk_request_lapse`,
Gold never answers, the harness runs the sweep until the request reads
`expired`, both athletes get TK-N3 exactly once (still once after one more
sweep), the match is still picking, Red leaves (`athlete_left`), and once
the scenario's fixtures are undone no `tk_*` window is left on the stack or
in the restore record. Without it the window lifecycle and
`runTimekeeperTick` would first meet the stack in the window scenarios,
which all wait on M8.

Run status (which scenarios pass, fail or are pending on which build)
lives in the notes of bead jits-o47s.9, never here. A durable fact T0
found: through PostgREST the `authenticator` role preloads `safeupdate` on
the local stack, which refuses a `DELETE` or `UPDATE` without a WHERE
clause. pgTAP runs as `postgres` through psql, without that library, so a
backend body that passes every pgTAP test can still fail when an app or a
bot calls it (the Rating V9 replay's `DELETE FROM elo_history;`, reached by
`edit_match_result`, `resolve_dispute` void and overturn, and the admin
replay, jr_be-o8m.9; `admin_set_server_setting`'s cache delete,
jr_be-ov8.6). Hosted Supabase preloads it the same way. When a bot-driven
RPC fails with `DELETE requires a WHERE clause` or `UPDATE requires a WHERE
clause`, it is that backend class of defect, not the harness.

Rules every timekeeper scenario follows:

- The simulator (Blue) is ALWAYS an athlete, never the timekeeper (PM18: no
  camera, and the core runs revoke it, so it could never pass the
  timekeeper's Start camera gate). The timekeeper is a bot
  (`bot/timekeeper.ts`: `TimekeeperBot` listens for its requests, records
  the AI consent when missing, accepts or declines; `TimekeeperSide` is the
  seated timekeeper: heartbeat every 15 s, verdicts quoting the RATED
  weight, Start once the server lists no blocker, pause, resume,
  `end_match_clock`, record, edit, Leave, each clock or result RPC followed
  by its broadcast with `actor_id`, and a live Leave that made the match a
  no contest by `match_cancelled` with `actor_id`, as the live step's Leave
  sends it; a Leave before the start sends nothing, as the face-off's). The other athlete is Red's bot
  (`TkAthleteSide`: ask, ready, and confirm WITH the expected edit count,
  through the shared `confirmMatchResult(client, matchId,
  expectedEditCount)`; where it is comes from the app's own `targetFor` with
  timekeeper roles, read from the database).
- Bots send the capability header (`x-elo-client-caps: timekeeper_v1`) only
  when a scenario asks (`ctx.bot(key, { capabilities: [TIMEKEEPER_CAP] })`,
  `ctx.timekeeperBot`). Every flag-OFF scenario's bot is the shipped client
  with no header.
- Blue's Confirm on a timekeeper-mode confirm step is pressed exactly once,
  and only once `confirm-result` is offered and enabled
  (`TimekeeperScreens.confirmOnce`, oracle `ui:tk-confirm-one-press`; PM29
  (5)): from the tap Confirm is busy until the server answers, at most
  `SEND_CEILING_MS` (20 s, `TK_TIMING`, pinned to the app's
  `lib/match-flow/send-timing.ts` once the PM29 change adds it), and after a
  RESULT_CHANGED refusal it stays disabled until the newer result is on
  screen, so a tap then would be lost and read as an app timeout. The wait
  for the verdict after it (`TK.handshake`, 45 s) covers the ceiling plus
  `ADVANCE_AFTER_CONFIRM_MS` plus a margin (`TK_CONFIRM_SETTLE_MS`).
- Blue's timekeeper-mode taps (`TimekeeperScreens`: Ask, the weigh-in,
  TK-F4, Re-weigh, Confirm) never go to a point from one screen read. A bot
  action can move the screen between the read and the tap: in the first
  Wave 3 gate (T10, run 2026-10-22T05-52-40-251Z) the "Waiting for D. Red
  to check your new weight." notice above TK-F4 went away after the read,
  both buttons moved up about 60 pt, and the tap meant for TK-F4 landed on
  "Doesn't look right" and flagged Red. Each tap reads again first and
  taps only once the control has held one frame for `STILL_TIMING.stillMs`
  (`tapWhenStill`, `sim/idb.ts`; about a third of a second), at the newest
  frame; a control that goes away, turns busy or keeps moving is not tapped
  and the helper reads again. A control below the fold is scrolled into
  view (`Idb.scrollTo`, which waits for it to settle) and tapped only if it
  is still an enabled control there. A press counts only once it is made.
  (The app also stopped moving those buttons, PM31 (1).) Taps a scenario
  makes itself (the crew's Leave, the T3 and T17 alerts) are outside
  `TimekeeperScreens` and keep their single read.
- Every server change is asserted in the database (`oracle/tk-db.ts`, read
  as postgres), not only on Blue's screen: the mode snapshot and both
  capability stamps, the open request, the seat (history row, recording
  intent, cleared deadline), readies and checks, the clock end, the result
  with no confirmation row for anyone, the athletes' confirmations, the
  rating applied once, the seat history's `left_reason` and whether it is a
  drop-out, the pushes per kind and recipient (`social_notifications`), the
  flags, and for a no contest: no `rating_seq`, no `elo_history`, no
  participant snapshot, ELO unchanged, absent from history. The history
  check has a positive anchor (`db:history-read-anchored`,
  `historyVerdict`): Red's `get_match_history` is read as Red through the
  client, not the shared `getMatchHistory` (which returns an empty list on
  an error, so a failed read would pass as "absent"), and the read must
  have no error and list Red's newest completed match, read as postgres
  first; otherwise `db:not-in-history` fails with "history read failed".

Fixtures (`fixtures/timekeeper.ts`), every one except the fourth account
scoped and undone. For the flags, the windows, the athlete columns and
T17's invites, what to undo is recorded BEFORE each change in
`~/.cache/elorated-match-loop/fixture-restore.json`, and an interrupt hook
and the next run's start, in any worktree, repair a killed run. The
harness friendships are not in that record: their interrupt hook removes
them, and after a run killed outright the reset before the next scenario
(`resetTimekeeperState`, which every scenario runs, flag-OFF ones
included) removes every `manual` friendship among the four accounts.
When a put-back fails after the scenario itself had failed, the
scenario's own error is what the run records (its status, `error` and
fingerprint, so a known bead still matches and triage reads the real
failure); the put-back is listed beside it in the scenario's
`putBackFailures`, noted in the trace (`<fixture>_body_error` next to the
fixture's own `*_failed` note, `friendships_remove_failed` for the
friendships), and its interrupt hook stays for the exit, with its restore
record for the next start (the friendships have no record: the next
scenario's reset removes them). Such a scenario is never `known`. When only the
put-back fails, its error is the scenario's, as before:

- `timekeeper_role` (and the snapshotted sub-flag `timekeeper_weight_check`)
  is ON only around the creation of the timekeeper match (`withFlags`: the
  bot's accept, Blue's accept, or Red's `start_invite_booking`). The server
  reads the flag only at the match INSERT, so a window of a few seconds is
  enough and the shared flag is never left on for a flag-OFF scenario. The
  one longer window is T11's, the whole scenario, so Blue's app reads the
  flag too (its match is still flag OFF: the pair is capability-mixed). A
  window refuses to run when `timekeeper_role` is already ON and this run
  did not turn it on.
- Friendships between Blue, Red, Green and the fourth account (source
  `manual`) exist only while a timekeeper scenario runs (the picker lists
  friends; on the Arena a friend wears a FRIEND badge and sorts first, so a
  flag-OFF scenario never sees them).
- The AI consent the timekeeper bots record before an accept (TK-T7,
  TK-T8; `record_ai_processing_consent` writes `ai_processing_consent_at`
  and `ai_processing_consent_version`) is put back on Green and Demo Gold
  when the scenario ends (`withAthleteColumns`): consent gates recording and
  uploads, so Green never carries it into a flag-OFF scenario.
- The fourth account, Demo Gold (`demo-gold@elorated.dev`), the second
  timekeeper bot for re-picks (T2, T5) and T0's timekeeper, is created on
  first use through the local auth API's sign-up with the publishable key
  and the seed password, then activated as postgres (`ensureFourthAccount`)
  with no AI consent, so it asks for consent like Green. It is the one
  permanent fixture: the harness's own account, never seeded by jr_be and
  never read by a flag-OFF scenario.
- Short windows (jr_be 024 6.4): T0B, T3, T4, T7, T8, T15, T16 and T18 write
  the test-only `server_settings` keys `tk_*` (seconds) that `_tk_window`
  reads, for the scenario only (`withWindows`: recorded before the write,
  removed in the finally; a failed removal keeps its hook and record for the
  exit or the next start). Production never has these rows.
  The sweep (`timekeeper_mode_tick()`, pg_cron every minute) is also run by
  the harness itself as postgres (`runTimekeeperTick`, the job's own body)
  so a sweep scenario does not wait for the next minute.
- T17 sets Demo Blue's date of birth for its duration (a claim needs one,
  `dob_required`) and puts the previous value back (`withAthleteColumns`,
  recorded first like every other fixture). It needs `invites_enabled` ON
  and `match_location_required` OFF and never changes them. `create_invite`
  limits Demo Red, its inviter, to 3 invite matches a week
  (`weekly_invite_match_cap`; `_invite_weekly_matches_used` counts every
  booked match, cancelled ones included), 5 open invites
  (`too_many_open_invites`) and 20 invites a day (`daily_invite_limit`), and
  the reset touches none of them. So T17 deletes every challenge invite Red
  created during it (`withInviteCleanup`: Red and the database time are
  recorded before the first invite exists, and the delete nulls the
  booking's `invite_id`, which takes the booked match out of the weekly
  count), and a stack where Red already reached a limit is an `env_error`
  naming it, before anything runs. The app keeps the opened invite on the
  device (`elorated.invite.pending.v1`) until the claim books, and every cold
  launch returns to the claim screen while it is there: T17 taps the claim
  screen's own Not now when it ends with that screen up, and `normaliseApp`
  does the same for a run killed there (keyed on the claim screen's copy,
  never another screen's Not now).
- T8 makes Demo Gold (neither an athlete nor the timekeeper there) an admin
  for its duration (`platform_role`, through `withAthleteColumns`, recorded
  first and put back): TK-N12 goes to every admin and founder, and the
  seeded stack has none, so without it the oracle would compare two empty
  lists. A stack where the admin cannot be read back is an `env_error`.
- The reset before every scenario (`resetFixtures`) also clears
  timekeeper-mode leftovers involving the four accounts
  (`resetTimekeeperState`: a match where one is only the timekeeper, open
  seat history of their cancelled matches, pending requests, `tk_*` windows
  where `server_settings` exists, harness friendships). It is a no-op on a
  clean stack. It leaves completed
  matches alone, so a timekeeper scenario that failed between the record
  and both confirms leaves a match in its 30-minute edit window, which
  `get_my_timekeeping_match` keeps offering its timekeeper bot; each
  timekeeper scenario notes such matches in its trace
  (`open_timekeeper_results_left_by_earlier_runs`), and the done oracle
  only requires that Home stops offering its OWN match.

Pending scenarios. A scenario lists the slices whose UI it drives
(`needs`); until each is in the build the runner records it `pending` with
the reason and does not run it (`result.json` lists `integratedSlices`).
Every slice is read from the app source, never declared by hand
(`scenarios/timekeeper/integration.ts`): M2 to M6, M9 and M10 by a file
each creates (`SLICE_MARKERS`), M8 by the quoted `timekeeper_v1` in code
(comments do not count) in a non-test source under
`apps/mobile/lib/supabase/` (M8's client) or `packages/shared/src/` (a
constant the client could import), however the header itself is spelled
(without the capability no simulator-plus-bot pair can be a timekeeper
match). A false positive is loud: every pending scenario then fails the
run, and T11's capability oracle fails. Pending does
not fail a partial Wave 2 build, but it is recorded `fail` on a build with
M8 (M8 lands only after every M slice, so a slice still missing there is an
integration defect) and always with `--no-pending`, so the Wave 3 gate can
never read green without running T1 to T18. T0, T0B and T11 need no slice
and run on any build: T0 is the bots-only protocol run, T0B the bots-only
window and sweep run; T11 is a
capability-mixed pair with the flag ON that must run C1's flag-OFF flow
with every C1 assertion (before M8 the bot carries the header and the app
does not; from M8 on the reverse). T11 holds the flag ON for the whole
scenario, from before the app launches (it closes the app first, so
`prepare` launches it with the flag ON) to the exit, then relaunches the
app; once slice M6 is in it also asserts that the app read the flag (TK-AR2
under Blue's waiting strip, copy only) while the match stays flag OFF.

The selectors for Blue's timekeeper screens (`sim/timekeeper-screens.ts`)
are built from the app's own copy deck module
(`apps/mobile/lib/match-flow/timekeeper-copy.ts`, imported, never
re-spelled), accepting both the full and the short name, plus the shipped
face-off testIDs and the crew step's Leave (M2's `crew/crew-top-bar.tsx`);
`tests/timekeeper.test.ts` pins them. When a slice changes one of these
controls, check it against `TK_UI` first (one file to adjust).

Timing: the happy paths take about as long as C1 plus the pick (2 to 3
minutes each); T0 about a minute, T0B under a minute (its 20 s lapse). The
sweep scenarios add their shortened
window plus at most a few seconds (T3 60 s, T4 60 s, T7 about 85 s: a 25 s
grace then a 60 s window, T8 20 s, T15 60 s, T16 60 s, T18 20 s). The
windows that start a sweep the scenario checks against (T3, T4, T7, T15,
T16) are kept above the waits that precede their assertion (a UI wait is up
to 25 s, and pg_cron runs the sweep every minute on its own), and the
offline grace above the bot's 15 s heartbeat; a window shorter than that
makes the sweep race the scenario's own checks. T8 (`tk_stall_window`
20 s) and T18 (`tk_edit_window` 20 s) are the exception, by design: their
window may elapse during the UI waits before their assertion (Blue reaching
the result step, the confirm step), because what they assert is only the
state after the window (one stall flag and still in progress; the late edit
refused `edit_window_closed`), which an early close reaches just the same;
each then waits out whatever is left of its window (`waitPast`). Where
TEST-PLAN 4.2 says TK-D9 counts down (T7 under the offline banner, T16
while paused), the
chip is read twice 2.5 s apart and the second read must show less time
left (`expectChipCountsDown`); elsewhere its presence is enough.

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
- Strict presses. Four controls under test are pressed again when the
  first press did not take, and each counts its presses so that retry can
  never hide a dropped press: `ui:weight-check-one-press` (the face-off
  check plate's Confirm, `blueConfirmsWeights`), `ui:end-one-hold`
  (`blueEnds`; the two-hold path is pinned by `tests/prompt-guard.test.ts`),
  `ui:back-to-arena-one-tap` (`exitToArena`) and, in the timekeeper tier,
  `ui:tk-ready-one-press` (TK-F4, "Weight looks right, I'm ready",
  `TimekeeperScreens.weighInAndReady`: every scenario through
  `tkFaceoffToLive`, plus T5 and T10). Each expects exactly one;
  a second press fails the oracle (and so the scenario). Back to Arena is
  tapped a second time ONLY on physical evidence, read from the screen
  (`logBoxExcuseFor`), that a dev-build LogBox took the first tap: the
  LogBox inspector on screen in the read just before the tap, after a toast
  close just before it (`closed-before`: the close tap missed its glyph and
  opened the inspector); a toast's frame holding the tap's point in that
  read (`toast-over-tap`); or the inspector on screen at the tap or after
  it (`inspector-open`). A toast closed just before the tap with no
  inspector at or after it is NOT evidence and excuses nothing. The oracle
  then accepts the second tap and records `logBoxRetap: true` with
  `logBoxExcuse`, plus a `logbox_retap` trace note and a REVIEW note on the
  oracle; a gate reviews every one (section 4, "The flag-OFF guard"). A
  toast elsewhere on screen excuses nothing: the exit was scrolled 150pt
  clear of the toast band before the tap, so the verdict ignoring the tap
  is a `fail` at once. `dismissLogBox` minimises an open inspector (its
  Minimize button, found with its "Log n of m" title) before closing the
  toast. TK-F4 is pressed a second time only when it is still offered and
  enabled `TK_READY_RETAP_MS` (3 s) after the first (a press the app took
  goes busy at once), and only after Blue's `match_ready` row was read and
  found missing (the server is the authority: a row there honours the first
  press however far the screen lags); it is never pressed a third time
  (`TK_READY_MAX_PRESSES`, 2). The press counts as honoured once the ready
  step shows the waiting line, Blue's ready plate or TK-F5, or the match
  has moved past the face-off. Blue's timekeeper-mode Confirm is never
  pressed twice at all (`ui:tk-confirm-one-press`, `confirmOnce`, under
  "The timekeeper tier" above).
- Not every retry on a gate path is counted. These retry a press without
  counting it, each ending in a hard check of the outcome, so a press the
  app never honours still fails, but ONE dropped press is absorbed:
  `Screens.tapAlertButton` (up to 3 taps until the RN Alert closes: the
  face-off Leave's "Cancel Match" in C5, E3, E3B and E18 to E20 through
  `blueCancelsFromReady`, the crew step's Leave in T3 and T17 through
  `blueLeavesFromCrew`, and Sign out in setup), `Screens.fillField` (up
  to 3 focus, clear and type passes until the value reads back: the
  result's finish time, the dispute reason and T10's match re-weigh in
  `TimekeeperScreens.reweigh`, which then taps the enabled submit and
  checks the prompt went away), in E17 only
  `MatchDetailPages.openTab`, `openFromHome` (the Home "Me" scope) and
  `tapWatch` (one retap each, until the tab's proof element or the player
  marker shows), and in T14 only practice's local Go live
  (`practiceGoLive`: one more tap, with a `practice_go_live_retap` trace
  note, until the practice partner's Challenge row shows; practice is
  setup there, not under test). They retry harness mechanics (an alert that animates in,
  text focus, tab switching), not the match controls a scenario asserts.
  Setup (`normaliseApp`, `dismissLogBox`, `dismissSystemAlerts`) retries
  freely and is never under test.
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
- Accepted drift (jits-c3vd, recorded by M7): since jits-02vo.7 the app's
  confirm step moves to the verdict `ADVANCE_AFTER_CONFIRM_MS` after its OWN
  confirm; the bot still leaves its confirm step only once both have
  confirmed (`confirmDecision`). The bot is never the app under test, and
  keeping its confirm channel mounted is what lets the hard oracle
  `bot:confirm-channel-received-blue-result_confirmed` observe Blue's
  broadcast; moving it would change no DB outcome and nothing Blue sees.
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
  tapping: below the header bar and above the tab bar (minus 12pt). The
  bar's bottom is the lowest header control's centre plus half the 56pt
  bar, and the band starts 12pt below it. On the iPhone 17 Pro that is 130
  on a tab root (the rating, centred at y=90) and on a pushed screen with
  the live dot (also centred at 90), 128 under AppHeader's chevron alone
  (centred at 88), and 130 when no header control is on screen (the
  fallback: the 62pt safe area plus the bar, 118, plus the margin). Only a
  control centred on screen below the 62pt safe area counts: the match
  detail hero's back control, scrolled above the screen, covers nothing and
  is ignored, so the band's top can never go negative or start above the
  safe area (jits-o47s.28).
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
