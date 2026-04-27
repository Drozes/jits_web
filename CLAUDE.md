# CLAUDE.md, JITS Development Principles

## Project Overview

JITS is a BJJ competitor matchmaking app. The repo is an npm-workspaces monorepo with two apps and one shared package:

- `apps/web/` (`@jits/web`), Next.js 16 App Router + Tailwind + shadcn/ui.
- `apps/mobile/` (`@jits/mobile`), Expo SDK 54 + Expo Router + NativeWind v4 + native UI primitives.
- `packages/shared/` (`@jits/shared`), the cross-platform data layer: queries, mutations, error types, constants, pure utilities, generated DB types, and platform-agnostic React hooks.

Both apps consume `@jits/shared` for all Supabase reads, writes, and realtime subscriptions. The backend lives in a separate repo.

**Backend repo:** `/Users/msponagle/code/experiments/jr_be/`
- Supabase migrations in `supabase/migrations/`.
- DB tests in `supabase/tests/`.
- Feature specs in `specs/`.
- Read the BE repo's `README.md` and migrations when you need to understand the database schema, RLS policies, or business rules.

**Status:** Phase 1 through 5 shipped on 2026-04-27. Web is in active beta. Mobile is feature-complete for the beta scope (auth, dashboard, gyms, leaderboard, sessions, live match flow with video, push, presence, deep links, offline handling, Sentry) and ready for an EAS preview build pending the manual checklist in `STORE_LISTING.md`.

## Architecture

### Workspaces

```
/                                root package.json + tsconfig.base.json + .husky/pre-commit
  apps/web/                      Next.js 16 frontend (web app)
  apps/mobile/                   Expo SDK 54 (iOS + Android)
  packages/shared/               @jits/shared, cross-platform data layer
  research/                      research docs and integration briefs
  specs/                         feature specs
  CHANGELOG.md, CLAUDE.md, README.md, DESIGN.md
  STORE_LISTING.md, PRIVACY_POLICY.md, TERMS.md   (Phase 5 B2 launch docs)
```

Path aliases (configured in `apps/web/tsconfig.json` and `apps/mobile/tsconfig.json`):
- `@/*`, points at the consuming app's root.
- `@jits/shared`, points at `packages/shared/src`.
- `@jits/shared/*`, points at any subpath exported from the package.

The shared package is consumed by source (`"main": "src/index.ts"`), no build step. Both apps include `../../packages/shared/src/**/*.ts` in their `tsconfig.json` `include` array so type checks cross workspaces.

### Shared package (`@jits/shared`)

Public exports (see `packages/shared/package.json#exports`):
- `@jits/shared`, the umbrella re-export.
- `@jits/shared/api`, all queries, mutations, errors, chat queries/mutations.
- `@jits/shared/api/queries`, `@jits/shared/api/mutations`, `@jits/shared/api/errors`, `@jits/shared/api/chat-queries`, `@jits/shared/api/chat-mutations`.
- `@jits/shared/constants`.
- `@jits/shared/hooks`, the umbrella hooks export.
- `@jits/shared/hooks/<name>`, individual hook subpaths.
- `@jits/shared/types/<name>`, individual type modules (`athlete`, `challenge`, `gym`, `match`, `session`, `database`, etc.).
- `@jits/shared/utils`, pure utilities (`getInitials`, `extractGymName`, `formatRelativeDate`, `formatRelativeTime`, `TOS_TEXT`).

Source layout (`packages/shared/src/`):
```
api/
  queries.ts          server-side Supabase reads + RPCs
  mutations.ts        client-side Supabase writes + RPCs
  errors.ts           DomainError, Result<T>, mapPostgrestError, mapRpcError
  chat-queries.ts     conversation + message reads
  chat-mutations.ts   conversation + message writes
  index.ts            re-exports
constants.ts          ELO_K_FACTOR, weight buckets, UI constants
hooks/
  use-session-match-timer.ts
  use-session-match-sync.ts
  use-match-sync.ts
  use-lobby-sync.ts
  use-pending-challenges.ts
  use-global-notifications.ts
  index.ts
types/
  database.ts         GENERATED via npm run db:types
  athlete.ts, challenge.ts, gym.ts, match.ts, session.ts, message.ts, ...
utils/
  shared.ts           getInitials, extractGymName, formatRelativeDate, formatRelativeTime
  tos-content.ts      TOS_TEXT (used by both web and mobile setup wizards)
  index.ts
index.ts              umbrella re-export
```

All shared hooks accept the Supabase client as a parameter so the same code runs on web and React Native. Platform-specific behavior is parameterized via callbacks (`onMatchStarted`, `notify`, `getCurrentRoute`, `onUnreadRefresh`, `buildMessageHref`, `buildLobbyHref`).

### Web app (`apps/web/`)

- **Framework:** Next.js 16 App Router with `cacheComponents` enabled.
- **Auth/DB:** Supabase server client for RSC; browser client for client components.
- **Styling:** Tailwind CSS + shadcn/ui.
- **Guards:** `requireAuth()` -> `requireAthlete()` -> `requireSessionParticipant(sessionId)`, progressive auth checks in `apps/web/lib/guards.ts`. The athlete guard uses `getCurrentAthlete()` from `@jits/shared/api/queries` so web and mobile share one source of truth.

Directory structure:

