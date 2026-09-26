# ELO RATED, the biggest improvements after the overnight demo run (2026-09-26)

**How to read this.** This is a principal engineering and product review, written the morning after the 2026-09-25/26 overnight run (see research/016 for the story of that run).

**Inputs:**
- `CLAUDE.md`;
- research 008, 012, 013 and 015;
- `CHANGELOG.md` [Unreleased];
- `tools/match-loop/.runs/demo-report.md`;
- the open backlog (`bd list --status open`, 288 open issues);
- the backend at `/Users/msponagle/code/EloRated/jr_be` (96 migrations, `specs/`, `supabase/functions/`).

The load-bearing backend claims were spot-checked against the migrations before this was saved:
- the 7-day challenge default;
- the fixed K=32;
- the admin-only `resolve_dispute`;
- the push fallback to `host.docker.internal`.

**Ranking.** Each item is scored on:
1. a successful launch and retention;
2. the reliability of live in-person matches;
3. team velocity and ship safety.

Items 1 to 5 are launch blockers or near-blockers. Items 6 to 10 are what makes people come back. Items 11 and 12 enable the rest and should run in parallel.

---

## Executive summary

The core loop now works in the lab: go live, challenge, run the match wizard, record, confirm, see ELO, and watch the video, on both platforms. The harness shows it: core 7/7, extended 20/20, and a soak of 14/14 plus 40/40. Launch risk has moved out of the match wizard and into everything around it:
- **The front door is broken.** `elorated.com` is a GoDaddy page, universal links do not resolve, there is no mobile password reset, and a disabled Apple button is showing.
- **Releases depend on memory.** TestFlight build 22 was never submitted, the edge functions are stale, and a required secret is missing.
- **The server does not own match lifecycle.** A challenge lives for 7 days while the UI's window is 10 minutes, and abandoned matches stay `in_progress` forever.
- **Push is dead on prod.**
- **We cannot see prod.** Web has no error tracking, and neither platform has product analytics.

The recommendation is to fix those five before building anything new. Then spend the retention budget on three fun bets that fit the in-person BJJ culture: King of the Mat, Rivalries, and a shareable Fight Card. The AI video analysis pipeline and the Reels handoff should be paused explicitly until the loop above is solid.

---

## Ranked improvements

### 1. Fix the front door: domain, universal links, account recovery, Apple sign-in

**Problem.** A new user's first touches with the product fail in several places:
- **The domain.** `elorated.com` serves a GoDaddy site-builder page, not the Vercel app (jits-x1t2). Every share link (`buildShareUrl`) and every universal link (`/athlete/*`) points at the wrong site.
- **The `.well-known` files.** They sit at repo-root `public/.well-known/` with `TEAM_ID` and `PLACEHOLDER_SHA256_FINGERPRINT` placeholders. The web deploy does not serve them, and they sit behind the auth proxy (jits-ioz4, research/015).
- **Password reset.** Mobile has no screen that consumes a reset link: `apps/mobile/app/+native-intent.tsx` rewrites `reset-password` to `/login`. A forgotten password is unrecoverable in the app (jits-r75.12).
- **Apple sign-in.** Web shows an Apple button while the Apple provider is disabled on prod (jits-2cb2). Mobile has no Apple sign-in at all (jits-rag), which is an App Store guideline 4.8 blocker once Google sign-in is public.
- **Auth config.** Prod's redirect allow-list, Google client IDs and SMTP are unverified (jits-wn5g, jits-by0, jits-mn1t).

**Proposal.** Ship one "front door" milestone with a single owner:
1. Attach `elorated.com` to Vercel and repoint DNS.
2. Move `.well-known/*` into `apps/web/public/.well-known/` with the real Team ID and SHA256, and exempt `/.well-known` in `apps/web/proxy.ts`.
3. Add `https://elorated.com/**` and `elorated://**` to the Supabase redirect allow-list.
4. Build the mobile reset-password screen (`updateUser({ password })` on the recovery session).
5. Hide the web Apple button now, and build native Apple sign-in on mobile (`expo-apple-authentication` plus `signInWithIdToken`) for the next TestFlight build.
6. Decide the same-email account-linking policy before public SSO. research/012 section 7 flags that a forked identity fragments ELO history, which is uniquely damaging for a product built on one persistent rating.

