# 012, First-Time User Experience (FTUE) Discovery + Roadmap

**Date:** 2026-06-02
**Status:** Discovery + recommendation (no feature code written). Work items filed as `bd` issues under epic **`jits-r75`** (see end).
**Method:** Multi-agent orchestration: 4 parallel recon agents (screen-by-screen FTUE map, both platforms) + 4 parallel research agents (external best practices) -> an independent 4-expert consensus panel (Growth/Activation PM, Mobile UX, BJJ-domain user, Technical-feasibility) -> an adversarial critic (proposer != approver) -> a synthesizer. The critic independently re-verified the panel's load-bearing claims against the repo and caught two material errors (below). All current-state claims cite `file:line` as of the recon snapshot (2026-06-02 ~11:20); note the working tree shifts under an automated commit agent, so re-confirm a path before editing.

---

## 1. Executive summary

ELO RATED's first run is a **field-heavy signup wall that opens onto a cold-start graveyard**, and the product's actual moment of value is **not reachable by a new user acting alone**. The single highest-leverage truth surfaced by the panel: you can polish the funnel all you want, but its endpoint (a first ranked match that moves your ELO) does not exist for a solo new user today, and there is **no analytics to measure any of it**. So the program is three things in parallel, not one: (a) make the endpoint reachable (seed a launch gym), (b) make it measurable (instrument the funnel), and (c) remove the worst client-side friction and de-motivators (quick wins).

**Aha moment:** *a new user's first recorded **ranked** match result that moves their ELO off the bare starting 1000.* That is the first time the core promise (a meaningful, earned rating) becomes real. It is NOT "finished my profile" and NOT "saw ELO 1000" (passive, and today reads as a verdict, not a starting line).

**Activation milestone (instrumentable, distinct from aha):** `athlete_activated` = the backend trigger flips `pending -> active` when the `athletes` UPDATE supplies `display_name` + `current_weight` + (`primary_gym_id` OR `free_agent`) + `gender` + `date_of_birth`. Detect it where status is already re-read post-submit (`use-setup-submit.ts:112-121`).

**Current time-to-value (mobile, primary surface):** ~6 button taps to reach the activated Home on the email/password path, realistically ~10-12 discrete taps once each in-wizard control (gender chip, DOB open+Done, gym open+Done, city open+Done, TOS check) is counted, across **10 fields** (3 credential + 7 profile). If Supabase email confirmation is ON, add an out-of-app round trip plus a manual mid-onboarding re-login. The first surface showing your ELO is Home, but that is passive; the first *meaningful* action is effectively unreachable alone.

---

## 2. The current first-open flow (recon)

Splash -> auth wall -> activation wizard -> 4-tab home. Key facts, cited:

- **No value framing, no explore-before-signup.** `apps/mobile/app/index.tsx:17` hard-redirects every unauthenticated user straight to `/login`. The ~2.3s splash is mood-only; there is no "what is ELO RATED" anywhere before the auth form.
- **Field-heavy activation wizard (3 steps).** `setup-wizard.tsx` -> TOS/EUA, Identity (`firstName`, `lastName`, `gender`, `dateOfBirth`), Training (`weight`, `gym`/free-agent, `city`). The UI **hard-requires more than the backend trigger** does: `validation.ts:43-70` gates on gender, DOB >= 16, and **city**, while the trigger's documented requirement does not include city.
- **DOB picker friction.** Slide-up iOS modal spinner (`date-of-birth-picker.tsx:124-182`) defaulting to today-minus-16y; a "silent no-commit" trap means tapping Done without scrolling sets no value (`:99-104`), leaving Continue disabled. (The team already prefers native pickers here.)
- **Cold, unprimed push permission.** The iOS notification dialog fires automatically the instant activation completes and Home mounts (`register-push.ts:44-48` via `push-registration-bootstrap.tsx:23-38`). iOS gives one prompt per permission, so a cold ask at the worst moment buys a permanent deny.
- **Cold-start Home.** `(home)/index.tsx` for a zero-data user: ELO tile, `0/0/0` stats, empty recent activity, and an accent plate shown **unconditionally** ("Your gym hasn't designated a live session yet... browse other gyms") even for free agents who have no gym. The only forward action is a low-emphasis "Find a session ->" link.
- **Gyms dead-end.** Every Home CTA funnels to the Gyms tab, whose empty state is a bare dashed "No Gyms Found" with **zero CTA** (`gyms/index.tsx:213-219`), and the city filter only lists cities that already have gyms, so an unserved user cannot pick their own city. Discovery is sort-only, not radius/proximity.
- **`0%` win-rate de-motivator.** A zero-match athlete shows "0%" win rate (`profile-quick-stats.tsx`), reading as "loses every match" rather than "new".
- **Stubbed/ghost surfaces.** A prominent disabled Signal-Red "Challenge" button toasts "coming soon" on every athlete profile; settings exposes CHAT/CHALLENGES toggles for unbuilt features; `settings/realtime-test.tsx` ships in the production settings stack.
- **Web FTUE defects (if web is in launch scope).** `/login` has **no email/password sign-in field at all** (`login-form.tsx:46-72`), so returning members cannot sign in from the primary route; `/signup` blocks free agents while `/eua` allows them (two activation gates that disagree); root layout defaults to **light** theme against the dark-first brand.
- **Broken in-app password reset.** The reset deep link routes the token to `/login` with no consuming screen and no `updateUser` path (`deep-links/handler.ts:43-51`), so a forgotten password is unrecoverable in-app.