```
apps/web/
  app/
    (app)/            authenticated routes (layout with nav shell)
    (auth)/           login, signup, forgot-password, update-password
    api/version       deployment-version probe endpoint
    auth/callback     Supabase auth callback
    profile/setup     activation wizard (multi-step)
  components/
    domain/           business components (athlete-card, match-card, ...)
    layout/           shell components (app-header, bottom-nav-bar, page-container)
    profile/          profile-specific components
    ui/               shadcn/ui primitives, DO NOT edit manually
    auth-button.tsx, login-form.tsx, sign-up-form.tsx, ... (auth at root for now)
  hooks/              web-only hooks (chat, presence, recorder, deployment-check)
  lib/
    feature-flags.ts  frontend feature flags (timekeeperEnabled)
    guards.ts         auth guard functions
    utils.ts          web-only helpers (cn, hasEnvVars, getEloTierClass, getProfilePhotoUrl)
    supabase/         server.ts, client.ts
    notifications.tsx sonner toast helpers
  proxy.ts            Next.js 16 middleware (auth session refresh)
  e2e/                Playwright tests
  demo/               Playwright-driven demo recorder
```

### Mobile app (`apps/mobile/`)

- **Framework:** Expo SDK 54, Expo Router (file-based routing), React Native 0.81, React 19.1.
- **Styling:** NativeWind v4 (Tailwind classes on RN) + class-variance-authority. Dark mode via `vars()` overrides driven by system color scheme (see `apps/mobile/lib/theme/`).
- **Auth/DB:** `@supabase/supabase-js` configured with `expo-secure-store` for token persistence (`apps/mobile/lib/supabase/secure-storage.ts`). Realtime configured with `heartbeatIntervalMs: 15_000` and no Web Worker.
- **Guards:** Client-side hooks `useAuth`, `useRequireAuth`, `useRequireAthlete` in `apps/mobile/lib/auth/hooks.ts`; backed by `<AuthProvider>` Context in `apps/mobile/lib/auth/auth-context.tsx`.

Directory structure:

```
apps/mobile/
  app/                              Expo Router routes
    _layout.tsx                     root layout: ErrorBoundary, ThemeProvider,
                                    AuthProvider, OfflineBanner, deep links,
                                    push registration, online presence, Sentry
    index.tsx                       auth-aware root redirect
    profile-setup.tsx               multi-step activation wizard
    (auth)/                         login, signup, forgot-password
    (app)/
      _layout.tsx                   tab bar (Home, Gyms, Rankings, Profile)
      (home)/                       dashboard
      gyms/                         list + detail
      leaderboard/                  fighters + gyms tabs with gender filter
      profile/                      profile + stats
      athlete/[id].tsx              competitor profile
      session/[id]/
        join.tsx                    4-step join wizard
        lobby.tsx                   realtime lobby
        match/[matchId].tsx         8-step live match wizard
      settings/                     index, feedback, help, video, realtime-test (dev only)
  assets/                           branded icons + splash (rendered from logo.svg)
  components/
    ui/                             native primitives (avatar, badge with success
                                    variant, button, card, dialog, input, label,
                                    select, separator, sheet, switch, tabs, toast)
    auth/                           auth-form-field
    dashboard/                      stat-overview, active-session-card, recent-activity-section
    profile/                        profile-header, profile-quick-stats
    profile-setup/                  setup-wizard, wizard-progress, *-step
    gyms/                           gym-card
    session/
      join-wizard.tsx, wizard-progress.tsx
      wizard/                       geo-step, waiver-step, weight-step, confirm-step
      lobby/                        lobby-header, leave-button, participant-row,
                                    challenge-action-sheet
    match-flow/
      match-flow-wizard.tsx, wizard-status.tsx
      camera-overlay.tsx, upload-progress-banner.tsx
      steps/                        wait, weight, ready, live (+controls, timer-display,
                                    ready-panel), end, result (+fields, submission-fields),
                                    confirm (+panels), summary, dispute-form
    notifications/                  notification-bell, notification-panel
    error-boundary.tsx, offline-banner.tsx, online-indicator.tsx
    athlete-card.tsx, elo-badge.tsx, match-card.tsx, session-card.tsx,
    share-profile-sheet.tsx, compare-stats-modal.tsx
  hooks/
    use-unread-count.ts             AppState-aware unread polling
  lib/
    auth/                           auth-context, hooks
    supabase/                       client, secure-storage
    theme/                          theme-provider, use-theme, index (vars() + dark mode)
    tokens.ts                       light/dark color token maps mirroring web
    cn.ts                           clsx + tailwind-merge
    env.ts                          typed EXPO_PUBLIC_* env access
    profile-setup/                  validation, use-setup-data, use-setup-submit
    session/                        distance-from-gym, validate-weight,
                                    use-session-for-join, use-session-lobby,
                                    use-session-lobby-realtime
    match-flow/                     format-elapsed, parse-finish-time, step-router,
                                    use-haptics, use-keep-awake, use-live-controls,
                                    use-match-completion, use-match-details,
                                    use-record-result
    location/                       use-location (expo-location + haversineKm)
    network/                        use-network-status, mutation-queue
    notifications/                  register-push, handlers,
                                    push-registration-bootstrap
    presence/                       use-online-presence (AppState-aware),
                                    online-presence-bootstrap
    deep-links/                     handler (jits:// + universal links)
    video/                          use-video-recorder (expo-camera),
                                    upload-recording (FileSystem.uploadAsync)
    error-tracking/                 sentry-init
  app.json, eas.json, metro.config.js, babel.config.js, tailwind.config.js, global.css
  .env.example                      EXPO_PUBLIC_SUPABASE_URL, _ANON_KEY, _SENTRY_DSN
```

### Naming Conventions

- **Files:** kebab-case (`athlete-card.tsx`, `match-card.tsx`).
- **Components:** PascalCase (`AthleteCard`, `MatchCard`).
- **Types:** PascalCase (`Athlete`, `AthleteInsert`).