**Impact.** A launch blocker. It gates App Review, every share and invite loop (items 8 and 10), and returning-user retention, because a user who cannot reset a password is lost.

**Effort.** M overall:
- DNS and `.well-known`: S, mostly human work.
- Password reset: S to M.
- Apple sign-in: M, and it needs a new build.

**Risks.**
- DNS propagation and iOS AASA caching can delay link verification by up to a day.
- Apple sign-in needs a new native binary, which forks runtime 0.3.0.
- Account linking is a product decision, not a code change.

**First step.** A human attaches the domain in Vercel and sets `A 76.76.21.21` and `www CNAME cname.vercel-dns.com` at GoDaddy. In the same PR, an agent moves `.well-known` into `apps/web/public/` and adds the proxy exemption.

### 2. Build a human-gated release train with automated preflight

**Problem.** Every serious incident this week was a release-process failure, not a code failure:
- TestFlight build 22 finished on EAS but was never submitted, so 0.2.0 installs could not receive the 0.3.0 OTA (jits-hnc3).
- The edge functions on prod are older than the repo, and the repo versions need `SLICER_SHARED_SECRET`, which prod lacks.
- Nothing blocks a direct push to `main` or `development` (jits-syu).
- Vercel Preview writes to live TestFlight data (jits-jsh).
- The permission classifier (correctly) blocks agents from prod actions, so every deploy becomes an ad hoc human session that retypes commands from a report. That retyping is exactly where the TestFlight submission slipped.

**Proposal.** Make a release one reviewed click for the human, with the machine doing the checking:
- **A `release preflight` script** under `tools/release/`, read-only against prod. It fails loudly when any of these holds:
  - the latest EAS build for a runtime is not submitted or not processed in App Store Connect;
  - the OTA's target runtime has no installed builds;
  - the deployed edge-function versions differ from `jr_be` HEAD;
  - a required function secret is missing (checked with `supabase secrets list`, names only);
  - the remote migrations differ from the repo;
  - the `EXPO_PUBLIC_*` values resolved for `--environment production` point at a non-prod host.
- **GitHub Environments with a required reviewer** for `production-web`, `production-ota` and `production-edge`. Agents open the deploy run and the human approves it. This respects the classifier and removes the retyping step.
- **Branch protection** on `main` and `development`, requiring the four CI checks (`.github/workflows/ci.yml`).
- **A second Supabase project for staging and preview** (jits-jsh), so agents can run a synthetic smoke on something prod-shaped without prod approval.

**Impact.** The highest leverage on ship safety and velocity. It turns the overnight model (agents build, a human approves) into a repeatable pipeline instead of a morning scramble, and it directly prevents the three failures above.

**Effort.** M:
- Preflight script: S to M.
- Environments and branch protection: S.
- Staging project: M (seed data, secrets and Vercel wiring).

**Risks.**
- Preflight needs read-only prod credentials in CI, so it should get a scoped, dedicated token.
- Branch protection slows hotfixes unless an admin bypass is documented.
- A staging project doubles the migration targets, so the release train must push migrations to staging first.

**First step.**
1. Turn on branch protection for `main` (jits-syu; about 15 minutes).
2. Write `tools/release/preflight.ts` with the first two checks: the EAS build is submitted, and the OTA's runtime has installs.
3. Wire it into the `ship-mobile` skill before `eas update`.

### 3. Make the server own match lifecycle: challenge TTL, abandoned matches, stuck states

