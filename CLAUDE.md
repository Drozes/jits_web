# CLAUDE.md, ELO RATED Development Principles

ELO RATED is a BJJ competitor matchmaking and rating app. This file captures the non-obvious, durable rules for working in the repo. Anything derivable by reading the filesystem, `package.json`, `tsconfig`, `CHANGELOG.md`, git log, or beads is intentionally NOT duplicated here.

## Project Overview

npm-workspaces monorepo, two apps + one shared package:

- `apps/web/` (`@jits/web`), Next.js 16 App Router + Tailwind + shadcn/ui.
- `apps/mobile/` (`@jits/mobile`), Expo SDK 54 + Expo Router + NativeWind v4.
- `packages/shared/` (`@jits/shared`), the cross-platform data layer: queries, mutations, error types, constants, pure utilities, generated DB types, and platform-agnostic React hooks.

Both apps consume `@jits/shared` for all Supabase reads, writes, and realtime. The **backend lives in a separate repo: `/Users/msponagle/code/EloRated/jr_be/`** (migrations in `supabase/migrations/`, DB tests in `supabase/tests/`, specs in `specs/`, plus `FRONTEND_INTEGRATION_GUIDE.md`). Read it when you need the schema, RLS policies, or business rules.

**App identity:** bundle `com.elorated.mobile`, URL scheme `elorated://`, domain `elorated.com`, app name ELO RATED.

## Shared Package (`@jits/shared`)

- **Consumed by source, no build step** (`"main": "src/index.ts"`). Both apps `include` `../../packages/shared/src/**/*.ts` in their `tsconfig.json` so type checks cross workspaces.
- Public export map is the source of truth: see `packages/shared/package.json#exports`. Path aliases (`@jits/shared`, `@jits/shared/*`) are in each app's `tsconfig.json`.
- **All shared hooks take the Supabase client as a parameter**; platform behavior is injected via callbacks (`onMatchStarted`, `notify`, `getCurrentRoute`, `onUnreadRefresh`, `buildMessageHref`, `buildLobbyHref`). That parameterization is what lets one implementation run on both web and React Native.

## Code Conventions

- **Files:** kebab-case (`athlete-card.tsx`). **Components/types:** PascalCase (`AthleteCard`, `AthleteInsert`).
- **Component size:** target under 80 lines. Web server data-fetching components may reach 120. Mobile screens orchestrate fetch hooks (in `apps/mobile/lib/<area>/use-*.ts`) and aim for under 200. Split when over.
- **Helper placement:** pure cross-app helpers go in `packages/shared/src/utils/`; web-only (`NEXT_PUBLIC_*`, DOM, `cn()`) in `apps/web/lib/utils.ts`; mobile-only (`expo-*`, RN APIs) in `apps/mobile/lib/<area>/`. Already extracted, do NOT re-create: `getInitials`, `extractGymName`, `formatRelativeDate`, `formatRelativeTime`, `formatTimeUntil`, `TOS_TEXT`, `buildShareUrl`, `buildShareText`.
- **Props:** group 4+ related fields about one entity into an object prop.
- **Abstraction threshold:** extract only at 2+ usages across files. Beta phase, ship fast, no abstractions or error handling for impossible/single-use states.

## Critical Gotchas

### Supabase FK join return shapes
- **Unaliased** join `athletes!fk_name(col)` returns `T[]`, access with `[0]`.
- **Aliased** join `challenger:athletes!fk(col)` returns `T` directly, no `[0]`.
- **To-one** join (many-to-one, e.g. `gyms!fk_athletes_primary_gym(name)`) returns `T | null`, but generated types may infer `T[]`. Cast through `unknown` and use `extractGymName()`.
- **To-many** (FK points back to the source) returns `T[]`.

### Stats are computed, not stored
The `athletes` table has NO `wins`, `losses`, `win_streak`, or `belt_rank` columns. **`match_participants` RLS (`match_participants_select`, BE `20260218000000`) exposes only the caller's OWN rows** (`athlete_id = auth_athlete_id()`); other athletes' rows are invisible, so never derive stats or opponents from it. Use `getMatchHistory()` (own match-by-match), `getAthleteStatsRpc()` (single athlete, `get_athlete_stats` SECURITY DEFINER), or `getAthletesStatsRpc()` (batch, leaderboard/swipe).

