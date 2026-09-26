# Autonomous overnight run: demo readiness + UX/fun iteration (6 to 9 hours, local to PRODUCTION)

You are the ORCHESTRATOR of an autonomous, self-paced run of at least 6 and up to 9 wall-clock
hours. The user is ASLEEP / UNAVAILABLE for the entire run: never wait for an answer, never end
the run early to ask something. Every decision you would have asked about is pre-decided in
section 0; anything not covered is decided conservatively (section 0, "undecided").

Mission, in priority order:
1. PRODUCTION stays demo-ready at all times. Tomorrow morning multiple real people install the
   iOS app (TestFlight) and play BJJ matches on PROD: sign up, go live in the Arena, challenge,
   play the match wizard, record, confirm, see ELO, WATCH MATCH VIDEOS, and open ANY older
   match and watch its video.
2. Close every known demo bug (section 3, P0 backlog first).
3. Then iterate on quality: an outstanding, polished UX and fun play, within the brand rules.

AI cost is not a constraint. Quality is. You are explicitly authorized to run multi-agent
orchestration: parallel product teams (Agent tool with `isolation: "worktree"` for parallel
implementers, and the Workflow tool for fan-out reviews/verification; this sentence is the
user's explicit opt-in to workflows at whatever scale the work needs). Keep the main thread for
decisions, integration, the log and the status report; delegate recon, building, reviewing,
testing.

Style for everything you write (chat, beads, commits, reports): lead with the answer; full
sentences; NO em dashes (use commas, colons, parentheses); never print secrets.

## 0. Authority (pre-decided by the user; binding)

Clock: record `START_TS` in iteration 1. Minimum run 6h, maximum 9h. PROD FREEZE at
08:00 local time on the demo morning (2026-09-26): after the freeze no prod deploys of any
kind except a P0 fix for something that broke prod, and only with a verified rollback path.
End the run at the earlier of 9h elapsed or 08:15 local, but never before 6h elapsed unless the
freeze forces it (if the freeze arrives before 6h, keep working on `development` only, no
prod changes, until 6h).

| Action | Authority while the user is away |
|---|---|
| Local work, commits on `development`, `git push origin development` (jits_web) | ALLOWED after independent review + full gate |
| OTA to EAS channel `production` (runtime 0.3.0) | ALLOWED before freeze, for JS-only changes that are independently reviewed, fully gated, harness-verified, CI green; with the bundle-target check (5a) |
| Web prod (fast-forward `main` to `development`) | ALLOWED before freeze, after CI green + `build:web` + web e2e green on that SHA |
| Prod DB migrations (jr_be) | ALLOWED before freeze ONLY if additive (new tables/columns/functions/indexes/triggers/policies that do not widen access), forward-only, idempotent, pgTAP-tested locally, independently reviewed for prod safety, dry-run first. NEVER: dropping/renaming columns or tables, deleting/updating user data, loosening RLS, changing auth |
| TestFlight build (new native binary) | ALLOWED only if a P0/P1 truly requires native code; bump `expo.version` (forks runtime), full gate, `testflight-release` command procedure. A new build does not reach testers until they update, so prefer OTA |
| Prod feature-flag changes, allowlist changes, prod data writes, prod test accounts / synthetic prod smoke | NOT ALLOWED (file a `needs-approval` bead with the exact command and evidence) |
| jr_be changes | ALLOWED via a worktree branch of jr_be (never edit the main jr_be checkout; another session `jr-be-47` may work there; message it before pushing jr_be `development`) |
| Anything destructive, force-push, `--no-verify`, `supabase db reset` | NEVER |
| UX scope | Polish + small delights: fix rough edges, clearer copy, better empty/loading/error states, match-flow clarity, satisfying feedback within the brand's minimal-motion rules, small fun touches. NO new major features or flows, no new tabs |

Undecided situations: choose the option that keeps prod safest and reversible; if an action is
neither clearly allowed nor clearly safe, do not do it: file a `needs-approval` bead
(`bd create ... -l needs-approval`) with the exact proposal, and continue with other work.

`LOOP.md` still applies for local harness work and git hygiene, EXCEPT its "never push" rule,
which this table overrides for this run.

## 1. How this run starts

Started from a new chat with `/loop` (self-paced) pointing at this file. One iteration per turn.
Use `ScheduleWakeup` only as a fallback heartbeat (20 to 30 min) when waiting on long external
work (EAS, CI, Vercel); otherwise continue immediately to the next iteration.

Prerequisites (check in iteration 1; fix locally if safe, else note and work around):
- jr_be local Supabase in docker (`127.0.0.1:54321` API, `:54322` DB); container `supabase_realtime_jr_be` up and NOT paused (`docker unpause` if paused).
- Metro on `:8081`, stdout to the `metroLog` path in `tools/match-loop/local.config.json` (restart Metro with `cd apps/mobile && npx expo start --dev-client` redirecting output to that path if needed).
- iOS simulator `D8D2CA4D-9E09-4092-8F9C-034638C404D8` booted with the dev build, signed in as Demo Blue (`npm run match-loop -- --signin-blue --preflight-only`).
- `apps/mobile/.env` and `.env.local` point at `http://127.0.0.1:54321` (correct for local; a HAZARD for `eas update`, see 5a).
- `cd apps/mobile && npx eas whoami` shows `drozes18`; `gh auth status` ok; `bd` works.
- `/Users/msponagle/code/EloRated/jr_be/.env.dev` exists (prod `DATABASE_URL` etc.). Never print it; load only inside one subshell.

## 2. Facts as of 2026-09-25 late evening (RE-VERIFY in iteration 1)

- Prod Supabase `rzowigdcdojlovlwwpkx` (only hosted project). Migrations through `20260925120100`: `matches` is in `supabase_realtime`; `trg_auto_allowlist_video_upload` allowlists every new athlete for video uploads; all athletes allowlisted; `video_upload_enabled`=true; highlight flags false; ALL `app.settings.*` GUCs unset (video slicer/analysis pipeline not configured; playback does NOT need it: mobile plays the original MP4 via a 1h signed URL from the private `match-videos` bucket).
- Prod data: ~414 completed matches, only 1 `match_videos` row (status ready, no thumbnail). Video on prod is essentially unexercised.
- Web prod = Vercel production from jits_web `main` (fast-forwarded to `development` tonight). CI: `.github/workflows/ci.yml` on `main` and `development`.
- Mobile: iOS build 22, v0.3.0, runtime 0.3.0, EAS channel `production` -> branch `production`. EAS `production` env: `EXPO_PUBLIC_SUPABASE_URL=https://rzowigdcdojlovlwwpkx.supabase.co`. `eas.json` production env sets `EXPO_PUBLIC_APP_ENV=staging` (known label trap, leave it). Build 21 (v0.2.0) users are on an older runtime and get no OTA.
- Tonight's OTA: update group `e14fb125-535d-4590-b951-963a525fbe56` (iOS update `01a0dba6-cc41-78d9-b52c-0cd47b5c3743`), commit `02897b3`, manifest verified to target prod Supabase. WEB IS NOT YET DEPLOYED for `02897b3`: CI run `36213332209` on `development` was in progress at handoff; first iteration: when CI is green, run `build:web` + web e2e and fast-forward `main` (5b). Contents: Team A match sync + confirm fix and Team B Arena reliability. OTAs apply on a cold start (`fallbackToCacheTimeout: 0`): players must force-quit and reopen, twice.
- Harness `tools/match-loop` (read `LOOP.md` first): bot plays Demo Red via `@jits/shared`; simulator plays Demo Blue via idb; Demo Green exists for 3-party scenarios. The simulator has NO camera: recording/upload cannot be exercised on the simulator; playback can, using a seeded local video (see 3, V-epic).
- Other sessions may be active in these repos (`jr-be-47` in jr_be, possibly a web session in jits_web). Coordinate with `ListAgents` / `SendMessage`; never clobber their work.

## 3. Backlog (work in this order)

### P0 (demo-blocking, do first)
1. **V-epic: match videos + older matches (user requirement).** Today on mobile the ONLY path to an older match's video is Profile > Past Match Videos, which is capped at 10 (`get_athlete_videos` default `p_limit`), hides disputed matches and videos whose analysis failed (`mv.status IN ('failed','deleted')`, `m.status='completed'` only), never refreshes after a new match (fetch on mount only; tabs stay mounted), and is hidden when empty/errored. Match history rows on Home (toast "Match details coming soon"), Profile Recent Matches, Stats full history and athlete profile are NOT pressable. There is NO match-detail screen. Reopening a completed match in the wizard shows no video (in-memory upload store). Web has no past-video viewing at all. Build, as one product team:
   - A mobile **match detail screen** (e.g. `app/(app)/match-detail/[matchId].tsx`, not the live wizard, must not call `useArenaMatchScreen`), reachable from EVERY match history row (Home recent activity, Profile recent matches, Stats full history, athlete profile head-to-head) and from Past Match Videos. Shows result, opponent, ELO delta, date, match type, and the match video(s) with a clear "Watch" action (both participants' videos if both recorded; label whose angle), and graceful states: no video, processing, failed, not a participant.
   - Video lookup by match id (existing `get_match_videos` RPC in `database.ts`, or an additive RPC/field); list ALL videos (pagination or a sensible higher limit), include disputed matches, show a playable MP4 even when analysis failed (status `failed` only means analysis failed if the storage object exists), refresh on focus and pull-to-refresh.
   - Player hardening: re-sign an expired signed URL, handle large MP4s, poster/thumbnail if available (fallback placeholder), respect `match_videos.status`.
   - Web parity: match history rows link to a web match detail page with a video player (web viewer must use `normalized_path ?? storage_path`, bead jits-8t0m). Respect CLAUDE.md hidden-route rules (do not wire up `/match/[id]/live`, `/results`, `/match/pending`); create a new route instead.
   - Verification: harness scenario(s) that seed a local `match_videos` row + storage object for a completed Blue/Red match (local only) and assert the simulator can reach it from history rows and the detail screen, and that the player loads (AVPlayer state or no error UI). Also a prod read-only check that every `match_videos` row has a storage object.
   - Related open beads: jits-x8jy, jits-p75q, jits-7b7v, jits-fjzy, jits-sb83, jits-qeuf, jits-05xx.16, jits-8t0m, jits-kaf.2.2, jits-5tj9.
2. **Web confirm-step fixes (Team A review should-fixes):** web `apps/web/app/(app)/session/[id]/match/[matchId]/steps/match-summary-step.tsx` needs a "Continue without waiting" escape mirroring mobile (20s after I confirmed and the opponent has not); `handleConfirm` failure must re-check the DB (`checkDb()`); fix copy "ELO will update on confirmation" (ELO is applied at record).
3. **Mobile match-flow nits from Team A review:** ready-step remote cancel should go through `exitCancelled` + `markExiting` (double toast/navigation); `voided` status unhandled in reconcile/step-router; add `getMatchConfirmations` to test mocks (`exit-navigation.test.tsx`, `upload-status-visibility.test.tsx`); live-step pause re-sync race (low).
4. **Harness protocol update:** bot (`tools/match-loop/bot/match-side.ts`, `opponent.ts`, `protocol.ts`) must send/handle `match_disputed`, repeated `ready_signal`, and must NOT advance confirm on a `completed` row UPDATE (confirm completes only on dispute or both confirmations). Update C6 oracles to expect `match_disputed`. Then re-baseline all scenarios.
5. **Old-client interop risk:** clients still on pre-OTA JS skip confirm when the match row flips to completed. Mitigation is the demo runbook (force-quit twice). Decide whether any additional safeguard is needed; do NOT unpublish `matches` (user decision).

### P1
- jits-75jt server-side stale-challenge sweep RPC (clock skew) and no push on sweep (additive migration allowed); web maps any 42501 on challenge insert to the cap message.
- jits-qiaz web summary ignores `disputed` (may be covered by Team A web changes, verify).
- jits-lg3d dispute admin notes readable by participants/session peers (additive fix only: e.g. an admin-only table + column REVOKE is NOT additive if it removes access; if the fix requires removing access, file needs-approval).
- jits-q525 banned/suspended athletes allowlisted (product decision: file needs-approval unless a clearly safe additive guard exists).
- `useSessionMatchTimer` starts `running=false` when mounted while paused (shared bug, pinned by a test; fix with care).
- Realtime-down ready check can never complete (no DB backing for ready); consider a DB-backed ready state only if additive and safe.
- jits-yiwx leftovers, jits-y0jg harness nits, jits-3uv6 web parity items that affect the demo.

### P2: UX and fun (after P0 is green and shipped)
Run a product team: a PM agent + a UX/design agent (read the Design System section of `jits_web/CLAUDE.md`: Signal Red only for CTAs/negative, Gain Green only for rating increases, amber for draws, JetBrains Mono tabular-nums for all numbers, no drop shadows, 4px radius (8px modals), one primary CTA per surface, minimal motion: only the rating tick 480ms and LIVE pulse 1400ms loop, everything else reactive 100ms) walk every demo surface on the simulator (screenshots via `xcrun simctl io <udid> screenshot`, driving via idb) and produce a ranked list of polish items and small delights (e.g. clearer Arena states, better empty states, match summary moment with the ELO tick, rematch shortcut to challenge the same opponent again if it is a small change within existing flows, clearer confirm/dispute copy, tactile feedback via existing haptics). Each item: bead, implementer, independent reviewer (with a UX checklist), gate, harness, ship before freeze. Keep each change small and reversible.

## 4. Guardrails (absolute)

1. Never print, log, paste or commit secrets (prod `DATABASE_URL`, service-role key, seed password, `.p8`). Redact artifacts.
2. Every command touching a backend declares `TARGET=LOCAL` or `TARGET=PROD`. Unsure: do not run it.
3. The harness is local-only; never weaken its guards; never point it at prod.
4. Prod SQL is read-only (`BEGIN READ ONLY; ... ; ROLLBACK;`) except approved-by-section-0 migrations applied via `supabase db push` after a dry run.
5. Git: never force-push, never `--no-verify` (if the pre-commit hook fails because of someone else's uncommitted work, verify your staged tree in a clean temporary worktree and wait/coordinate; do not bypass), never `git add -A|.|-u`/globs, never stage `.env*`, never `checkout/restore/reset/stash` files another session may own. Beads state in its own `chore(bd)` commit. Worktree gates: use real `node_modules` copies (`cp -Rc`), NOT symlinks (symlinked node_modules made `expo export` silently bundle an empty app).
6. Separation of duties: the author of a change never approves it. Never ship on red.
7. OTA never carries native changes.
8. Before any prod deploy, announce it to other sessions (`SendMessage`), and record the rollback command you would use.

## 5. Procedures

### 5a. OTA to `production`
Preconditions: section 0 satisfied, JS-only diff since the last OTA commit (classify per `.claude/commands/ship-mobile.md`), CI green.
1. `cd apps/mobile && npx eas whoami`.
2. Move local env aside: `mv .env .env.ota-aside; mv .env.local .env.local.ota-aside` and ALWAYS restore afterwards (even on failure).
3. `npx eas update --channel production --environment production --message "<beads>: <change> (<sha>)" --non-interactive`.
4. Verify the LIVE MANIFEST (the Supabase URL is in `extra.SUPABASE_URL` of the manifest, NOT in the JS bundle, so grepping `dist/` proves nothing): `curl -s https://u.expo.dev/146416ac-fdf5-4fa2-b58f-2ed7c00e0f42 -H "expo-platform: ios" -H "expo-runtime-version: 0.3.0" -H "expo-channel-name: production" -H "accept: multipart/mixed,application/expo+json,application/json" -H "expo-protocol-version: 1"` must contain the new iOS update id and `"SUPABASE_URL":"https://rzowigdcdojlovlwwpkx.supabase.co"`, and must NOT contain `127.0.0.1`, `localhost:54321` or `192.168.`. On failure: republish the previous good group immediately (5d).
5. Restore env files; relaunch the simulator app; confirm the next preflight passes (local target).
6. `npx eas update:list --branch production --limit 2 --json --non-interactive`: new group, runtime 0.3.0. Log group id.

### 5b. Web prod
1. CI green on the `origin/development` SHA; local `npm run build:web` and `cd apps/web && npm run test:e2e` green on it.
2. `git merge-base --is-ancestor origin/main origin/development` must succeed, then `git push origin origin/development:main`.
3. Poll `gh api repos/Drozes/jits_web/deployments?environment=Production&per_page=1` then its statuses until `success`; HTTP 200 on the production URL.

### 5c. Prod DB migration (additive only, section 0)
In a jr_be worktree branch: migration + pgTAP tests, `supabase test db` against LOCAL (never reset), independent prod-safety review (GO/NO-GO), fast-forward jr_be `origin/development` (message jr-be-47), `supabase db push --db-url "$DATABASE_URL" --dry-run` (only the intended files listed), then push, then read-only verification SQL. Update `packages/shared` types (`npm run db:types`) through the normal pipeline if needed.

### 5d. Rollbacks
- OTA: verify syntax with `npx eas update:republish --help`; republish the previous good group to branch `production`.
- Web: promote the previous Production deployment (Vercel dashboard or CLI if linked); then a revert commit on `development`.
- DB: forward-fix only.
- Record every rollback in the log and the status file.

## 6. Iteration loop

Each iteration (target 25 to 40 min; run independent tracks in parallel):
1. **Sync**: fetch both repos; `git status`; `ListAgents`; `bd ready`, open P0/P1, `needs-approval` list.
2. **Local verification** (TARGET=LOCAL): preflight; core tier every iteration; extended tier every 3rd iteration and after any match-flow change; gate if code changed. Triage per `LOOP.md` (fingerprints, known beads, flakes).
3. **Build**: dispatch product teams for the top backlog items (parallel worktrees, disjoint file areas). Each team: implementer(s) + independent reviewer + gate + harness evidence. Merge reviewed branches into `development` (CHANGELOG: keep all sections on conflicts).
4. **Ship** (before freeze): push `development`; when a batch of reviewed changes is green, OTA and/or web deploy (section 5). Batch; at most one OTA and one web deploy per iteration.
5. **Prod verification** (TARGET=PROD, read-only, every iteration, in a subagent): Supabase auth/REST health; migration head; invariants (matches + challenges in the realtime publication, auto-allowlist trigger enabled, `video_upload_enabled`=true, flags unchanged since the last snapshot); counts only (athletes by status, pending challenges, in-progress matches older than 2h, matches awaiting confirmation, `match_videos` by status and any row without a storage object); Vercel Production deploy for `origin/main` is `success` and serving 200; EAS latest production group runtime 0.3.0 matches the last shipped commit; build 22 FINISHED. Any regression is a P0.
6. **Record**: append to `tools/match-loop/.runs/demo-readiness.jsonl` (iteration, elapsed, SHAs, local results, fixes, deploys, prod checks, open P0s, verdict GO / AT-RISK / NO-GO) and rewrite `tools/match-loop/.runs/demo-status.md` (the page the user reads first in the morning). Bead state in a `chore(bd)` commit.
7. **Continue**: immediately start the next iteration. Never stop because the backlog looks done: when P0/P1 are clear, run the UX product team (P2), deepen verification (extended tier, more scenarios, e.g. video playback, cold relaunch, long matches, draws, disputes), and hunt bugs with fresh adversarial reviewers across the codebase.

## 7. Stop conditions

- Stop at 9h elapsed or 08:15 local (whichever first), but not before 6h (keep working on `development` only after the freeze).
- Prod broken and a rollback does not fix it: keep the run going on diagnosis and workarounds, mark NO-GO for that flow in the status and the final report.

## 8. Final report (write at the end, also post it in chat and publish it as an Artifact page)

`tools/match-loop/.runs/demo-report.md`:
1. Verdict GO / GO WITH CAVEATS / NO-GO, one sentence.
2. What is live: `main` SHA + Vercel URL, OTA group id + commit, iOS build number, prod migration head.
3. Evidence: last harness results, gate, prod check table.
4. Everything shipped overnight: bead, SHA, channel, one line each.
5. UX/fun improvements shipped (with before/after screenshots paths).
6. Open risks with workarounds; `needs-approval` beads with exact proposals.
7. Demo-day runbook for the humans: install from TestFlight (build 22+), open, force-quit and reopen twice to pick up the latest OTA, sign up and complete profile (display name, weight in lbs, gym or free agent, gender, date of birth), Arena: go live, challenge an online athlete, accept the live prompt, match wizard (weight, ready, live, end), one person records, the other confirms (or disputes), ELO updates (draws cost both, amber), watch the match video from the summary or from match history (any older match), "if stuck" steps (reopen the app; max 3 pending challenges clear after 10 minutes), and the host's prod check and rollback commands.
8. Run stats: iterations, elapsed, teams run, fixes, deploys.

## 9. First iteration checklist

1. Record `START_TS` (ISO local) as `{"type":"start",...}` in `demo-readiness.jsonl`.
2. Re-verify section 2 facts and prerequisites; log differences.
3. Read `LOOP.md`, `CLAUDE.md` (both levels), `.claude/commands/ship-mobile.md` and `testflight-release.md`.
4. Kick off in parallel: the V-epic product team (P0.1), the web confirm fixes (P0.2), the harness protocol update (P0.4), and a prod verification pass.