**Problem.**
- **Challenges outlive the UI by a week.** Arena challenges are a 10-minute experience (`ARENA_CHALLENGE_FRESH_MS`), but `challenges.expires_at` defaults to `now() + interval '7 days'` (`jr_be/supabase/migrations/20260204034400_create_challenges_table.sql:71`). A pg_cron sweep already exists (`20260220300000_challenge_expiration_cron.sql`, every 15 minutes), but it only expires rows against that 7-day deadline. The results:
  - stale pending rows hold the 3-pending cap for a week (jits-celf);
  - the "Waiting for" plate sticks (jits-1o4l);
  - every client carries freshness filters that must agree across web and mobile (jits-75jt).
- **Abandoned matches never end.** They stay `in_progress` forever, with no timeout or cleanup (jits-r9a). The Resume card only hides this for 60 minutes.
- **Clients infer state from broadcasts they can miss.** The dispute and backgrounded-athlete strand bugs (jits-wfpo, jits-vh7m, jits-bmei, jits-27s) all come from this.

**Proposal.** Move lifecycle truth into the database:
1. **An additive migration.** Set the Arena challenge `expires_at` to `now()` plus the Arena window (10 minutes, matching the shared constant). Either run the existing cron every minute, or add a dedicated `sweep_stale_challenges()` that is idempotent and sends no push (jits-75jt, jits-zoru).
2. **A `sweep_abandoned_matches()` cron:**
   - `pending` matches older than 10 minutes become `cancelled`;
   - `in_progress` matches past `started_at` plus duration plus a grace period, with no result, become voided, with no ELO change;
   - it emits a realtime UPDATE so any open wizard exits cleanly.
3. **One client rule.** Every wizard step re-reads the match row on foreground, on reconnect and on a 10-second poll, and treats the row as authoritative. Web already does this after the release review. Mobile should adopt it as a shared hook in `@jits/shared/hooks`.

**Impact.** The single biggest reliability win for live in-person matches. It deletes a whole class of "stranded" bugs instead of patching each one, and lets clients drop duplicated freshness logic.

**Effort.** S to M:
- TTL change plus cron cadence: S.
- Abandoned-match sweep plus pgTAP tests: M.

**Risks.**
- **Voiding a finished match.** A real pair may finish offline and record late (gym wifi). Mitigate with:
  - a generous grace window;
  - `record_match_result` refusing a voided match with a clear error;
  - the offline mutation queue surfacing that error.
- **Old readers break.** Anything still reading a week-old challenge will break. That is acceptable, because the product deliberately has no inbox.

**First step.** Write the `jr_be` migration that changes the `challenges.expires_at` default (a column default change is additive and forward-only). Include a pgTAP test that a fresh Arena challenge expires within the window, and ship it through item 2's release train.

### 4. Make push notifications actually fire, and use them where it matters

**Problem.** Push never fires on prod:
- `notify_push_function` posts to `current_setting('app.settings.edge_function_url', true)`. That setting is unset on hosted Supabase, so it falls back to `http://host.docker.internal:54321/functions/v1/push` (`20260220000000_push_subscriptions.sql:146`; jits-qokf, jits-kaf.1.8).
- The VAPID secrets are missing.
- Devices are never unregistered on sign-out (jits-7yag).
- Once push works, quiet cancels would fire banners (jits-zoru).

This matters more than usual here. The Arena only works while both athletes have the app in the foreground, so a challenge to someone whose phone is in their gym bag silently dies.

**Proposal.**
1. **Plumbing.** Move the edge-function URL and service key into Supabase Vault through a migration, so there is no GUC dependency. Set the VAPID and Expo credentials. Add a `push_delivery_log` table (status and error per send) so item 5 can observe delivery.
2. **Product: a short allowlist of high-signal pushes:**
   - "X challenged you", only while the challenge is fresh;
   - "Your opponent recorded the result, confirm it", which also fixes jits-vh7m and jits-wfpo from the outside;
   - "A dispute on your match was resolved";
   - later, "Your rival is live" (item 10).
3. **Permission.** Keep the existing primer (jits-r75.1), and layer iOS provisional authorization on the next build (jits-r75.15).