## Code Quality Principles

### 1. Keep Components Short

- **Target: under 80 lines per component.** If a component exceeds this, split it.
- Server data-fetching components on web can stretch to 120 lines but no further.
- On mobile, fetch hooks live in `apps/mobile/lib/<area>/use-*.ts` and screens orchestrate them; aim to keep screens under 200 lines.
- Extract sub-components into the same file or sibling files.

### 2. Don't Duplicate Logic

When you see the same logic in 2+ files, extract it. Before writing a new helper, check if one already exists.

- Pure helpers used by both apps go in `packages/shared/src/utils/`.
- Web-only helpers (uses `process.env.NEXT_PUBLIC_*`, DOM, or Tailwind class merging) go in `apps/web/lib/utils.ts`.
- Mobile-only helpers (uses `expo-*`, RN APIs) go in `apps/mobile/lib/<area>/`.
- New data-access functions go in `packages/shared/src/api/queries.ts` or `mutations.ts`.

**Already extracted to `@jits/shared/utils`:** `getInitials()`, `extractGymName()`, `formatRelativeDate()`, `formatRelativeTime()`, `TOS_TEXT`.

### 3. Supabase FK Join Behavior

**Unaliased** FK joins like `athletes!fk_name(col)` return `T[]`. Access with `[0]`:
```ts
const gymsArr = a.gyms as { name: string }[] | null;
const gymName = gymsArr?.[0]?.name ?? null;
```

**Aliased** FK joins like `challenger:athletes!fk(col)` return `T` directly, no `[0]` needed:
```ts
const challenger = data.challenger; // already a single object
```

**To-one FK joins** (many-to-one, e.g. `gyms!fk_athletes_primary_gym(name)`) return `T | null`. Supabase generated types may infer `T[]`; cast through `unknown` and use `extractGymName()`. To-many joins (FK points to the source) return `T[]`.

### 4. Stats Are Computed, Not Stored

The `athletes` table has no `wins`, `losses`, `win_streak`, or `belt_rank` columns. Stats are computed from RPCs. **Do not query `match_participants` directly**, RLS blocks SELECT. Use `getMatchHistory()` for own match-by-match data, `getAthleteStatsRpc()` for any single athlete (uses `get_athlete_stats`, SECURITY DEFINER), or `getAthletesStatsRpc()` for batch (leaderboard/swipe).

### 5. Async Boundaries: Web Uses Suspense, Mobile Uses Effect + Cancellation

**Web (Next.js 16 with `cacheComponents`):** all async data-fetching server components must be wrapped in `<Suspense>`. `export const dynamic` is NOT compatible with `cacheComponents`.

```tsx
// page.tsx, synchronous, wraps content in Suspense
export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content />
    </Suspense>
  );
}

// content.tsx, async, does data fetching
async function Content() {
  const data = await fetchData();
  return <div>{data}</div>;
}
```

**Mobile:** screens are client components. Fetch via a `useEffect` + cancellation flag inside a hook (see `apps/mobile/lib/match-flow/use-match-details.ts` and `apps/mobile/lib/session/use-session-for-join.ts` for the canonical pattern). State writes are gated on a local `cancelled` ref so unmount during a slow fetch never trips React.

### 6. Dynamic Route Params

**Web (Next.js 16):** `params` is a `Promise`. Await it inside the Suspense boundary, not in the page component:
```tsx
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Content paramsPromise={params} />
    </Suspense>
  );
}
```

**Mobile (Expo Router):** params come from `useLocalSearchParams()` and are synchronous strings.

### 7. Client vs Server Components

- **Web:** default to server components. Client components must have `"use client"` at the top. Never fetch Supabase data in client components for initial loads, fetch server-side and pass as props.
- **Mobile:** all components are "client" (RN has no RSC). Use `<AuthProvider>` for auth state, hooks for data fetching, and shared queries from `@jits/shared/api/queries` (which work on both sides).

### 8. Props Design

When passing 4+ related fields about the same entity, group them into an object prop. New components should follow this pattern. Existing components using granular props are tech debt, refactor when touched.

### 9. Color Tokens for Stats

Use these consistently across all stat displays on both platforms:
- **Wins/positive:** `text-success` (inline text) or `bg-success text-success-foreground` (badges).
- **Losses/negative:** `text-destructive` (inline text) or `bg-destructive text-destructive-foreground` (badges).
- **Draws/pressure:** `text-amber-500`.
- **ELO/neutral stats:** default foreground color with `tabular-nums` (NOT `text-primary`, that is brand red).
- **Brand accent:** `text-primary`, reserved for branding, buttons, and section header icons. Never for data values.

**Theme token:** `--success` (`hsl(145 63% 37%)` light / `hsl(145 63% 49%)` dark) is available as `bg-success`, `text-success`, and Badge `variant="success"`. Mobile mirrors the same tokens via `apps/mobile/lib/tokens.ts`. Light-mode lightness is tuned to pass WCAG AA on `--background`.

### 10. MatchCard Shows Match Type

`MatchCard` accepts an optional `matchType` prop (`"ranked" | "casual"`). When provided, it displays "Ranked" or "Casual" inline with the date (e.g., "2d ago, Ranked"). Pass `matchType` on both `type="match"` and `type="challenge"` cards. Active call sites: dashboard recent matches, match history, head-to-head. Hidden call sites (challenge flow): received challenges, sent challenges. Mobile mirrors the API in `apps/mobile/components/match-card.tsx`.

### 11. Avoid Premature Abstraction