### Athlete columns are trigger-guarded (client status writes silently no-op)
The BE `guard_athlete_columns` trigger (BEFORE UPDATE on `athletes`) **reverts client writes** to `id`, `auth_user_id`, `current_elo`, `highest_elo`, `status`, `created_at`, `role` for the `authenticated`/`anon` roles (`NEW.col := OLD.col`). So a frontend `.update({ status: "active" })` **returns success with no error but changes nothing**, do NOT write these columns from either app. **Activation is owned by `handle_athlete_activation`** (BEFORE UPDATE): it flips `pending -> active` when an `athletes` UPDATE supplies `display_name` + `current_weight` + (`primary_gym_id` OR `free_agent`). To activate, write the profile *fields* and let the trigger do it (this is what `/signup` and `/eua` do). A directly-set `status` is the classic silent-loop bug.

### Key FK constraint names
Hard to discover, easy to get wrong:
```
Athletes -> Gyms:                 gyms!fk_athletes_primary_gym(name)
Match participants -> Athletes:   athletes!fk_participants_athlete(display_name)
Challenges -> Challenger:         athletes!fk_challenges_challenger(display_name)
Sessions -> Gyms:                 gyms!fk_sessions_gym(name, city, latitude, longitude)
Session participants -> Athletes: athletes!fk_session_participants_athlete(display_name, current_elo, current_weight)
```

### Metro config (regression trap)
`apps/mobile/metro.config.js` relies on Expo SDK 52+ built-in monorepo support. **Do NOT add manual `watchFolders`, `nodeModulesPaths`, or `disableHierarchicalLookup`**, they break resolution of nested transitive dependencies (this regressed Phase 5).

### Weight units: pounds is canonical
`athletes.current_weight` is stored in **pounds (lbs)**. The BE `get_weight_division()` hard-codes IBJJF division boundaries in lbs and the column is commented "in lbs"; `challenges` weights are lbs too. Both apps now capture/store lbs (50-400); web was fixed from a kg-mislabel in `844b16d` (jits-7ry) with NO conversion math at any write site. Pre-fix web-created rows still hold kg-magnitude values and need a one-time backfill (jits-1qj). Do NOT add kg<->lbs conversion when writing `current_weight`.

## Async & Component Boundaries

- **Web (Next.js 16 + `cacheComponents`):** every async data-fetching server component must be wrapped in `<Suspense>`. `export const dynamic` is NOT compatible with `cacheComponents`, do not use it. Pattern: synchronous `page.tsx` wraps an async `Content` component in `<Suspense>`.
- **Web dynamic params:** `params` is a `Promise`. Await it inside the Suspense boundary, never in the page component.
- **Mobile:** screens are client components. Fetch via `useEffect` + a `cancelled` ref inside a hook so unmount during a slow fetch never trips React. Canonical patterns: `apps/mobile/lib/match-flow/use-match-details.ts`, `apps/mobile/lib/session/use-session-for-join.ts`. Params come from `useLocalSearchParams()` (synchronous strings).
- **Web components:** default to server; client components need `"use client"`. Never fetch Supabase data client-side for initial loads, fetch server-side and pass as props. **Mobile:** everything is client (no RSC); shared queries work on both sides.

## Data Access Layer (`@jits/shared/api`)

- Both apps MUST use the typed wrappers, never raw `.from()` / `.rpc()`. The full inventory lives at the source: `packages/shared/src/api/queries.ts`, `mutations.ts`, `chat-queries.ts`, `chat-mutations.ts`. Grep there rather than trusting a list here.
- `ATHLETE_GUARD_SELECT` + `getCurrentAthlete()` are the single source of truth for the athlete guard, shared by web `requireAthlete()` and mobile `<AuthProvider>`.
- **All mutations return `Result<T> = { ok: true, data: T } | { ok: false, error: DomainError }`**, they do not throw. Map raw errors with `mapPostgrestError` / `mapRpcError`. Codes include `MAX_PENDING_CHALLENGES`, `OPPONENT_INACTIVE`, `SESSION_FULL`, `WAIVER_REQUIRED`, `ALREADY_CONFIRMED`, `RLS_VIOLATION`, `UNKNOWN`.