**Impact.** Both retention and live-match reliability. It is the only way to recover an athlete who backgrounded mid-flow, and the only re-engagement channel the product has.

**Effort.**
- Plumbing: S, mostly human secret setup plus one migration.
- Delivery log and product copy: M.

**Risks.**
- **Over-notifying.** Pushing on quiet state changes (jits-zoru) would burn the one-shot iOS permission goodwill.
- **Shared devices.** Tokens that are never unregistered could send one user's push to another person on a shared device (jits-7yag). Fix that first.

**First step.** Write the Vault migration that replaces the GUC lookup. Then have a human set the VAPID and Expo secrets and send one test push to a founder device.

### 5. Observability and product analytics: see prod before users tell you

**Problem.**
- **Prod was invisible overnight.** No prod observability surfaced during the run; prod checks were "not run; the classifier blocked them."
- **Errors are only half-wired.** Mobile has `@sentry/react-native` in code, but it is guarded on a DSN, and the `app.json` plugin still needs a real org and project. Web has no error tracking at all.
- **There is no product analytics** anywhere (jits-r75.10, a P0 open since 2026-06-02). So these cannot be measured:
  - the aha metric (the first ranked result that moves ELO);
  - the activation rate;
  - the match completion rate.

  The TestFlight cohorts about to arrive cannot be measured after the fact.

**Proposal.** Three layers, cheapest first:
1. **Errors.** Sentry on both platforms, with releases tagged by git SHA and OTA update id, so a regression can be traced to an OTA group.
2. **Match-health SQL views** in `jr_be`, read by an admin page and a daily digest. These are the numbers that tell you whether an open-mat night went well:
   - matches started versus completed versus abandoned;
   - median time from accept to start;
   - open disputes;
   - failed or parked uploads;
   - push delivery errors;
   - stale challenges swept.
3. **Product analytics.** A thin `@jits/shared/analytics` module with one event vocabulary for both apps: the ladder in jits-r75.10, plus `went_live`, `challenge_sent`, `challenge_accepted`, `match_completed`, `result_disputed`, `video_watched` and `share_tapped`. Prefer a JS-only SDK so it can ship by OTA.

**Impact.**
- Launch and retention: every later bet, including the fun bets, needs a baseline to be judged against.
- Reliability: incidents are seen within minutes, not the next morning.
- Velocity: agents can check health through read-only views without a human.

**Effort.** M:
- Web Sentry: S.
- SQL views plus admin page: M.
- Analytics module: M.

**Risks.**
- Personal data (date of birth, weight, location) must stay out of events.
- The privacy policy is still to be written (jits-s6mi.7) and must cover analytics before public launch.
- A native analytics SDK would need a new build.

**First step.** Set `EXPO_PUBLIC_SENTRY_DSN` in the EAS production environment and add `@sentry/nextjs` to web (both under a day). Then write a `match_health_daily` view in `jr_be`.

### 6. Cold start: "Open Mat Night" check-in rooms plus concierge seeding

**Problem.** The aha moment, a first ranked match that moves ELO, needs another live athlete in the same room at the same time. research/012 calls the first run a "cold-start graveyard". jits-r75.11 (seed the launch gym) and jits-d7n (seed the go-to-market gyms) are open. Mobile deliberately deleted sessions and gym pages (jits-gewv), so the Arena is now one global pool. At a real open mat, athletes see strangers from other cities and have no way to say "I am on the mat here, now".

**Proposal.** Add a lightweight check-in on top of the Arena. This is not a return of sessions.
- The gym prints a QR code linking to `https://elorated.com/checkin/<gym>` (this depends on item 1).
- Scanning it sets a `checked_in_gym_id` with an expiry (for example 3 hours) and puts the athlete live.
- The Arena gains an "On the mat" filter, the default while checked in, that lists only athletes checked in at that gym.

Pair this with concierge seeding: the founders run the first three open-mat nights at the launch gym in person, with printed QR codes and a coach who knows the flow.