Don't create abstractions for things used once. Don't add error handling for impossible states. Beta phase: ship fast, refactor when real patterns emerge. The threshold for extraction is 2+ usages across files (see Principle 2).

## Pre-Commit Quality Checks

Before every commit, run these checks and fix any failures.

**Always:**
1. **TypeScript (all workspaces):** `npm run typecheck`. Individual: `npm run typecheck:web`, `npm run typecheck:mobile`, `npm run typecheck:shared`.
2. **Unit tests (workspaces with tests):** `npm run test` (runs `npm run test --workspaces --if-present`). Web has Vitest; mobile and shared have no tests yet.

**For web changes that touch routes, layouts, auth, or multi-file refactors:**

3. **Build:** `npm run build:web` (runs `next build` inside `apps/web/`).
4. **E2E:** `cd apps/web && npm run test:e2e` (Playwright).

**For mobile changes that touch native modules, app.json, or the Metro config:**

5. **Bundle smoke test:** `cd apps/mobile && npx expo export --platform ios --no-bytecode`. This catches metro/resolution errors that `tsc` misses.

The repo's Husky `pre-commit` hook runs `typecheck --workspaces --if-present` and `test --workspaces --if-present` automatically. Do not commit if any check fails.

### Changelog

**Always update `CHANGELOG.md`** when committing changes. Add entries under `## [Unreleased]` at the top, organized by feature area with `**Added**`, `**Changed**`, `**Fixed**`, and `**Removed**` subsections. Include file paths for new files. Keep entries concise but specific enough to understand what changed and why.

## UI Kit Maintenance

### Web shadcn/ui (`apps/web/components/ui/`)

- **Never edit these files manually.** They are managed by `npx shadcn@latest add <component>`.
- To customize, use Tailwind classes in the consuming component or extend via `cn()`.
- Currently installed: `avatar`, `badge`, `button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `separator`, `sheet`, `sonner`, `switch`, `tabs`.
- **Exception:** `badge.tsx` has a custom `success` variant (green bg for win badges). Preserve this when regenerating.

### Mobile native primitives (`apps/mobile/components/ui/`)

Hand-written RN primitives whose API mirrors shadcn/ui where reasonable. NativeWind v4 + class-variance-authority. The library is small and intentional, edit it directly when needed.

Currently shipped (13 primitives): `avatar`, `badge` (with custom `success` variant), `button`, `card`, `dialog`, `input`, `label`, `select`, `separator`, `sheet` (gorhom bottom sheet), `switch`, `tabs`, `toast` (react-native-toast-message).

### Web Domain Components (`apps/web/components/domain/`)

Custom business components. Each should:
- Have a clear, typed props interface.
- Be under 80 lines.
- Use CVA for variant-based styling when there are visual variants (see `elo-badge.tsx`).
- Not duplicate logic that belongs in `@jits/shared/utils`.

### Mobile Domain Components

Mobile uses topical directories under `apps/mobile/components/` (`dashboard/`, `profile/`, `gyms/`, `session/`, `match-flow/`, `notifications/`) instead of a single `domain/` directory. A handful of widely-used cards live at the components root (`athlete-card.tsx`, `elo-badge.tsx`, `match-card.tsx`, `session-card.tsx`, `share-profile-sheet.tsx`, `compare-stats-modal.tsx`).

### Layout Shell

**Web (`apps/web/components/layout/`):**
- `app-header.tsx`, top bar with title, back button, optional actions.
- `bottom-nav-bar.tsx`, tab navigation (Home, Gyms, Rankings, Profile).
- `page-container.tsx`, content wrapper with consistent padding.
- `global-notifications-provider.tsx`, mounts realtime message listener (renders null).
- `online-presence-bootstrap.tsx`, mounts `app:online` Presence channel (renders null).
- `lobby-presence-bootstrap.tsx`, mounts `lobby:online` Presence channel.
- `push-registration-bootstrap.tsx`, registers Web Push.
- `deployment-check-bootstrap.tsx`, polls `/api/version` and prompts on new deploy.

**Mobile (`apps/mobile/app/_layout.tsx` mounts these, no dedicated `layout/` directory):**
- `<ErrorBoundary>` (`apps/mobile/components/error-boundary.tsx`), root error boundary with retry + sign-out, forwards to Sentry.
- `<ThemeProvider>` (`apps/mobile/lib/theme/theme-provider.tsx`).
- `<AuthProvider>` (`apps/mobile/lib/auth/auth-context.tsx`).
- `<OfflineBanner>` (`apps/mobile/components/offline-banner.tsx`).
- `<PushRegistrationBootstrap>` (`apps/mobile/lib/notifications/push-registration-bootstrap.tsx`).
- `<OnlinePresenceBootstrap>` (`apps/mobile/lib/presence/online-presence-bootstrap.tsx`).
- Deep link handler (`apps/mobile/lib/deep-links/handler.ts`) wired in `_layout.tsx`.
- The tab bar lives in `apps/mobile/app/(app)/_layout.tsx` and uses `lucide-react-native` icons with `useThemedTokens()`.

## Known Tech Debt (Priority Order)

**High (functional issues):** none open.

**Medium (Phase 5 deferred items):**
- [ ] `apps/mobile/lib/network/mutation-queue.ts` exists but is not yet wired into the match-flow record/confirm calls. Once a user records a result offline, replay on reconnect should run automatically.
- [ ] Universal-link verification needs hosted Apple App Site Association and Android `assetlinks.json` files at `https://jits.app/.well-known/`. App-side intent filters are already declared in `apps/mobile/app.json`.
- [ ] `@sentry/react-native` config plugin is registered but `org`/`project` are not set in `apps/mobile/app.json`; source maps will not upload until a real Sentry project exists.
- [ ] `react@19.1.0` (mobile) vs `react@19.2.5` (web) version drift, pre-existing, not yet causing observable issues. Resolve when bumping web to 19.2 alignment is convenient.
- [ ] `apps/mobile/app.json` placeholders: `extra.eas.projectId`, `updates.url` (project ID), `ios.bundleIdentifier`, `android.package`. Replace before the first preview build (see `STORE_LISTING.md`).

