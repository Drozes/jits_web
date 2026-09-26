# ELO RATED, overnight demo-readiness run journal (2026-09-25 to 2026-09-26)

**How to read this.** This is the narrative record of the first fully autonomous overnight run: an orchestrator agent working through `tools/match-loop/DEMO-READINESS.md` from 23:02 on 2026-09-25 to about 05:50 on 2026-09-26, and then the morning deploy that followed. It is written for whoever runs the next one: what we set out to do, what actually happened, what the process got right, and what it got wrong. The per-iteration machine log is `tools/match-loop/.runs/demo-readiness.jsonl`. The status page and final report are `tools/match-loop/.runs/demo-status.md` and `demo-report.md`, and the report is also published as a private Artifact page. The durable technical facts have been folded into `CLAUDE.md`; this journal keeps the story and the judgment calls.

---

## The goal

Real people were going to demo the iOS app on production the next morning. The brief had three priorities, in order:
1. Keep prod demo-ready.
2. Clear the P0 backlog, starting with watching match videos and opening any older match to watch it, on both mobile and web.
3. Then UX polish and fun within the brand rules.

The run had authority for JS-only OTAs, a web fast-forward of `main`, and additive migrations. It had no authority for prod data, flag or allowlist writes. The prod freeze was 08:00.

## Timeline

- **23:02: start.** Prod was web `main` at 2ac752c and a mobile OTA built from 02897b3 on runtime 0.3.0.
  - Four teams kicked off in parallel: the V-epic product team (match detail and video playback), web confirm-step parity (P0.2), mobile match-flow nits (P0.3), and the harness protocol update (P0.4).
  - The first prod deploy attempt, and even read-only prod checks, were denied by the session's permission classifier. From that point every prod action became a needs-approval bead with exact commands. That constraint shaped the whole night.
- **Midnight to 02:00: V-epic and the P0 fixes.**
  - V-epic shipped in five slices:
    - a shared detail data layer;
    - a mobile detail screen with a hardened player;
    - every mobile history row opening its match;
    - web `/matches/[id]` with an inline player;
    - the E17 harness scenario.
  - The harness earned its keep straight away:
    - E11 failed three times out of three and exposed a real P0 (jits-2y8i): the auto-end at 00:00 was cancelled by a re-render.
    - E14 exposed the live prompt appearing while offline (jits-sfry).
    - A C1 to C3 lobby failure after repeated E14 runs exposed the presence rate limit (jits-fa9x). The server closes a channel after more than 5 presence calls in 30 seconds, and realtime-js never rejoins it.
  - All three were fixed, and a reviewer caught a deadlock in the first presence fix before it merged.
- **02:00 to 04:00: a full room.**
  - The "real room" concerns came next:
    - late joiners not appearing (jits-hlm1.4);
    - crossing and many-on-one challenges (jits-njyd, jits-6ziw);
    - match exits stacking tab navigators (jits-tlk3);
    - first-run flakiness.
  - Harness scenarios E18 to E20 were added to cover concurrency, with a toast positive control so that "no toast appeared" is a real assertion rather than a blind spot.
- **04:00 to 04:45: release review and freeze.**
  - A three-reviewer release review of the whole diff found no P0 but produced a round of fixes.
  - The candidate settled at **5aca1d3**:
    - CI green;
    - core 7/7 and extended 20/20 on identical app code;
    - a soak of core 14/14 plus extended 40/40 back to back with no reruns.
  - The candidate was then frozen. All further work went to post-demo branches.
- **04:45 to 05:50: post-demo branches.** Two branches were built, independently reviewed several times, and pushed, but not merged:
  - `postdemo/mobile-followups`: harness-verified on its own code at 7/7 and 20/20.
  - `postdemo/web-arena-parity`: web Arena concurrency brought to mobile's level, plus a web Resume card. It took five review rounds.
- **05:50: final report written and published.** The loop stopped past the six-hour minimum because every remaining action was a prod action the session could not take.
- **Morning: deploys.** With the user present and instructing it, the web fast-forward and the OTA went through.
  - We then discovered that the user's TestFlight app was 0.2.0. Build 22 (0.3.0), the only binary on the runtime the OTA targets, had finished on EAS the evening before but had **never been submitted** to App Store Connect. So the OTA had reached nobody. The user submitted it and it is now in TestFlight.
  - A read-only prod audit then found that `elorated.com` is a GoDaddy site-builder page that is not attached to Vercel. The live web app is `https://jitsweb.vercel.app`.
  - The audit also found that push notifications can never fire on prod.

## What went well

- **The simulator harness was the most valuable thing we had.** Every real P0 of the night was found by a harness scenario failing, not by reading code. Two design choices made its results trustworthy:
  - the toast positive control, which makes a no-toast check mean something;
  - the per-scenario `realtime.log`, which made presence bugs diagnosable.
- **Separation of duties caught real bugs.** Independent reviewers caught more than ten defects before merge, including:
  - an unbounded video re-sign loop;
  - a presence deadlock;
  - a refresh that sent users with a null athlete to setup;
  - a Resume card offered for matches the user had deliberately left.
- **Freezing a candidate early and doing further work on branches** meant the demo build was never destabilised by late work.
- **Needs-approval beads with exact, copy-pasteable commands** turned the classifier block into a morning checklist rather than a lost night.

## What went wrong, and what we learned

- **"Finished on EAS" was treated as "in TestFlight".** No step verified the submission, so the OTA plan rested on a false premise all night. The fix is now in `CLAUDE.md` and both release skills: confirm the submission before publishing an OTA for a runtime, and ask which version testers actually have (jits-hnc3).
- **"elorated.com returns 200" was accepted as proof the web deploy was live.** The 200 came from GoDaddy. A health check must assert on content (the ELO RATED title, a known route), not just on the status code.
- **Prod facts were assumed, not verified.** The domain, push and edge-function state were all wrong in our mental model. A read-only prod audit should be the first iteration of any demo run, not something done after the deploy.
- **The web and mobile Arena had drifted apart.** Most of the post-demo effort went into porting mobile's concurrency logic to web: two implementations of the same state machine, in two hooks of about 1,000 lines each. That is a structural problem, not a one-off (see research/017).
- **Agent prod access is gated, and that is fine, but it needs a planned human handoff.** The run should have produced the morning deploy checklist at the very start, not at 04:45.

## Where things stand

- **Live:** web 5aca1d3 at `https://jitsweb.vercel.app`; OTA group `23271e97-356d-4f41-b9d3-e1d5230b72d5` on runtime 0.3.0; TestFlight build 22.
- **Backend:** all 96 migrations applied on prod; edge functions are from 2026-05-28.
- **Open:**
  - jits-x1t2 (domain), jits-qokf (push), jits-wn5g (auth config checks) and jits-2cb2 (Apple button);
  - jits-ws0i, jits-uleb and jits-mn1t (demo operations);
  - the two post-demo branches, to merge after the demo.

The ranked improvement proposals that came out of this run are in `research/017-big-improvements.md`.