**Impact.** This is the growth loop that makes the in-person product make sense. It gives density on demand, a physical acquisition channel (the QR code on the wall), and a natural home for the fun formats in items 8 to 10.

**Effort.** M. An additive backend table plus RPC, one Arena filter on both platforms, and a web landing route that deep-links into the app.

**Risks.**
- It could fragment an already small pool. Mitigate by falling back from "On the mat" to "Everyone live" when fewer than two athletes are checked in.
- A check-in reveals where someone trains, so limit its visibility to other checked-in athletes.

**First step.** Pick the launch gym and date with the founders (a human decision). Then file a `jr_be` bead for an `arena_checkins(athlete_id, gym_id, expires_at)` table and a `check_in_to_gym` RPC.

### 7. ELO trust: provisional ratings, anti-farming, and a real dispute desk

**Problem.** A rating product lives or dies on whether people believe the number.
- **No provisional period.** Every match uses a fixed `k_factor INT DEFAULT 32` (`20260217000000_weight_aware_elo.sql:66`). A new athlete's 1000 moves as slowly as a veteran's, and the zero-match profile reads as a verdict (jits-r75.2).
- **No farming guard.** Nothing limits repeated ranked matches between the same pair, so two friends can pump one account in an afternoon. The new Rematch button makes this easier.
- **Disputes go nowhere.** The UI promises "An admin will review it", but `resolve_dispute` has no authenticated grant ("Resolution is admin-driven; no authenticated grant. Service role / postgres only.", `20260501000100_dispute_resolution.sql:454`), and no app calls it. Disputes today are a dead letter.
- **Dispute notes leak.** `dispute_admin_notes` and `dispute_reason` are readable by participants and session peers (jits-lg3d).

**Proposal.**
1. **Provisional ratings.** K=48 for an athlete's first 10 ranked matches, then 32. Show "Provisional, N of 10" in muted metadata instead of a win rate.
2. **Pair decay.** The third and later ranked match between the same pair within 24 hours scales K down (for example x0.5, then x0.25). Show it honestly in the "At stake" row the weight step already renders.
3. **A dispute desk.**
   - A founder-only admin page that lists disputed matches and calls `resolve_dispute` through a SECURITY DEFINER wrapper gated on `platform_role`.
   - A push to both athletes when a dispute is resolved (item 4).
   - Close jits-lg3d.
4. **A "How rating works" explainer** in plain BJJ language (jits-r75.13).

**Impact.** Retention and word of mouth: coaches and serious competitors will test the rating's integrity first. It also protects the leaderboard, which is the social proof for everything else.

**Effort.** M:
- K changes: one function plus pgTAP.
- Dispute desk: a small admin surface.

**Risks.**
- Changing K mid-beta changes historical comparability, so apply it only to new matches and announce it.
- Pair decay can annoy real training partners who roll every day. Tune it on item 5's data before tightening.

**First step.** Write the `calculate_elo_stakes` change (provisional K plus pair decay) as a `jr_be` spec with pgTAP cases, and have a founder rule on the numbers.

### 8. Fun bet: the Fight Card (a shareable post-match card, the growth loop)

**Problem.** The summary already has the emotional peak: the 480ms rating tick, the opponent's name, the method, and the Rematch button. But nothing leaves the app except a raw link to a domain that 404s. The Reels highlight epic (jits-s6mi) is the heavyweight version of this idea, and it is blocked on Meta prerequisites.

**Proposal.** A static, server-rendered Fight Card at `https://elorated.com/matches/<id>/card`: a Next.js OG image plus a public share page.
- **Design.** Bebas Neue names and "vs"; the method and time in JetBrains Mono; ELO before and after, with the delta in Gain Green for the winner and amber for a draw; no decoration.
- **Sharing.** A single outline Share button on the summary; Back to Arena stays the one Signal Red CTA. It opens the native share sheet with the image and the link.
- **The link.** It opens the app through universal links, or a web page with one red "Get rated" CTA.
- **Opt-in.** The card is opt-in per match, and the loser's rating change is hidden unless both athletes opt in. BJJ culture respects the tap, not public humiliation.