**Low (code-style cleanup):**
- [ ] Auth form components on web (`login-form`, `sign-up-form`, `forgot-password-form`) share ~70% identical code.
- [ ] 20 non-shadcn web components exceed 80-line target. Active components over target: `login-form` 186, `sign-up-form` 169, `profile-photo-upload` 165, `recent-activity-section` 155, `match-card` 108, `forgot-password-form` 105.
- [ ] 5 web components have props that should be grouped into objects (`message-bubble`, `chat-thread`, `lobby-actions`, `arena-content`, `looking-for-match-toggle`).

## Chat UI Patterns (web)

Chat is a hidden feature (no entry point in nav). Code is preserved.

### Message Grouping

Consecutive messages from the same sender within 2 minutes are grouped. Pass `isFirstInGroup` / `isLastInGroup` booleans to `MessageBubble`. Effects:
- **Spacing:** 0.5 gap within groups, 12px gap between groups.
- **Border radius:** corners flatten where messages connect (e.g., `rounded-tr-md` on non-first own messages).
- **Timestamps:** only on the last message in a group.
- **Avatars:** only on the last message in a group (bottom-aligned).
- **Sender names:** only on the first message in a group (group chats only).

### Thread Participant Data

The thread page fetches all participant profiles server-side into a `Record<string, ParticipantInfo>` map keyed by athlete ID. This map is passed to `ChatThread` -> `MessageList` -> `MessageBubble` for avatar/name rendering. No per-message queries needed.

### Date Separators

`DateSeparator` renders "Today", "Yesterday", weekday names (< 7 days), or "Mon DD" with horizontal rules. Inserted in `MessageList` when the day changes between messages.

Mobile chat is not yet implemented.

## Key FK Join Names

```
Athletes -> Gyms:                 gyms!fk_athletes_primary_gym(name)
Match participants -> Athletes:   athletes!fk_participants_athlete(display_name)
Challenges -> Challenger:         athletes!fk_challenges_challenger(display_name)
Matches -> Participants:          matches!fk_participants_match(completed_at, status)
Sessions -> Gyms:                 gyms!fk_sessions_gym(name, city, latitude, longitude)
Session participants -> Athletes: athletes!fk_session_participants_athlete(display_name, current_elo, current_weight)
```

## Data Access Layer (`@jits/shared/api`)

Typed wrappers for all Supabase queries and mutations. Both apps must use these instead of raw `.from()` / `.rpc()` calls. The exhaustive list lives at the source; the inventory below is a current snapshot.

### Queries (`packages/shared/src/api/queries.ts`)

**Auth/profile:**
- `ATHLETE_GUARD_SELECT` (constant, the column list used by both web `requireAthlete()` and mobile `<AuthProvider>`).
- `getCurrentAthlete(supabase, authUserId)`.

**Dashboard & profile:**
- `getDashboardSummary(supabase)`.
- `getArenaData(supabase)` (used by hidden `/arena` web route).
- `getAthleteStatsRpc(supabase, athleteId)`.
- `getAthletesStatsRpc(supabase, athleteIds)`.
- `getMatchHistory(supabase, athleteId)`.
- `getEloHistory(supabase, athleteId)`.

**Challenges (hidden on web, not yet wired on mobile):**
- `getEloStakes(supabase, ...)`.
- `canCreateChallenge(supabase, opponentId?)`.
- `getLobbyData(supabase, challengeId)`.
- `getChallengesBetween(supabase, ...)`.
- `getPendingChallengeBetween(supabase, ...)`.
- `getPendingChallengeOpponentIds(supabase, athleteId)`.

**Sessions & gyms:**
- `getActiveSession(supabase, athleteId)` (returns `isCheckedIn`).
- `getGymsWithSessions(supabase)`.
- `getGymDetail(supabase, gymId)`.
- `getSessionForJoin(supabase, sessionId)`.
- `getSessionLobbyData(supabase, sessionId)`.

**Match:**
- `getMatchDetails(supabase, matchId)`.
- `getSubmissionTypes(supabase)`.

### Mutations (`packages/shared/src/api/mutations.ts`)

**Challenges:** `createChallenge`, `acceptChallenge`, `declineChallenge`, `cancelChallenge`, `startMatchFromChallenge`.

**Sessions:** `rsvpToSession`, `cancelRsvp`, `joinSessionLobby`, `acceptSessionWaiver`, `createSession`, `createInSessionMatch`, `leaveSessionLobby`, `requestRandomMatch`.

**Match lifecycle:** `startMatch`, `pauseMatch`, `resumeMatch`, `endMatch`, `recordMatchResult`, `confirmMatchResult`, `disputeMatchResult`.

**Preferences & notifications:** `toggleMatchPreferences`, `registerPushDevice`, `removePushDevice`, `getNotificationPreferences`, `updateNotificationPreferences`.

### Chat (`@jits/shared/api/chat-queries`, `@jits/shared/api/chat-mutations`)

`getConversations`, `getUnreadCounts`, `getMessages`, `createDirectConversation`, `markConversationRead`, `sendMessage`. Used by the hidden chat surface on web.