## Backend Business Rules

Not discoverable from frontend code. Full reference: `research/005-backend-reference.md`, `research/007-frontend-backend-integration-brief.md`, and the BE repo's `FRONTEND_INTEGRATION_GUIDE.md`.

- **Activation requires:** `display_name` + `current_weight` + (`primary_gym_id` OR `free_agent`) + `gender` + `date_of_birth`. Setup is a two-step wizard (TOS acceptance -> profile fields).
- **Challenges:** max 3 pending; opponent must be `active`.
- **Starting a match:** `startMatchFromChallenge()` then `startMatch()`, never direct INSERT.
- **Recording results:** `recordMatchResult()` auto-calculates ELO for ranked matches.
- **Weight-aware ELO:** heavier athlete gets +50 phantom ELO per IBJJF division gap. Pass weights to `calculate_elo_stakes`; show `weight_division_gap` when > 0.
- **Draws always cost ELO (Pressure Score):** both athletes lose ELO on a draw, show in amber.
- **Gym manager gating:** session creation is restricted to `gym_managers` via the `is_gym_manager(p_gym_id)` RPC (SECURITY DEFINER). `getGymDetail()` returns `isGymManager: boolean`. Gate "Create Session" and session activate/cancel/end on it (creators also allowed). Initial managers are seeded via service role.

## Realtime & Presence

- **Two-tier presence:** `app:online` (every authenticated active athlete with the app open, drives green dots) vs `lobby:online` (only athletes with `looking_for_casual` OR `looking_for_ranked`, matchmaking, owned by `<ArenaBootstrap />` on both platforms). Same `useOnlineStatus(athleteId)` API on both platforms.
- **Web** uses an external store via `useSyncExternalStore`. **Mobile is AppState-aware:** subscribe on foreground, untrack on background to avoid phantom presence. `app:online` and the lobby ignore iOS `"inactive"` (notification shade, app switcher, system prompts): only `"background"` untracks.
- **Presence rate limit (jits-fa9x):** the server closes a channel after more than 5 presence calls (track/untrack) per 30s (`ClientPresenceRateLimitReached`, then `phx_close`), and realtime-js never rejoins that instance. Every presence owner (`apps/mobile/lib/arena/use-lobby-presence.ts`, `apps/mobile/lib/presence/use-online-presence.ts`, `apps/web/lib/realtime/presence-channel.ts`) treats a CLOSED for a channel that is no longer registered as a loss and rebuilds it on a bounded backoff; CHANNEL_ERROR / TIMED_OUT on a still-registered channel are left to phoenix's own rejoin. Never `teardown()` an already-closed channel (its pending push never settles). Keep presence calls deduped: never re-track an unchanged payload or untrack nothing.
- **Supabase client config:** both use `heartbeatIntervalMs: 15_000`. Web sets `worker: true` (Web Worker, critical for background-tab/PWA). Mobile has no Web Worker and uses an `expo-secure-store` adapter for token persistence.

## Design System

### Color and token semantics (no decorative color)
- **Signal Red** (`text-primary`, `#E63946` / hsl(355 78% 56%)): CTAs and state-negative (losses, destructive) only.
- **Gain Green** (`text-success`): rating increases only.
- **Draws/pressure:** `text-amber-500`. **Metadata:** `text-muted-foreground`.
- **Numeric data values:** default foreground + `font-mono tabular-nums`. NEVER `text-primary` for data.
- **Dual token encoding (keep in sync):** web `apps/web/app/globals.css` is HSL (shadcn slots), mobile `apps/mobile/lib/tokens.ts` is hex (brand precision). This dual representation is by design, do not unify it.

### Typography (4 purpose-bound fonts)
Bebas Neue (`font-display`, wordmarks/taglines, all caps) · DM Sans Bold (`font-heading`, headings/labels/buttons) · Inter (`font-body`, prose, default) · JetBrains Mono (`font-mono`, ALL numeric data, always tabular-nums).