**Impact.** The first real growth loop. Every finished match becomes an Instagram story in a gym group chat that points at the product. It is far cheaper than Reels and needs no native module or Meta approval.

**Effort.** S to M. A web OG route plus a share entry on the mobile summary and web match detail; JS-only on mobile.

**Risks.**
- It depends on item 1 (the domain).
- A public match page needs an anon-safe read of exactly the card fields. Avoid a leaky RPC (compare jits-eu8g).

**First step.** Build `/matches/[id]/card/opengraph-image.tsx` on web behind a flag. Feed it from a new SECURITY DEFINER `get_match_card(p_match_id)` that returns only the opted-in fields.

### 9. Fun bet: King of the Mat (a winner-stays-on open-mat format)

**Problem.** An open mat is not a queue of isolated 1v1s. The room naturally forms "winner stays on" rounds, and today's Arena has no notion of a room-level format, a streak, or anything to watch between your own rounds.

**Proposal.** An opt-in format inside an Open Mat room (item 6):
- **Starting.** The first two checked-in athletes who tap "Start King of the Mat" begin.
- **Rotation.** The winner holds the mat, and the next challenger comes off a visible queue (by check-in order or raised hand).
- **The match loop is reused.** Each round is a normal ranked or casual match through the existing Arena handshake and wizard.
- **The room display.** It shows the current King's name and a mono counter ("DEFENSES 3"), and nothing else: no colored crowns and no confetti. The LIVE pulse is the only motion.
- **End of night.** A one-line room summary ("Most defenses: Name, 5") feeds a Fight Card variant (item 8).

**Impact.** Fun and retention. It makes a gym night a shared event. It gives spectators a reason to keep the app open, which also keeps presence healthy. And it creates a nightly story coaches will want to run.

**Effort.** M to L. A room-scoped queue (backend table, RPCs and realtime) and a room screen on both platforms; the match loop itself is reused.

**Risks.**
- It depends on items 3 and 6 being solid: a stuck match blocks the whole room, so the lifecycle sweeps are a hard prerequisite.
- Exhausted athletes may keep rolling. Add a per-athlete cap per night and a "leave the queue" control.

**First step.** A paper prototype at the first concierge open mat: a coach runs winner-stays-on while athletes use the Arena, and someone notes where the app gets in the way. Then write a `jr_be` spec.

### 10. Fun bet: Rivalries (turn repeat opponents into a retention spine)

**Problem.** BJJ is built on recurring training partners, and the app already has the ingredients: the head-to-head compare on athlete profiles, the Rematch shortcut (jits-00fr), and `getPendingChallengeBetween`. But nothing names or celebrates a rivalry, so a repeat opponent is just another row.

**Proposal.**
- **Declaring one.** After 3 ranked matches between the same pair, the app declares a Rivalry.
- **The card.** A head-to-head card on both profiles shows the record in mono ("W 3 L 2 D 1"), the last method, and the next match's stake.
- **Surfacing it.** "Rival is live" becomes one of the few allowed pushes (item 4). The Arena pins live rivals to the top of Online now, reusing the rematch pin.
- **Honesty.** This composes with pair decay (item 7): rivalries give meaning to repeat matches while the rating guard keeps them honest.
- **A natural follow-on:** monthly Seasons per gym and weight class, where seasonal standings reset while ELO persists.

**Impact.** Retention: a personal reason to open the app ("is my rival live?") and a recurring story, without new match mechanics. It is mostly a derived view, so it is cheap.

**Effort.** S to M. A `get_rivalries(athlete_id)` RPC over completed matches, one profile card on both platforms, and the Arena pin.

**Risks.**
- Rivalry framing can feel hostile in some gyms. Keep the copy neutral ("Rivalry", never "Nemesis") and let athletes hide it.
- Pair records must not be publicly enumerable (jits-eu8g).