### Error handling (`packages/shared/src/api/errors.ts`)

All mutations return `Result<T> = { ok: true, data: T } | { ok: false, error: DomainError }`. Domain error codes include: `MAX_PENDING_CHALLENGES`, `OPPONENT_INACTIVE`, `MATCH_NOT_IN_PROGRESS`, `NOT_PARTICIPANT`, `SESSION_NOT_FOUND`, `SESSION_FULL`, `ALREADY_JOINED`, `SESSION_NOT_ACTIVE`, `WAIVER_REQUIRED`, `MATCH_NOT_PAUSED`, `ALREADY_CONFIRMED`, `ALREADY_DISPUTED`, `RLS_VIOLATION`, `UNKNOWN`. Helpers: `mapPostgrestError`, `mapRpcError`.

## Realtime & Presence

### Two-Tier Presence Model (Supabase Presence API)

The app uses two Presence channels to distinguish general online status from lobby matchmaking:

| Channel | Who Joins | Purpose |
|---------|-----------|---------|
| `app:online` | Every authenticated active athlete with the app open | Online indicators (green dots) |
| `lobby:online` | Athletes with `looking_for_casual=true` OR `looking_for_ranked=true` | Matchmaking lobby (web only) |

**Web pattern:** external store via `useSyncExternalStore`. `apps/web/hooks/use-online-presence.ts` exposes `useOnlineStatus(athleteId)`. `apps/web/components/layout/online-presence-bootstrap.tsx` mounts the channel.

**Mobile pattern:** AppState-aware. `apps/mobile/lib/presence/use-online-presence.ts` subscribes only when foreground; untracks on background to avoid phantom presence. Same `useOnlineStatus(athleteId)` API. Bootstrap is `apps/mobile/lib/presence/online-presence-bootstrap.tsx`.

### Shared realtime hooks (`@jits/shared/hooks`)

Six platform-agnostic hooks. Each accepts the Supabase client + platform-specific callbacks so the same code runs on web and React Native.

- `use-session-match-timer`, timer with pause/resume awareness.
- `use-session-match-sync`, broadcast for 7 match events (timer, ready, result, confirm).
- `use-match-sync`, legacy challenge-match sync (hidden flow).
- `use-lobby-sync`, challenge-lobby sync; takes `onMatchStarted` callback.
- `use-pending-challenges`, challenge INSERT/UPDATE -> bell badge.
- `use-global-notifications`, global message listener; takes `notify`, `getCurrentRoute`, `onUnreadRefresh`, `buildMessageHref`, `buildLobbyHref` callbacks.

### Web-only realtime hooks (`apps/web/hooks/`)

- `use-chat-channel`, per-conversation messages + typing (broadcast).
- `use-chat-messages`, paginated message history.
- `use-online-presence`, web-side `app:online` channel.
- `use-lobby-presence`, `lobby:online` channel.
- `use-session-lobby-realtime`, postgres_changes + broadcast for session lobby.
- `use-unread-count`, polling (30s) + manual refresh via window event.
- `use-push-registration`, Web Push subscription.
- `use-video-recorder`, `MediaRecorder` + Supabase Storage upload (WebM).
- `use-deployment-check`, polls `/api/version`.

### Mobile-only realtime / native hooks

- `apps/mobile/lib/session/use-session-lobby-realtime.ts`, mobile equivalent of web's session lobby realtime.
- `apps/mobile/hooks/use-unread-count.ts`, AppState-aware unread polling (30s + foreground refresh).
- `apps/mobile/lib/video/use-video-recorder.ts`, `expo-camera` recorder (MP4) with streaming upload.

### Supabase client realtime config

- **Web (`apps/web/lib/supabase/client.ts`):** `heartbeatIntervalMs: 15_000`, `worker: true` (Web Worker for background tab support, critical for mobile PWA).
- **Mobile (`apps/mobile/lib/supabase/client.ts`):** `heartbeatIntervalMs: 15_000`, no Web Worker; uses `expo-secure-store` adapter for token persistence.

## Feature Flags

Two-tier system:
- **Frontend flags** (`apps/web/lib/feature-flags.ts`): hardcoded constants for UI toggles. Use `getFlag("flagName")`. Currently: `timekeeperEnabled` (false). The earlier `messagesEnabled` flag was removed as dead code (see CHANGELOG 2026-04-23).
- **Backend flags** (`feature_flags` table): database-controlled flags for backend features (e.g. `timekeeper_role`).

Mobile does not yet have a feature-flag layer; gate-by-`__DEV__` is used for the realtime smoke test. Add a shared flag module under `@jits/shared/constants` if a runtime toggle is needed on both sides.

## Hidden Routes (Session Transition)

These web routes redirect to `/` during the session-based transition. Code is preserved, not deleted.
- `/arena`, `/arena/swipe` (replaced by Gyms + Sessions).
- `/match/pending`, `/match/lobby/[id]` (challenge-based flow, replaced by session match flow).
- `/match/[id]/live`, `/match/[id]/results` (redirect if not participant; old challenge flow is unreachable).
- `/athlete/[id]/challenges`.
- `/messages`, `/messages/[id]` (chat is feature-flagged off).

Dashboard challenges section also removed.

**Active web routes (session-based model):**
- `/` (dashboard).
- `/gyms`, `/gyms/[id]`.
- `/session/[id]/join` (4-step join wizard: geo, waiver, weight, confirm).
- `/session/[id]/lobby` (realtime participant list, challenges, random match).
- `/session/[id]/match/[matchId]` (8-step match wizard: wait, weight, ready, live, end, result, confirm, summary).
- `/leaderboard`.
- `/profile`, `/profile/stats`, `/profile/setup`.
- `/settings`, `/settings/video`, `/settings/feedback`, `/settings/help`.
- `/athlete/[id]`.

