# CLAUDE.md, ELO RATED Development Principles

ELO RATED is a BJJ competitor matchmaking and rating app. This file captures the non-obvious, durable rules for working in the repo. Anything derivable by reading the filesystem, `package.json`, `tsconfig`, `CHANGELOG.md`, git log, or beads is intentionally NOT duplicated here.

## Project Overview

npm-workspaces monorepo, two apps + one shared package:

- `apps/web/` (`@jits/web`), Next.js 16 App Router + Tailwind + shadcn/ui.
- `apps/mobile/` (`@jits/mobile`), Expo SDK 54 + Expo Router + NativeWind v4.
- `packages/shared/` (`@jits/shared`), the cross-platform data layer: queries, mutations, error types, constants, pure utilities, generated DB types, and platform-agnostic React hooks.

Both apps consume `@jits/shared` for all Supabase reads, writes, and realtime. The **backend lives in a separate repo: `/Users/msponagle/code/experiments/jr_be/`** (migrations in `supabase/migrations/`, DB tests in `supabase/tests/`, specs in `specs/`, plus `FRONTEND_INTEGRATION_GUIDE.md`). Read it when you need the schema, RLS policies, or business rules.

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
The `athletes` table has NO `wins`, `losses`, `win_streak`, or `belt_rank` columns. **Do not query `match_participants` directly, RLS blocks SELECT.** Use `getMatchHistory()` (own match-by-match), `getAthleteStatsRpc()` (single athlete, `get_athlete_stats` SECURITY DEFINER), or `getAthletesStatsRpc()` (batch, leaderboard/swipe).

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

### Weight units unresolved
`athletes.current_weight` spec says kg; `challenges` spec says lbs. Both apps currently treat the join-wizard weight input as lbs (50-400). Verify against the BE before relying on units.

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

- **Two-tier presence:** `app:online` (every authenticated active athlete with the app open, drives green dots) vs `lobby:online` (only athletes with `looking_for_casual` OR `looking_for_ranked`, matchmaking, web only). Same `useOnlineStatus(athleteId)` API on both platforms.
- **Web** uses an external store via `useSyncExternalStore`. **Mobile is AppState-aware:** subscribe on foreground, untrack on background to avoid phantom presence.
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

- **Hidden, preserved routes redirect to `/`, do NOT "fix" or wire them up:** `/arena`, `/arena/swipe`, `/match/pending`, `/match/lobby/[id]`, `/match/[id]/live`, `/match/[id]/results`, `/athlete/[id]/challenges`, `/messages`, `/messages/[id]`. Chat is feature-flagged off (no nav entry); code is preserved.
- Active route set is the filesystem under `apps/web/app/` and `apps/mobile/app/`. Bottom nav: Home, Gyms, Rankings, Profile.
- The challenge inbox, head-to-head challenge button, and chat are not yet built on mobile (toast placeholders or hidden).

## Mobile Specifics

- **Routing:** file-based under `apps/mobile/app/`. `(app)/` is a Stack; inside it `(tabs)/` is the 4-tab navigator; `athlete/[id]`, `session/[id]`, `settings` push on top.
- **Theming:** `apps/mobile/tailwind.config.js` declares semantic tokens as CSS vars; `<ThemeProvider>` applies `vars()` overrides from `apps/mobile/lib/tokens.ts` by system color scheme.
- **Match-flow state machine (8 steps):** `wait, weight, ready, live, end, result, confirm, summary`, driven by `apps/mobile/lib/match-flow/step-router.ts`. The live step mounts the camera overlay, keeps awake, fires haptics, and auto-stops recording on end. Recording is best-effort; permission-denied users still progress.
- **Video:** web records WebM via `MediaRecorder`; mobile records MP4 via `expo-camera`, streamed via `FileSystem.uploadAsync` (BINARY_CONTENT, no base64) to the `match-videos` bucket at `matches/{matchId}/{timestamp}.mp4`.
- **Deep linking:** scheme `elorated://`; universal links on `elorated.com` (`/athlete/*`, `/session/*`, `/gyms/*`). Parser: `apps/mobile/lib/deep-links/handler.ts`.
- **Error tracking:** Sentry SDK is wired in code via `apps/mobile/lib/error-tracking/sentry.ts` (guarded on `EXPO_PUBLIC_SENTRY_DSN`) and forwarded from the error boundary. The `app.json` Sentry config plugin still needs a real org/project before the first EAS build.
- **Feature flags:** web has frontend constants (`apps/web/lib/feature-flags.ts`, `getFlag()`) plus a backend `feature_flags` table. Mobile has no flag layer yet; add a shared module under `@jits/shared/constants` if a cross-platform runtime toggle is needed.

## Workflow

### Pre-commit quality gates
The Husky `pre-commit` hook runs `typecheck` + `test` across workspaces automatically; do not commit on failure.
- **Always:** `npm run typecheck` (all workspaces) and `npm run test`.
- **Web changes to routes/layouts/auth/multi-file refactors:** also `npm run build:web` and `cd apps/web && npm run test:e2e` (Playwright).
- **Mobile changes to native modules / `app.json` / metro config:** also `cd apps/mobile && npx expo export --platform ios --no-bytecode` (catches metro/resolution errors `tsc` misses).

### Type generation
After every backend migration, run `npm run db:types` from the repo root (regenerates `packages/shared/src/types/database.ts` from the local Supabase instance in the BE repo). Both apps pick it up automatically.

### Changelog
Always update `CHANGELOG.md` under `## [Unreleased]`, organized by area with `**Added** / **Changed** / **Fixed** / **Removed**`. Include file paths for new files; be concise but specific.

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