**First step.** Write `get_rivalries` as a SECURITY DEFINER RPC with pgTAP tests, then render a read-only card on the mobile athlete profile behind a flag.

### 11. Parity architecture: one Arena state machine in `@jits/shared`

**Problem.** The Arena handshake exists twice:
- `apps/web/hooks/use-arena-challenge.ts` (661 lines on `development`, and much larger on the post-demo branch);
- `apps/mobile/lib/arena/use-arena-challenge.ts` (1,521 lines).

Every concurrency rule was built on mobile first and ported to web later: the crossing tie-break, the 12-second accepted fallback, declining the others on entry, and the accepter rejoin. Web drifted until two long post-demo branches were needed to catch it up. The harness bot also has to mirror the app's protocol by hand.

**Proposal.**
1. Merge the two post-demo branches first, with a harness run on the merge SHA.
2. Extract the handshake into a pure reducer plus effects in `packages/shared/src/arena/`.
   - **States:** `idle`, `outgoing_pending`, `accepted`, `starting`, `in_match`, and so on.
   - **Events:** from realtime, database re-reads and timers.
   - **Platform adapters** inject navigation, storage (AsyncStorage versus localStorage), app visibility (AppState versus the Page Visibility API) and toasts. This is the same parameterization the shared hooks already use.
3. Unit-test the reducer against the E18 to E20 scenarios as tables. The bot in `tools/match-loop/bot/opponent.ts` then imports the same reducer instead of mirroring it.

**Impact.** Velocity and reliability: one fix lands on both platforms, the bot cannot drift from the app, and web stops being a second-class Arena citizen.

**Effort.** L. A careful refactor of the most concurrency-sensitive code in the repo.

**Risks.** A regression in exactly the code that just stabilized. Mitigations:
- do it after launch-critical items 1 to 5;
- port mobile first, behind the harness (core, extended and soak must stay green);
- ship web only when the reducer passes the same tables.

**First step.** Merge the post-demo branches after a harness run on the merge. Then write the reducer's state and event types as a design PR with no behaviour change.

### 12. Test strategy: make the harness and e2e real gates, plus a prod-shaped smoke

**Problem.**
- **The harness is manual.** The match-loop harness is the best reliability asset the team has, but it is local-only and runs only when someone remembers.
- **e2e is not a gate.** The Playwright suite was red for about four months without anyone noticing (jits-05xx.11). CI runs typecheck, unit tests, the web build and a mobile bundle, but no e2e and no harness.
- **pgTAP is not trusted.** The `jr_be` pgTAP suite is not idempotent on a non-fresh database (jits-6w1, jits-nft, jits-nse), so a red result is not believed.
- **Nothing checks prod after a deploy.** This morning showed why that matters: a GoDaddy 200 looked like a healthy deploy.

**Proposal.**
- Make web Playwright e2e a required CI check.
- Run the harness core tier nightly, and on release candidates, on a self-hosted macOS runner, posting its results to item 2's preflight.
- Fix pgTAP idempotency so `jr_be` CI can run it on every PR.
- Once staging exists, add a post-deploy synthetic smoke: two test accounts go live, challenge, record and confirm. Add a read-only variant for prod that asserts on page content and RPC health, not status codes.

**Impact.**
- Velocity and ship safety: agents can ship overnight against a machine-enforced bar instead of a report that asks a human to trust it.
- Reliability: concurrency regressions are caught before the OTA goes out.

**Effort.** M:
- e2e gate: S (the suite is green now, 14/14).
- macOS runner: M.
- pgTAP idempotency: S to M.

**Risks.**
- Flaky simulator runs would erode trust in the gate. Keep only the stable core tier blocking and make the extended tier advisory.
- A self-hosted runner needs basic security hygiene: no prod secrets on it.

**First step.** Add a `web-e2e` job to `ci.yml` and mark it required alongside branch protection (jits-syu).