---

## 3. What the research said (external best practices)

- **Field-count cliff.** 5-7 required signup fields sit at the top of the conversion cliff (~20% completion benchmark range). Defer everything not strictly required for the first aha; use progressive disclosure.
- **Aha = a usage event, not setup completion.** Pick ONE activation metric and measure it as a windowed rate; instrument candidate early actions rather than assuming the threshold.
- **Permission priming golden rule.** Show a branded primer first; fire the OS prompt only on the primer's affirmative CTA; ask in-context at the point of value, never at launch. iOS push is opt-in and one-shot (23-80% grant vs Android 55-92%).
- **Empty state = guided first action**, not an apology (NN/g's three jobs: status + what-belongs-here + a direct path).
- **Cold start = atomic networks.** Saturate ONE gym/city first so a new athlete instantly sees real local opponents in their weight class; a sparse national leaderboard is the ghost town to avoid. Kill the empty profile (seed/import history; provide single-player value).
- **Transferable case studies.** Duolingo (defer commitment, streak), Chess.com (first ranked result is the hook, self-rate to avoid empty profile), Strava (drive to ONE core action, the "device sync" auto-populating hook), Tinder (campus-by-campus density), Verdict MMA (belt/stripe ladder as a familiar retention spine).

---

## 4. Consensus: what the adversarial critic changed

The critic re-verified claims against the repo and corrected the panel on two points that would have caused real damage:

1. **Apple Sign-In is NOT built on mobile.** Two experts claimed "flip `APPLE_SIGN_IN_ENABLED`" / "wire the existing Apple button." Verified false: no `expo-apple-authentication` dependency, no Apple button, no `signInWithIdToken`/Apple path in mobile auth (web has `apple-oauth-button.tsx`; mobile does not). Apple on mobile is a **from-scratch native-module build requiring a new EAS/TestFlight build**, not a quick win. It is also an App Store guideline 4.8 **compliance blocker** once Google is offered. (Already tracked as `jits-rag`.)
2. **`gender` and `date_of_birth` were treated as deferrable; they are not safe to defer.** Per the project activation contract in `CLAUDE.md`, activation requires `gender` + `date_of_birth`. Deferring them would silently break activation (the classic guard/trigger no-op loop) with no field-level diagnosis (`use-setup-submit.ts:112-121`). **The only field the UI requires that the trigger does not is `city`**, so that is the sole legitimate slimming target.
   - **Open conflict to resolve before touching gender/DOB:** the `bd` memory `athlete-column-guard-trigger` and recon say the trigger requires only `display_name` + `current_weight` + gym/free-agent (gender/DOB collected by signup but not enforced by the trigger), which contradicts `CLAUDE.md`. Verify against the actual `handle_athlete_activation` definition in the BE before any wizard change beyond city.

The full read-only **guest-browse** explore-before-signup idea was **dropped** (needs anon RLS on `athletes`/`gyms`, breaks the authenticated-athlete presence model that `useOnlineStatus`/`app:online` assumes, and a sparse guest leaderboard confirms the ghost town to a skeptic pre-signup). It is replaced by a cheap **static value screen**.

**Critic blind spots that became roadmap items:** activation analytics (nothing exists today), an explicit aha metric, cold-start gym seeding as the real launch blocker, single-player/offline value, the correctness defects (broken reset loop; silent activation no-op), the ignored web surface, and SSO same-email account-linking risk.

---

## 5. Prioritized roadmap

Effort: S (hours/1-2 days) / M (days) / L (week+). Quick Win = client-only, ships this week, no new EAS build. Anything needing a backend migration, a new EAS/TestFlight build (native modules: pickers, camera, location, notifications), or design is flagged and is NOT a quick win.

### Quick Wins (client-only, ship this week)

| # | Title | Pri | Effort/Impact | Flags |
|---|---|---|---|---|
| 1 | Gate the cold push prompt behind a branded in-context primer | P0 | S/High | design |
| 2 | Reframe zero-match profile: kill "0%" win rate, anchor ELO 1000 as provisional | P0 | S/High | design |
| 3 | Zero-state Home: one Signal-Red primary CTA + branch the free-agent plate copy | P0 | S/Med | design |
| 4 | Turn the "No Gyms Found" / unserved-city dead-end into a real path (client half) | P1 | S/Med | design |
| 5 | Add Google SSO to the signup screen | P1 | S/High | design |
| 6 | Make `city` optional/auto-derived (the ONLY safe field to slim) | P1 | S/Med | |
| 7 | Remove stubbed/ghost surfaces (Challenge button, chat/challenge toggles, realtime-test) | P1 | S/Med | |
| 8 | Unify the three progress counters into one continuous, entry-path-aware label | P2 | S/Low | design |
| 9 | One-time static pre-login value screen + a Skip on the splash | P2 | S/Low | design |

### Medium (config check, web, or a single new screen)

| # | Title | Pri | Effort/Impact | Flags |
|---|---|---|---|---|
| 12 | Email-confirmation recoverable in-app + build the missing reset-password screen | P1 | M/Med | BE+design |
| 14 | Merged "How rating works" plain-BJJ explainer (anchored to the ELO inline copy) | P2 | S/Low | design |
| 15 | Fix web FTUE: missing email/password login form, free-agent reconcile, dark default | P2 | M/Med | design |

### Bigger Bets (backend / ops / new build, the real blockers)

| # | Title | Pri | Effort/Impact | Flags |
|---|---|---|---|---|
| 10 | Instrument the activation funnel end-to-end (shared analytics layer) | P0 | M/High | BE |
| 11 | Concierge-seed the launch gym's roster + a live session (cold-start) | P0 | L/High | BE+design |
| 13 | Build Apple Sign In on mobile (from scratch, build-gated) for 4.8 compliance -> **`jits-rag`** | P1 | M/High | BE+design |
| 16 | iOS provisional push authorization (build-gated, next EAS build) | P2 | M/Med | |

Per-recommendation problem / evidence / change / acceptance criteria are captured on the filed `bd` issues (section 7).

---

## 6. Recommended sequencing

1. **Week 0 (parallel, the actual blockers):** (10) instrument the funnel and (11) concierge-seed the launch gym + a live session. Without these, every client win funnels users to an empty wall and you cannot measure whether anything worked. Verify whether the analytics SDK is JS-only (shippable now) or native (needs a build).
2. **Week 1 (one TestFlight-free client release):** the verified S quick wins that need no build: (1) push primer, (2) `0%`/provisional ELO reframe, (3) Home primary CTA + free-agent plate, (4) gyms empty-state CTA (ship WITH #3 so the louder CTA does not point at a dead end), (5) Google-on-signup (internal only until Apple lands), (6) city-optional, (7) remove stubbed surfaces, (8) progress counter, (9) value screen.
3. **Week 1-2 (config / web):** (12) check the Supabase email-confirmation setting first (cheapest fix may be a dashboard toggle), then build the reset-password screen regardless (it is a standalone retention defect); (15) web FTUE fixes if web is in launch scope.
4. **Next EAS build (build-gated, not quick wins):** (13) Apple Sign In from scratch (`jits-rag`) MUST land before Google-on-signup is exposed in the PUBLIC build (guideline 4.8); then (16) provisional push layered on the primer; then native DOB/gym pickers (separate, already desired).

---

## 7. Risks and open questions (need a human / product decision)

- **Cold-start ops capacity:** which launch gym(s)/city, and is there committed capacity to seed the roster and keep a live session populated? The whole funnel terminates at a wall without it.
- **The aha endpoint does not exist for a solo user:** challenge is stubbed, sessions are gym-manager-gated. Either seeding guarantees a joinable session, or a self-serve match path is needed.
- **`gender`/`DOB` activation requirement conflict:** `CLAUDE.md` says required; the `bd` memory + recon say the trigger does not enforce them. Resolve against `handle_athlete_activation` before any wizard change beyond `city` (a wrong call here causes a silent pending-loop).
- **Supabase email confirmation ON or OFF?** Not verified by anyone. If OFF, the confirm dead-end disappears for zero code (but unverified emails can pollute the cold-start leaderboard).
- **SSO same-email account-linking:** Google/Apple with the same email as an existing email/password account can fork the auth identity and fragment the athlete row + ELO history. For a single-persistent-rating product this is uniquely damaging; decide the linking policy before exposing SSO widely.
- **App Store sequencing:** shipping Google-on-signup to the public store without Apple risks a 4.8 rejection.
- **Is web in launch scope?** If yes, the missing `/login` email/password form is effectively a P0; if no, descope rec #15.
- **"Request your gym" mailto** only if the support mailbox is actually monitored for TestFlight.

Weight units are NOT an open question: pounds (lbs) is canonical per `CLAUDE.md`; do not add kg conversion.

---

## 8. Filed issues

Epic **`jits-r75`** with 15 children (run `bd show jits-r75`). Child IDs are creation-ordered, so the suffix is not the rec number; mapping below.

| Rec | Issue | Title | Group / Pri |
|---|---|---|---|
| 1 | `jits-r75.1` | Gate the cold push prompt behind a branded in-context primer | QuickWin / P0 |
| 2 | `jits-r75.2` | Reframe zero-match profile: kill "0%", anchor ELO 1000 provisional | QuickWin / P0 |
| 3 | `jits-r75.3` | Zero-state Home: one Signal-Red CTA + free-agent plate copy | QuickWin / P0 |
| 4 | `jits-r75.4` | "No Gyms Found" dead-end -> real path (client half) [dep: .3] | QuickWin / P1 |
| 5 | `jits-r75.5` | Add Google SSO to the signup screen | QuickWin / P1 |
| 6 | `jits-r75.6` | Make `city` optional/auto-derived (only safe field to slim) | QuickWin / P1 |
| 7 | `jits-r75.7` | Remove stubbed/ghost surfaces (bug) | QuickWin / P1 |
| 8 | `jits-r75.8` | Unify the three progress counters | QuickWin / P2 |
| 9 | `jits-r75.9` | One-time static pre-login value screen + splash Skip | QuickWin / P2 |
| 10 | `jits-r75.10` | Instrument the activation funnel end-to-end | BiggerBet / P0 |
| 11 | `jits-r75.11` | Concierge-seed the launch gym's roster + a live session | BiggerBet / P0 |
| 12 | `jits-r75.12` | Email-confirm recover + reset-password screen (bug) | Medium / P1 |
| 14 | `jits-r75.13` | "How rating works" plain-BJJ explainer [dep: .2] | Medium / P2 |
| 15 | `jits-r75.14` | Fix web FTUE: login form, free-agent reconcile, dark default (bug) | Medium / P2 |
| 16 | `jits-r75.15` | iOS provisional push authorization (build-gated) [dep: .1] | BiggerBet / P2 |

**Rec #13 (Apple Sign In)** maps to the existing **`jits-rag`** (not duplicated; cross-referenced with the 4.8-compliance / public-Google sequencing note). Related existing issues annotated: **`jits-ism`** (web signup RLS / free-agent) <-> `jits-r75.14`; **`jits-by0`** (deep-link allowlist) <-> `jits-r75.12`.