Bottom nav: Home, Gyms, Rankings, Profile.

Mobile mirrors the active route set: see `apps/mobile/app/`. The challenge inbox, head-to-head challenge button, and chat are not yet built on mobile; they show toast placeholders or are hidden.

## Type Generation

Run `npm run db:types` from the repo root to regenerate `packages/shared/src/types/database.ts` from the local Supabase instance in the backend repo. The script is `cd ../jr_be && supabase gen types typescript --local > ../jits_web/packages/shared/src/types/database.ts`. Run after every backend migration. Both apps consume the regenerated types automatically since they `include` the shared sources in their tsconfig.

## Backend Integration

**Full reference:** [research/005-backend-reference.md](research/005-backend-reference.md).
**Integration brief:** [research/007-frontend-backend-integration-brief.md](research/007-frontend-backend-integration-brief.md).
**Backend integration guide:** `jr_be/FRONTEND_INTEGRATION_GUIDE.md` (covers presence, chat, challenges, matches).

Read these docs before building challenge, match, ELO, or presence features. Key points:

- **Athlete activation** requires `display_name` + `current_weight` + (`primary_gym_id` OR `free_agent = true`) + `gender` + `date_of_birth`.
- **Setup flow:** two-step wizard. Step 1: TOS acceptance (writes to `waiver_acknowledgements`). Step 2: profile fields (name, weight, gym, gender, DOB, city, theme).
- **Challenges:** INSERT with RLS validation; max 3 pending; opponent must be `active`.
- **Starting matches:** use `startMatchFromChallenge()` then `startMatch()`, never direct INSERT.
- **Recording results:** use `recordMatchResult()`, auto-calculates ELO for ranked matches.
- **ELO stakes preview:** use `getEloStakes()` for display before sending challenges; pass weights for weight-aware stakes.
- **Weight-aware ELO:** when both athletes have weights, heavier athletes get a phantom ELO offset (+50 per IBJJF division gap). Pass weights to `calculate_elo_stakes` for accurate preview. Show `weight_division_gap` when > 0.
- **Draws always cost ELO (Pressure Score):** both athletes lose ELO on draw. Show `challenger_draw` / `opponent_draw` in stakes UI (amber color). Equal match = harshest penalty.

### Frontend/Backend Discrepancies (Status)

1. ~~Activation trigger uses `primary_gym_id`, not `current_weight`~~, [x] setup includes gym picker + free agent path on both web and mobile.
2. **Weight units unclear**, `athletes.current_weight` spec says kg, `challenges` spec says lbs. Needs BE resolution. Both apps currently treat weight as lbs in the join wizard input (50-400 range).
3. ~~Challenge creation not implemented~~, [x] web ChallengeSheet uses `createChallenge()` mutation. Mobile challenge sheet is not yet built.
4. ~~No gym selection in setup~~, [x] both setup flows include a gym picker.
5. ~~Match flow not implemented~~, [x] session match wizard with 8-step state machine on both platforms.
6. ~~Challenge -> match flow bugs~~, [x] all 4 bugs fixed. See `specs/challenge-match-flow-fixes.md`.

## Mobile Architecture

This section captures details specific to `apps/mobile/`.

### Expo SDK 54 + Expo Router

Routes are file-based under `apps/mobile/app/`. The auth group `(auth)/` is reachable from `app/index.tsx`'s redirect logic; the app group `(app)/` mounts the tab bar. Dynamic segments use `[id].tsx` and `[matchId].tsx`. `expo-router/types` is included via `tsconfig.json` so route names are typed.

### NativeWind v4 Theming

`apps/mobile/tailwind.config.js` declares semantic tokens that resolve to CSS variables (`var(--background)`, `var(--foreground)`, etc.). Light values are declared on `:root` via an `addBase` plugin; `darkMode` is set to `"media"`. `<ThemeProvider>` (`apps/mobile/lib/theme/theme-provider.tsx`) applies `vars()` overrides from `apps/mobile/lib/tokens.ts` (`lightTokens` / `darkTokens`) to the root view based on system color scheme. Components that can't take a className (e.g. RN's `Switch`, gorhom's `BottomSheet`) read `useThemedTokens()` to pick the right runtime token map.

### Auth Foundation

- `apps/mobile/lib/supabase/client.ts`: Supabase client with `expo-secure-store`-backed storage adapter, RN URL polyfill, and 15s realtime heartbeat.
- `apps/mobile/lib/auth/auth-context.tsx`: `<AuthProvider>` exposing `user`, `session`, `athlete`, `isLoading`, `isAthleteActive`, `signIn`, `signUp`, `signOut`, `resetPassword`, `refreshAthlete`. Subscribes to `onAuthStateChange`, keeps the athlete row in sync via `getCurrentAthlete()` from `@jits/shared`. `resetPassword` passes `redirectTo: "jits://reset-password"` so the email lands inside the app via the deep-link handler.
- `apps/mobile/lib/auth/hooks.ts`: `useAuth`, `useRequireAuth`, `useRequireAthlete` guard hooks. `useRequireX` redirect via Expo Router `router.replace()`.
- `apps/mobile/app/index.tsx`: auth-aware root redirect, sends to `/login`, `/profile-setup`, or `/(app)/(home)` based on auth state.

### Workspace Integration