---

## Quick wins (each under a day)

1. **Hide the web Apple button** until the provider is enabled (jits-2cb2). Minutes, agent.
2. **Attach `elorated.com` in Vercel and repoint DNS** (jits-x1t2), after confirming the owning account. About an hour of human work plus propagation.
3. **Serve the `.well-known` files properly** (jits-ioz4): move them into `apps/web/public/`, fill in the Team ID and SHA256, and exempt them from the auth proxy. Half a day, an agent plus a human for the IDs.
4. **Set `SLICER_SHARED_SECRET` and the VAPID and Expo push secrets on prod, then redeploy the edge functions** (jits-qokf). Human, about an hour.
5. **Shorten the Arena challenge TTL** by changing the `challenges.expires_at` default and the cron cadence. Half a day with pgTAP.
6. **Turn on branch protection** for `main` and `development` with the four CI checks (jits-syu). 15 minutes, human.
7. **Add a release preflight check** that the TestFlight build is submitted and installed before any OTA to a new runtime (jits-hnc3). A couple of hours, agent. The written rule is already in the release skills; this makes the machine enforce it.
8. **Set the Sentry DSN** in the EAS production environment and add `@sentry/nextjs` to web. Half a day.
9. **Reframe the zero-match profile as provisional** and drop the "0%" win rate (jits-r75.2). JS-only and OTA-eligible; a few hours.
10. **Write a dispute runbook**: a service-role SQL snippet that calls `resolve_dispute`, so the "An admin will review it" promise is true this week. One hour.
11. **Merge the two post-demo branches** after a harness run on the merge SHA. A few hours including the gate.

---

## What to stop or pause

- **Pause the AI video analysis pipeline** (the jits-kaf.1 family) and **the Reels handoff** (jits-s6mi) until items 1 to 5 are done.
  - Watch and history already shipped on both platforms and cover the demo promise.
  - Analysis adds Cloud Run, GUCs, secrets and cost to an ops surface that cannot yet deploy edge functions reliably.
  - The Fight Card captures most of the sharing value at a fraction of the cost.
- **Do not reintroduce gym sessions on mobile.** The Open Mat check-in gives the in-person density sessions were meant to provide, without the gym-manager gating that made sessions a dead end for new users.
- **Relabel the backlog.** Several items marked P0 are no longer on the launch path (the demo recorder epic jits-asw, and jits-kaf.1.*), while real blockers (jits-x1t2, jits-qokf, jits-r75.12) sit at P1 and P2. A P0 should mean "blocks launch or breaks a live match".

---

## Suggested sequencing

- **This week (launch path):** quick wins 1 to 8, then item 1 (the front door), item 3 (lifecycle sweeps) and item 4 (push plumbing), all shipped through the first slice of item 2 (preflight plus approvals).
- **The next two weeks:** item 5 (observability and analytics) and item 6 (Open Mat check-in and the first concierge nights), followed by item 7 (ELO trust) and item 8 (the Fight Card). Both of those depend on the domain and on the data.
- **After the first open-mat nights:** items 9 and 10 (King of the Mat and Rivalries), guided by what item 5 measured. Run items 11 and 12 in parallel throughout as the platform work that keeps the pace sustainable.

## Critical files

- `jr_be/supabase/migrations/20260204034400_create_challenges_table.sql` and `20260220300000_challenge_expiration_cron.sql` (challenge TTL and sweep)
- `jr_be/supabase/migrations/20260220000000_push_subscriptions.sql` (the push GUC fallback)
- `jr_be/supabase/migrations/20260217000000_weight_aware_elo.sql` and `20260501000100_dispute_resolution.sql` (the K-factor and the dispute desk)
- `apps/mobile/lib/arena/use-arena-challenge.ts` and `apps/web/hooks/use-arena-challenge.ts` (parity extraction)
- `.github/workflows/ci.yml`, `apps/web/proxy.ts` and `public/.well-known/` (release gates and universal links)