### Brand hard rules (easy to violate)
- **No drop shadows.** Hierarchy via background-color shifts, not elevation.
- **Sharp corners:** default radius 4px (`--radius: 0.25rem`); max 8px for modals; avatars stay circular.
- **One primary (Signal Red) CTA per surface.**
- **Minimal motion:** only auto-animations are the rating tick (480ms) and LIVE pulse (1400ms loop); all else is reactive (100ms).

## UI Kit Rules

- **Web `apps/web/components/ui/`** is shadcn/ui, **never edit manually** (managed by `npx shadcn@latest add <component>`); customize via Tailwind/`cn()` in consumers. **Exception: `badge.tsx` has a custom `success` variant, preserve it when regenerating.**
- **Mobile `apps/mobile/components/ui/`** are hand-written RN primitives (NativeWind v4 + class-variance-authority); edit directly. Mobile `badge` also has a custom `success` variant.
- A shared **`elo-system/`** brand-primitive set exists under `components/ui/elo-system/` on both web and mobile; keep the two in parity when touching either.
- Components that can't take a `className` (RN `Switch`, gorhom `BottomSheet`) read `useThemedTokens()` for the right runtime token map.
- `MatchCard` accepts optional `matchType: "ranked" | "casual"`, rendered inline with the date ("2d ago, Ranked"). Mobile mirrors the API.

## Routes