`apps/mobile/metro.config.js` uses `getDefaultConfig(projectRoot)` and lets Expo SDK 52+'s built-in monorepo support discover the workspace root and watch folders. **Do not** add manual `watchFolders`, `nodeModulesPaths`, or `disableHierarchicalLookup` overrides; they break resolution of nested transitive dependencies (this is what regressed Phase 5; see CHANGELOG note for `npx expo export` workspace hoisting fix).

### Match Flow State Machine (8 steps)

`apps/mobile/components/match-flow/match-flow-wizard.tsx` is a state machine driven by `apps/mobile/lib/match-flow/step-router.ts`. Steps: `wait`, `weight`, `ready`, `live`, `end`, `result`, `confirm`, `summary`. Live step mounts `<CameraOverlay />`, runs `useKeepAwake()`, fires `useHaptics()` on start/end/<= 10s warning, and auto-stops recording on local end or opponent broadcast. Recording is best-effort; permission-denied users still progress. See `apps/mobile/components/match-flow/steps/live-step.tsx` for the integration.

### Realtime + Presence (AppState-aware)

Mobile-specific realtime handling:
- `apps/mobile/lib/presence/use-online-presence.ts` subscribes on foreground and untracks on background (`AppState.addEventListener`) so a backgrounded device doesn't show as online.
- `apps/mobile/hooks/use-unread-count.ts` polls every 30s in foreground and refreshes on foreground transition.
- `apps/mobile/lib/session/use-session-lobby-realtime.ts` mirrors web's session lobby realtime via `postgres_changes` + broadcast.

### Video Recording

`apps/mobile/lib/video/use-video-recorder.ts` wraps `expo-camera`'s `CameraView` ref + `recordAsync`/`stopRecording` lifecycle, exposes a 6-state machine (`idle`/`recording`/`stopping`/`uploading`/`uploaded`/`error`), and retries failed uploads once. `apps/mobile/lib/video/upload-recording.ts` streams the local file URI to Supabase Storage's `match-videos` bucket via `FileSystem.uploadAsync` (BINARY_CONTENT, no base64 round-trip). Path: `matches/{matchId}/{timestamp}.mp4`. Web records WebM via `MediaRecorder`; mobile records MP4 via `expo-camera`.

### Push Notifications

- `apps/mobile/lib/notifications/register-push.ts` requests permission, fetches the Expo push token (requires a physical device), labels with `Device.osName` / `Device.modelName`, and calls shared `registerPushDevice`.
- `apps/mobile/lib/notifications/handlers.ts` configures foreground display behavior and routes taps via `router.push(payload.data.route)`.
- `apps/mobile/lib/notifications/push-registration-bootstrap.tsx` mounts inside `<AuthProvider>` to register on athlete login.

### Deep Linking

- App scheme: `jits://`.
- Universal links: `https://jits.app/athlete/*`, `https://jits.app/session/*` (declared in `apps/mobile/app.json` `ios.associatedDomains` + `android.intentFilters`).
- Parser: `apps/mobile/lib/deep-links/handler.ts` translates incoming URLs to Expo Router paths.

### Error Boundary + Sentry

- `apps/mobile/components/error-boundary.tsx` renders a fallback UI with retry + sign-out and forwards errors to Sentry via `captureError(error, { componentStack })`.
- `apps/mobile/lib/error-tracking/sentry-init.ts` initializes `@sentry/react-native` from `EXPO_PUBLIC_SENTRY_DSN`. No-op when DSN absent. Called from `apps/mobile/app/_layout.tsx` at module load.

### Mobile-only native dependencies (key list)

`@gorhom/bottom-sheet`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `@sentry/react-native`, `expo-camera`, `expo-constants`, `expo-device`, `expo-file-system`, `expo-haptics`, `expo-image`, `expo-image-picker`, `expo-keep-awake`, `expo-linking`, `expo-location`, `expo-notifications`, `expo-router`, `expo-secure-store`, `expo-status-bar`, `lucide-react-native`, `nativewind`, `react-native`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`, `react-native-toast-message`, `react-native-url-polyfill`. See `apps/mobile/package.json` for current versions.

## Build & Distribution

### EAS Build profiles (`apps/mobile/eas.json`)

- **`development`**, `developmentClient: true`, `distribution: "internal"`, iOS simulator enabled, channel `development`.
- **`preview`**, internal distribution, channel `preview`. Android builds APK; iOS uses `m-medium` resource class.
- **`production`**, channel `production`, `autoIncrement: true`, AAB on Android.

Channel names match profile names so EAS Update OTA targeting works without extra wiring.

### Pre-launch Checklist

`STORE_LISTING.md` is the source of truth. The 18-item checklist covers: Apple Developer + Play Console enrollment, real bundle identifiers, real EAS project ID, real `updates.url`, screenshots from a TestFlight build, Sentry org/project setup, hosted privacy + terms URLs, AASA + assetlinks files, store-listing copy, content rating questionnaires, and a TestFlight + Internal Test smoke run.

### Legal Drafts

`PRIVACY_POLICY.md` and `TERMS.md` are placeholder drafts. Both flag that legal review is required before publishing. Replace with hosted versions before submitting to either store.

### Sentry

`@sentry/react-native` is wired into the error boundary and root layout. Add `EXPO_PUBLIC_SENTRY_DSN` to the EAS environment to enable in builds. `tracesSampleRate: 0.1` for beta to keep volume low.

### Where users are in the launch process

End of Phase 5: code is feature-complete; placeholders remain in `app.json`, `eas.json` is committed, store assets are drafted, and the manual checklist is the gate to a first preview build. No store submission has been made yet.