- **`/arena` and `/arena/swipe` are LIVE again on web** (deliberate product decision; they previously carried a top-of-component `redirect("/")`). `/arena` is in the primary nav. Do NOT re-hide them.
- **Still hidden, preserved, do NOT "fix" or wire them up:** `/match/pending`, `/match/lobby/[id]`, `/match/[id]/live`, `/match/[id]/results`, `/athlete/[id]/challenges`, `/messages`, `/messages/[id]`. Note the mechanism differs per route and the old blanket "all redirect to `/`" claim was wrong: `/match/pending`, `/match/lobby/[id]` and `/athlete/[id]/challenges` carry an unconditional `redirect("/")` in their `*-content.tsx`; `/match/[id]/live` and `/match/[id]/results` redirect only for NON-participants; `/messages` and `/messages/[id]` have **no redirect at all** and render fully. There is no `middleware.ts` (Next 16 renamed it: the equivalent is `apps/web/proxy.ts`, which refreshes the Supabase session and holds a public-path allowlist, but issues no hiding redirects) and no feature flag gating any of this. Chat is hidden purely by the absence of a nav entry, not by a flag.
- **`/gyms` and `/gyms/[id]` are hidden from the primary nav but remain live routes**, reachable by direct URL and from the Home and session links that still point at them. Gym *selection* in signup / `/eua` / profile edit is a separate surface and is NOT hidden. Do not add `/gyms` back to `NAV_TABS` without a product decision.
- Active route set is the filesystem under `apps/web/app/` and `apps/mobile/app/`. **Both navs are now the same four tabs: Home, Arena, Rankings, Profile.** **Mobile is Arena-only (jits-gewv, 2026-09-25): gym sessions, the live session lobby, gym list/detail and the whole gym-manager portal were deleted from `apps/mobile`.** Arena plus online presence is the only matchmaking path. Gym *selection* in profile setup/edit and gym-name display remain. Web still has sessions and gyms, and `@jits/shared` session code stays because web uses it. The match-keyed shared hooks `useSessionMatchSync`, `useSessionMatchTimer` and `cancelSessionMatch` are used by the Arena match flow despite their names; do not delete them.
- **The Arena challenge handshake ships on BOTH platforms** (`apps/web/hooks/use-arena-challenge.ts`, `apps/mobile/lib/arena/use-arena-challenge.ts`): challenge, live prompt, accept, straight into the match wizard. There is deliberately NO inbox. Chat is still unbuilt on mobile and hidden on web.
- **Mobile: live persists app-wide (jits-pplr).** Live state, `lobby:online` presence and the incoming-challenge listener + prompt are mounted ONCE by `<ArenaBootstrap />` in `apps/mobile/app/(app)/_layout.tsx` and read everywhere through `apps/mobile/lib/arena/arena-store.ts`; the Arena screen owns none of them (never mount `useArenaLive` / `useArenaChallenge` / `useLobbyPresence` on a screen, that double-writes and double-prompts). Switching tabs keeps you live; entering a match (any mounted `match/[matchId]`, via `useArenaMatchScreen()`) goes offline and suppresses challenge prompts, and leaving it restores live if you were live going in; backgrounding goes offline and foregrounding restores it (not mid-match); launching with `looking_for_ranked` true resumes live, but only once the app is actually in the foreground (a silent-push background launch must not advertise the athlete); sign-out clears the flag before the session drops. Any gorhom `BottomSheetModal` driven by an effect must only `dismiss()` a sheet it presented and that has not closed itself (see `notification-panel.tsx`, `challenge-prompt-sheet.tsx`), or it sticks in DISMISSING and the next `present()` renders nothing. A LIVE pill (`components/layout/live-header-signal.tsx`) sits in both headers (`AppHeader`, `BrandHeader`). **Tab header rule:** on all four tabs the header's right side is exactly the LIVE signal (while live) then `NotificationBell`, nothing else (Home/Rankings use `BrandHeader` with the wordmark, Arena/Profile use `AppHeader` with a centred title); Profile's Share lives in the body. Pushed screens keep their own right actions. Mobile also reads `getPendingChallengesForAthlete()` at mount, on going live and on foreground (`lib/arena/use-pending-challenge-recovery.ts`), offering only a fresh (10 min) incoming challenge whose challenger is still in the lobby, and restoring its own fresh outgoing one.
- **Arena concurrency (mobile `lib/arena/use-arena-challenge.ts`, ported to web `apps/web/hooks/use-arena-challenge.ts` in jits-7dqt):** the challenger enters a match only on `started` (never on `accepted`, the accepter is creating the match then), with a 12s `ACCEPTED_FALLBACK_MS` safety net that starts it itself; entering a match declines every other fresh pending incoming challenge; crossing challenges (A and B challenge each other) tie-break on the lower challenge id as canonical so both land in ONE match. Accepting while your own challenge is out withdraws it first (pending-guarded), or joins it if it already started. A challenge that arrives while a match screen is mounted (or one is being entered) is declined as busy, except the match peer's, which is withdrawn quietly. On mobile the roster re-reads when a `lobby:online` id is missing from it (`use-roster-lobby-sync.ts`). Web has the same handshake logic, with these differences: web's "busy" is `isMatchRoute()` (`components/layout/nav-config.ts`, a mounted match screen only), while `isImmersiveRoute()` (which also covers the session lobby and join wizard) still takes the athlete offline and suppresses the prompt there; web has no persisted accepter rejoin (mobile's AsyncStorage `rejoinStartedMatch`), no channel rebuild after a server close, and no client-side `expires_at` expiry of the waiting bar. Both platforms suffix the incoming `postgres_changes` topic per build (`incomingTopic`): realtime-js 2.105.4 `channel(topic)` hands back a still-leaving instance, so a fixed topic goes deaf on a remount that overlaps its teardown.
- **Pending-challenge recovery on web:** web mounts the handshake app-wide too (`apps/web/components/arena/arena-bootstrap.tsx`). Its `recover()` in `apps/web/hooks/use-arena-challenge.ts` runs at mount / go-live / leaving a match / tab-visible and whenever a prompt clears without a match: it restores the athlete's own fresh outgoing challenge, and (mobile parity, since jits-7dqt) offers the newest fresh pending INCOMING one whose challenger is in `lobby:online` (`lobbyIds`, passed by the bootstrap), re-reading its row first so one withdrawn while the tab was hidden is not raised. **Known gap, do not assume it works:** on both platforms a pending challenge older than the live-prompt window (`ARENA_CHALLENGE_FRESH_MS`, 10 min), or whose challenger is no longer in the lobby, is never surfaced. `challenges.expires_at` still defaults to 7 days against a cap of 3 pending; the frontend mitigates it (jits-celf) by withdrawing the athlete's OWN outgoing pending challenges older than that window on mount / go-live / foreground and on a capped insert (retry once), via `cancelStaleOutgoingChallenges()`. That also withdraws web profile-sheet challenges after 10 minutes (their view/accept pages are hidden anyway). The backend sweep is still a separate bead.

## Mobile Specifics

- **Routing:** file-based under `apps/mobile/app/`. `(app)/` is a Stack; inside it `(tabs)/` is the 4-tab navigator; `athlete/[id]`, `match/[matchId]`, `settings` push on top.
- **Theming:** `apps/mobile/tailwind.config.js` declares semantic tokens as CSS vars; `<ThemeProvider>` applies `vars()` overrides from `apps/mobile/lib/tokens.ts` by system color scheme.
- **Match-flow state machine (8 steps):** `wait, weight, ready, live, end, result, confirm, summary`, driven by `apps/mobile/lib/match-flow/step-router.ts`. The live step mounts the camera overlay, keeps awake, fires haptics, and auto-stops recording on end. Recording is best-effort; permission-denied users still progress.
- **Match exits:** every exit from `match/[matchId]` goes through `exitMatchTo()` (`router.dismissTo`) in `apps/mobile/lib/match-flow/exit-to.ts`. Never `router.replace` out of a match: it stacks a duplicate `(tabs)` navigator (stale screens, duplicate subscriptions). Exits pop back without refocusing, so post-match refreshes key off `useMatchExitCount()` (`lib/arena/arena-store.ts`), not focus alone.
- **Getting back into a match:** Home's "Resume your match" card (`getMyActiveMatch()`, `lib/match-flow/use-my-active-match.ts`) only offers; resuming is the athlete's tap. The only auto-navigation is the accepter rejoin (`rejoinStartedMatch` in `use-arena-challenge.ts`, AsyncStorage record): an accepter whose app died right after accepting is put into the match the challenger started, only within the 10 min window and only if it never entered it. Do not add other auto-navigation into matches.
- **Video:** web records WebM via `MediaRecorder`; mobile records MP4 via `expo-camera`, streamed via `FileSystem.uploadAsync` (BINARY_CONTENT, no base64) to the `match-videos` bucket. The key is built by `buildMatchVideoPath()` in `packages/shared/src/api/mutations.ts` and is `<match_id>/<uploader_athlete_id>/<unix_ts>.<ext>` (no `matches/` prefix). Do not hand-roll it.
- **Deep linking:** scheme `elorated://`; universal links on `elorated.com` (`/athlete/*`). expo-router routes incoming URLs itself; `apps/mobile/app/+native-intent.tsx` (logic in `lib/deep-links/system-path.ts`) only rewrites them first: retired `/session`, `/gyms`, `/gym-manager` paths go to `/` (mobile dropped sessions and gym pages; web still has them), `reset-password` goes to `/login`. Do NOT add a bootstrap that `router.push`es incoming links, it double-navigates. The AASA / Android intentFilter still claim `/session*` and `/gyms*` until jits-d3hb ships.
- **Error tracking:** Sentry SDK is wired in code via `apps/mobile/lib/error-tracking/sentry.ts` (guarded on `EXPO_PUBLIC_SENTRY_DSN`) and forwarded from the error boundary. The `app.json` Sentry config plugin still needs a real org/project before the first EAS build.
- **Feature flags:** web has frontend constants (`apps/web/lib/feature-flags.ts`, `getFlag()`) plus a backend `feature_flags` table. Mobile has no flag layer yet; add a shared module under `@jits/shared/constants` if a cross-platform runtime toggle is needed.

## Workflow

### Pre-commit quality gates
The Husky `pre-commit` hook runs `typecheck` + `test` across workspaces automatically; do not commit on failure.
- **Always:** `npm run typecheck` (all workspaces) and `npm run test`.
- **Web changes to routes/layouts/auth/multi-file refactors:** also `npm run build:web` and `cd apps/web && npm run test:e2e` (Playwright).
- **Mobile changes to native modules / `app.json` / metro config:** also `cd apps/mobile && npx expo export --platform ios --no-bytecode` (catches metro/resolution errors `tsc` misses).
- **Match-loop harness:** `tools/match-loop/` drives the iOS simulator against a local bot for end-to-end match-flow verification (`npm run match-loop -- --tier core|extended`, local stack only); the runbook is `tools/match-loop/LOOP.md`.

### Type generation
After every backend migration, run `npm run db:types` from the repo root (regenerates `packages/shared/src/types/database.ts` from the local Supabase instance in the BE repo). Both apps pick it up automatically.

### Changelog
Always update `CHANGELOG.md` under `## [Unreleased]`, organized by area with `**Added** / **Changed** / **Fixed** / **Removed**`. Include file paths for new files; be concise but specific.

### Mobile deploy: OTA vs TestFlight
Two ways to ship `apps/mobile`. **Default to OTA when the change is JS/asset-only; escalate to a TestFlight build for anything that changes the native binary or the runtime version.** The `ship-mobile` skill classifies a change and runs the right path; this is the rule it encodes.

- **OTA (EAS Update):** `cd apps/mobile && npx eas update --channel <production|preview|development> --environment <env> -m "..."`. Pushes a new JS bundle to already-installed builds; it lands on the next cold start (`fallbackToCacheTimeout: 0`). Seconds-to-minutes, no Apple round trip. **Only reaches builds that already embed `expo-updates` AND share the published `runtimeVersion`** (policy `appVersion` = `expo.version`). It also only routes if the target channel is mapped to a branch (EAS dashboard / `eas channel`), else the update publishes but no build receives it. The first OTA-capable build was the one that added `expo-updates` (build 19, v0.1.0; build numbers are EAS-remote via `appVersionSource: remote` + `autoIncrement`, so `app.json` `buildNumber` is not authoritative). Installs older than that cannot receive any OTA.
- **TestFlight build:** the `testflight-release` skill (`eas build -p ios --profile production --auto-submit`). A new native binary, required for anything OTA cannot carry.

**Requires a TestFlight build (NOT OTA-eligible):**
- a native dependency in `apps/mobile/package.json` added / removed / version-changed (`expo-*` / `react-native-*` / anything with native code). A pure-JS dep bump is OTA-ok.
- `app.json` / `app.config.js` native config: `plugins`, permissions, entitlements, `scheme`, bundle id, icons, native `splash`, the `ios`/`android` blocks, `updates`, `runtimeVersion`.
- a marketing `expo.version` bump (with `runtimeVersion: appVersion`, bumping the version forks the OTA target, so the new version needs a fresh build before any OTA reaches it).
- Expo SDK upgrade, `metro.config.js`, `babel.config.js`, `eas.json`, a New-Architecture/Hermes change, or a `react-native-reanimated` worklet/babel-plugin change (reads as JS but is native-bound).
- env baked at native build time (credentials, anything non-`EXPO_PUBLIC_`). `EXPO_PUBLIC_*` values are inlined into the JS bundle, so a value change *can* ride an OTA, but `eas update` resolves them from the EAS environment (`--environment <env>`) or the publish shell, NOT from `eas.json`'s `build.<profile>.env`. Pass `--environment` matching the target and confirm the resolved value. (Known trap: `build.production.env` sets `EXPO_PUBLIC_APP_ENV=staging`, so do not assume "production = production"; reconcile before relying on this.)

**OTA-eligible (default):** JS/TS/TSX under `apps/mobile`, `packages/shared`, JS-bundled assets, styles, and copy, with none of the above touched. When unsure whether a dep is native, treat it as TestFlight-required. **Eligibility is bound to the native module set of the build already in the field:** a JS change that calls a native API/method newer than what the installed build embeds will crash at runtime even though no native file changed in the diff, so when the JS leans on a new native capability, build. An OTA can NEVER carry a native change (it silently won't); when in doubt, build.

### Pre-launch blockers (status-tracked, verify before acting)
Run `eas init` to replace `app.json` placeholders (`extra.eas.projectId`, `updates.url`, Sentry org/project). Universal-link files at `public/.well-known/` need the real Apple Team ID and SHA256 fingerprint, hosted at `https://elorated.com/.well-known/`. Apple Developer + Google Play enrollment required. `STORE_LISTING.md` is the source of truth for the launch checklist.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
