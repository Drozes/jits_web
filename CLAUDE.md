# CLAUDE.md — JITS Web Development Principles

## Project Overview

JITS Web is a BJJ competitor matchmaking app built with Next.js 16, Supabase, Tailwind CSS, and shadcn/ui. The backend lives in a separate repo — this is frontend only.

**Backend repo:** `/Users/msponagle/code/experiments/jr_be/`
- Supabase migrations in `supabase/migrations/`
- DB tests in `supabase/tests/`
- Feature specs in `specs/`
- Read the BE repo's `README.md` and migrations when you need to understand the database schema, RLS policies, or business rules.

## Architecture

- **Framework:** Next.js 16 App Router with `cacheComponents` enabled
- **Auth/DB:** Supabase (server client for RSC, browser client for client components)
- **Styling:** Tailwind CSS + shadcn/ui component library
- **Guards:** `requireAuth()` → `requireAthlete()` → `requireSessionParticipant(sessionId)` — progressive auth checks in `lib/guards.ts`

### Directory Structure

```
app/(app)/          # Authenticated app routes (layout with nav shell)
components/
  domain/           # Business-logic components (athlete-card, match-card, etc.)
  layout/           # Shell components (app-header, bottom-nav-bar, page-container)
  profile/          # Profile-specific components
  ui/               # shadcn/ui primitives (DO NOT edit manually)
lib/
  api/              # Typed data access layer (queries, mutations, errors)
  supabase/         # Server and browser Supabase clients
  guards.ts         # Auth guard functions
  utils.ts          # Shared utilities (cn, helpers)
types/              # database.ts (generated) + per-table aliases
```

### Naming Conventions

- **Files:** kebab-case (`athlete-card.tsx`, `match-card.tsx`)
- **Components:** PascalCase (`AthleteCard`, `MatchCard`)
- **Types:** PascalCase (`Athlete`, `AthleteInsert`)

## Code Quality Principles

### 1. Keep Components Short

- **Target: under 80 lines per component.** If a component exceeds this, split it.
- Server data-fetching components can stretch to 120 lines but no further.
- Extract sub-components into the same file or sibling files.

### 2. Don't Duplicate Logic

When you see the same logic in 2+ files, extract it to `lib/utils.ts` or `lib/api/`. Before writing a new helper, check if one already exists.

**Extracted to `lib/utils.ts`:** `getInitials()`, `computeStats()`, `computeWinStreak()`, `extractGymName()`
**Extracted to `lib/api/queries.ts`:** `getAthleteProfile()`, `getLeaderboard()`, `getAthleteStats()`

**Remaining duplication (tech debt):**
- Relative date formatting — duplicated in 2 files

### 3. Supabase FK Join Behavior

**Unaliased** FK joins like `athletes!fk_name(col)` return `T[]`. Access with `[0]`:
```ts
const gymsArr = a.gyms as { name: string }[] | null;
const gymName = gymsArr?.[0]?.name ?? null;
```

**Aliased** FK joins like `challenger:athletes!fk(col)` return `T` directly — no `[0]` needed:
```ts
const challenger = data.challenger; // already a single object
```

### 4. Stats Are Computed, Not Stored

The `athletes` table has no `wins`, `losses`, `win_streak`, or `belt_rank` columns. All stats are computed from the `get_match_history` RPC which returns complete match data including `athlete_outcome`, `elo_delta`, `result`, `finish_time_seconds`, and `completed_at`. **Do not query `match_participants` directly** — RLS restrictions prevent direct table access; always use the RPC via `getMatchHistory()` from `lib/api/queries.ts`.

### 5. Suspense Is Mandatory for Async Server Components

Next.js 16 with `cacheComponents` requires all async data-fetching components to be wrapped in `<Suspense>`. The pattern:

```tsx
// page.tsx — synchronous, wraps content in Suspense
export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content />
    </Suspense>
  );
}

// content.tsx — async, does data fetching
async function Content() {
  const data = await fetchData();
  return <div>{data}</div>;
}
```

`export const dynamic` route segment config is NOT compatible with `cacheComponents`. Use Suspense instead.

### 6. Dynamic Route Params Are Promises

In Next.js 16, `params` is a `Promise`. Await it inside the Suspense boundary, not in the page component:
```tsx
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Content paramsPromise={params} />
    </Suspense>
  );
}
```

### 7. Client vs Server Components

- Default to **server components** unless you need interactivity (state, effects, event handlers).
- Client components must have `"use client"` at the top.
- Never fetch Supabase data in client components for initial loads — fetch server-side and pass as props.

### 8. Props Design

When passing 4+ related fields about the same entity, group them into an object prop. New components should follow this pattern. Existing components using granular props are tech debt — refactor when touched.

### 9. Color Tokens for Stats

Use these consistently across all stat displays:
- **Wins/positive:** `text-success` (inline text) or `bg-success text-success-foreground` (badges)
- **Losses/negative:** `text-destructive` (inline text) or `bg-destructive text-destructive-foreground` (badges)
- **Draws/pressure:** `text-amber-500`
- **ELO/neutral stats:** default foreground color with `tabular-nums` (NOT `text-primary` — that's brand red)
- **Brand accent:** `text-primary` — reserved for branding, buttons, and section header icons. Never for data values.

**Theme token:** `--success` (`hsl(145 63% 37%)` light / `hsl(145 63% 49%)` dark) is available as `bg-success`, `text-success`, and Badge `variant="success"`. Use it for win badges and positive ELO change badges. Light-mode lightness is tuned to pass WCAG AA on `--background`.

### 10. MatchCard Shows Match Type

`MatchCard` accepts an optional `matchType` prop (`"ranked" | "casual"`). When provided, it displays "Ranked" or "Casual" inline with the date (e.g., "2d ago · Ranked"). Pass `matchType` on both `type="match"` and `type="challenge"` cards. Active call sites: dashboard recent matches, match history, head-to-head. Hidden call sites (challenge flow): received challenges, sent challenges.

### 11. Avoid Premature Abstraction

Don't create abstractions for things used once. Don't add error handling for impossible states. This is alpha — ship fast, refactor when real patterns emerge. The threshold for extraction is 2+ usages across files (see Principle 2).

## Pre-Commit Quality Checks

Before every commit, run these checks and fix any failures:

1. **TypeScript** — `npx tsc --noEmit` (always)
2. **Build** — `npx next build` (always)
3. **Unit tests** — `npm test` (always)
4. **E2E tests** — `npm run test:e2e` (for complex commits: new pages/routes, layout changes, auth flow changes, or multi-file refactors)

Do not commit if any check fails. Fix the issue first.

### Changelog

**Always update `CHANGELOG.md`** when committing changes. Add entries under `## [Unreleased]` at the top, organized by feature area with `**Added**`, `**Changed**`, `**Fixed**`, and `**Removed**` subsections. Include file paths for new files. Keep entries concise but specific enough to understand what changed and why.

## UI Kit Maintenance

### shadcn/ui Components (`components/ui/`)

- **Never edit these files manually.** They are managed by `npx shadcn@latest add <component>`.
- To customize, use Tailwind classes in the consuming component or extend via `cn()`.
- Currently installed: `avatar`, `badge`, `button`, `card`, `dialog`, `input`, `label`, `select`, `separator`, `sheet`, `switch`, `tabs`
- **Exception:** `badge.tsx` has a custom `success` variant added (green bg for win badges). Preserve this when regenerating.

### Domain Components (`components/domain/`)

Custom business components. Each should:
- Have a clear, typed props interface
- Be under 80 lines
- Use CVA for variant-based styling when there are visual variants (see `elo-badge.tsx`)
- Not duplicate logic that belongs in `lib/utils.ts`

### Layout Components (`components/layout/`)

Shell components that define the app's structure:
- `app-header.tsx` — top bar with title, back button, optional actions
- `bottom-nav-bar.tsx` — tab navigation (Home, Gyms, Rankings, Profile)
- `page-container.tsx` — content wrapper with consistent padding
- `global-notifications-provider.tsx` — mounts realtime message listener (renders null)
- `online-presence-bootstrap.tsx` — mounts `app:online` Presence channel (renders null)

## Known Tech Debt (Priority Order)

**High — functional issues:**
- [x] `proxy.ts` — already correctly named for Next.js 16 (`proxy` convention, not `middleware`)
- [x] `update-password-form.tsx` redirect fixed to `/`

**Medium — duplication cleaned up:**
- [x] `getInitials()` extracted to `lib/utils.ts`
- [x] `computeStats()` and `computeWinStreak()` extracted to `lib/utils.ts`
- [x] `extractGymName()` extracted to `lib/utils.ts`

**Low — code style improvements:**
- [x] `share-profile-sheet.tsx` refactored to use `athlete` object prop
- [x] `conversation-card.tsx` — fixed `text-primary` on unread timestamp → `text-foreground`
- [x] `mutations.ts` — fixed unsafe `.data!` on `auth_athlete_id` RPC → null-safe check
- [x] `looking-for-match-toggle.tsx` — raw Supabase `.update()` → `toggleMatchPreferences()` mutation
- [ ] Auth form components (`login-form`, `sign-up-form`, `forgot-password-form`) share ~70% identical code
- [ ] 20 non-shadcn components exceed 80-line target (largest: `editable-profile-header` ~459, `challenge-response-sheet` 301, `challenge-sheet` 274). Many are in hidden features (chat, challenges, arena). Active components over target: `login-form` 186, `sign-up-form` 169, `profile-photo-upload` 165, `recent-activity-section` 155, `match-card` 108, `forgot-password-form` 105.
- [ ] 5 components have props that should be grouped into objects (`message-bubble`, `chat-thread`, `lobby-actions`, `arena-content`, `looking-for-match-toggle`)

## Chat UI Patterns

### Message Grouping

Consecutive messages from the same sender within 2 minutes are grouped. Pass `isFirstInGroup` / `isLastInGroup` booleans to `MessageBubble`. Effects:
- **Spacing:** 0.5 gap within groups, 12px gap between groups
- **Border radius:** Corners flatten where messages connect (e.g., `rounded-tr-md` on non-first own messages)
- **Timestamps:** Only shown on the last message in a group
- **Avatars:** Only shown on the last message in a group (bottom-aligned)
- **Sender names:** Only shown on the first message in a group (group chats only)

### Thread Participant Data

The thread page fetches all participant profiles server-side into a `Record<string, ParticipantInfo>` map keyed by athlete ID. This map is passed to `ChatThread` → `MessageList` → `MessageBubble` for avatar/name rendering. No per-message queries needed.

### Date Separators

`DateSeparator` renders "Today", "Yesterday", weekday names (< 7 days), or "Mon DD" with horizontal rules. Inserted in `MessageList` when the day changes between messages.

## Key FK Join Names

```
Athletes -> Gyms:               gyms!fk_athletes_primary_gym(name)
Match participants -> Athletes:  athletes!fk_participants_athlete(display_name)
Challenges -> Challenger:        athletes!fk_challenges_challenger(display_name)
Matches -> Participants:         matches!fk_participants_match(completed_at, status)
Sessions -> Gyms:                gyms!fk_sessions_gym(name, city, latitude, longitude)
Session participants -> Athletes: athletes!fk_session_participants_athlete(display_name, current_elo, current_weight)
```

## Data Access Layer (`lib/api/`)

Typed wrappers for all Supabase queries and mutations. Use these instead of raw `.from()` / `.rpc()` calls in new code.

### Queries (`lib/api/queries.ts`) — Server-side

**Dashboard & Profile:**
- `getDashboardSummary(supabase)` — stats, rank, recent matches, recent activity
- `getAthleteStatsRpc(supabase, athleteId)` — wins/losses/draws for any athlete via RPC
- `getAthletesStatsRpc(supabase, athleteIds)` — batch stats for leaderboard/swipe
- `getMatchHistory(supabase, athleteId)` — wraps `get_match_history` RPC
- `getEloHistory(supabase, athleteId)` — wraps `get_elo_history` RPC

**Challenges (hidden features, still available):**
- `getEloStakes(supabase, ...)` — wraps `calculate_elo_stakes` RPC (weight-aware)
- `canCreateChallenge(supabase, opponentId?)` — wraps `can_create_challenge` RPC
- `getLobbyData(supabase, challengeId)` — full challenge details for match lobby
- `getChallengesBetween(supabase, ...)` — challenges between two athletes
- `getPendingChallengeBetween(supabase, ...)` — pending challenge between two athletes
- `getPendingChallengeOpponentIds(supabase, athleteId)` — IDs of athletes with pending challenges

**Sessions & Gyms:**
- `getActiveSession(supabase, athleteId)` — athlete's current active/scheduled session
- `getGymsWithSessions(supabase)` — all active gyms with session counts
- `getGymDetail(supabase, gymId)` — gym details with upcoming sessions
- `getSessionForJoin(supabase, sessionId)` — session + gym coords + waiver + athlete weight for join wizard
- `getSessionLobbyData(supabase, sessionId)` — wraps `get_session_lobby` RPC

**Match:**
- `getMatchDetails(supabase, matchId)` — match + participants with athlete names/ELO + session fields
- `getSubmissionTypes(supabase)` — all 23 active submission techniques

### Mutations (`lib/api/mutations.ts`) — Client-side

**Challenges (hidden features, still available):**
- `createChallenge(supabase, { opponentId, matchType, challengerWeight? })` → `Result<{ id }>`
- `acceptChallenge(supabase, { challengeId, opponentWeight? })` → `Result<void>`
- `declineChallenge(supabase, challengeId)` → `Result<void>`
- `cancelChallenge(supabase, challengeId)` → `Result<void>`
- `startMatchFromChallenge(supabase, challengeId)` → `Result<StartMatchResponse>`

**Sessions:**
- `rsvpToSession(supabase, sessionId)` → `Result<void>`
- `cancelRsvp(supabase, sessionId)` → `Result<void>`
- `joinSessionLobby(supabase, { sessionId, weight })` → `Result<void>`
- `acceptSessionWaiver(supabase, { sessionId, waiverId })` → `Result<void>`
- `createSession(supabase, { gymId, scheduledStart, ... })` → `Result<{ id }>`
- `createInSessionMatch(supabase, { sessionId, opponentId, matchType })` → `Result<{ matchId }>`
- `leaveSessionLobby(supabase, sessionId)` → `Result<void>`
- `requestRandomMatch(supabase, sessionId)` → `Result<{ matchId }>`

**Match lifecycle:**
- `startMatch(supabase, matchId)` → `Result<StartMatchTimerResponse>`
- `pauseMatch(supabase, matchId)` → `Result<void>`
- `resumeMatch(supabase, matchId)` → `Result<void>`
- `endMatch(supabase, matchId)` → `Result<void>`
- `recordMatchResult(supabase, { matchId, result, winnerId?, ... })` → `Result<RecordResultResponse>`
- `confirmMatchResult(supabase, matchId)` → `Result<void>`
- `disputeMatchResult(supabase, matchId, reason?)` → `Result<void>`

**Preferences & Notifications:**
- `toggleMatchPreferences(supabase, athleteId, { lookingForCasual, lookingForRanked })` → `Result<void>`
- `registerPushDevice(supabase, ...)` / `removePushDevice(supabase, ...)` — push notification management

### Error Handling (`lib/api/errors.ts`)

All mutations return `Result<T>` = `{ ok: true, data: T } | { ok: false, error: DomainError }`. Domain error codes include: `MAX_PENDING_CHALLENGES`, `OPPONENT_INACTIVE`, `MATCH_NOT_IN_PROGRESS`, `NOT_PARTICIPANT`, `SESSION_NOT_FOUND`, `SESSION_FULL`, `ALREADY_JOINED`, `SESSION_NOT_ACTIVE`, `WAIVER_REQUIRED`, `MATCH_NOT_PAUSED`, `ALREADY_CONFIRMED`, `ALREADY_DISPUTED`, `RLS_VIOLATION`, `UNKNOWN`.

## Realtime & Presence

### Two-Tier Presence Model (Supabase Presence API)

The app uses **two Presence channels** to distinguish between general online status and lobby matchmaking:

| Channel | Who Joins | Purpose |
|---------|-----------|---------|
| `app:online` | Every authenticated active athlete with the app open | Chat online indicators (green dots) |
| `lobby:online` | Athletes with `looking_for_casual=true` OR `looking_for_ranked=true` | Matchmaking lobby (not yet implemented) |

**Implementation pattern:** External store (`useSyncExternalStore`) instead of React Context — avoids wrapping the layout in a provider. Any client component can import `useOnlineStatus(athleteId)` from `hooks/use-online-presence.ts`.

Key files:
- `hooks/use-online-presence.ts` — channel setup + external store + `useOnlineStatus()` consumer hook
- `components/layout/online-presence-bootstrap.tsx` — side-effect component mounted in layout
- `components/domain/online-indicator.tsx` — green dot, renders nothing when offline

### Realtime Subscriptions (Postgres Changes + Broadcast)

**Global (mounted in layout):**
- `hooks/use-global-notifications.ts` — global message listener → toast notifications
- `hooks/use-pending-challenges.ts` — challenge INSERT/UPDATE → bell badge
- `hooks/use-unread-count.ts` — polling (30s) + manual refresh via event dispatch

**Chat (hidden feature):**
- `hooks/use-chat-channel.ts` — per-conversation messages + typing indicators (broadcast)

**Session lobby:**
- `hooks/use-session-lobby-realtime.ts` — Postgres Changes (participant INSERT/UPDATE/DELETE) + Broadcast (ephemeral challenges, match_started, participant_joined)

**Session match:**
- `hooks/use-session-match-sync.ts` — Broadcast for 7 match events (timer, ready, result, confirm)
- `hooks/use-session-match-timer.ts` — timer with pause/resume awareness and broadcast sync
- `hooks/use-video-recorder.ts` — MediaRecorder with codec negotiation and Supabase Storage upload

### Supabase Client Realtime Config

The browser client (`lib/supabase/client.ts`) is configured with:
- `heartbeatIntervalMs: 15_000` — 15s heartbeat to prevent silent disconnections
- `worker: true` — Web Worker for background tab support (critical for mobile PWA)

## Feature Flags

Two-tier system:
- **Frontend flags** (`lib/feature-flags.ts`): Hardcoded constants for UI toggles during development. Use `getFlag("flagName")` in server components, `useFeatureFlag("flagName")` hook in client components.
- **Backend flags** (`feature_flags` table): Database-controlled flags for backend features (e.g., `timekeeper_role`).

Current frontend flags: `timekeeperEnabled` (false), `messagesEnabled` (false).

## Hidden Routes (Session Transition)

These routes redirect to `/` during the session-based transition. Code is preserved, not deleted:
- `/arena`, `/arena/swipe` (replaced by Gyms + Sessions)
- `/match/pending`, `/match/lobby/[id]` (challenge-based flow, replaced by session match flow)
- `/match/[id]/live`, `/match/[id]/results` (redirect if not participant, but old challenge flow is unreachable)
- `/athlete/[id]/challenges`

Dashboard challenges section also removed. Messages feature flagged off (`messagesEnabled: false`).

**Active routes (session-based model):**
- `/` (dashboard with stats, sessions, activity)
- `/gyms`, `/gyms/[id]` (gym finder + gym detail with sessions)
- `/session/[id]/join` (4-step join wizard: geo, waiver, weight, confirm)
- `/session/[id]/lobby` (realtime participant list, challenges, random match)
- `/session/[id]/match/[matchId]` (8-step match wizard: wait, weight, ready, live, result, summary)
- `/leaderboard` (fighters + gyms with gender filter)
- `/profile`, `/profile/stats`, `/profile/setup`
- `/settings`, `/settings/video`, `/settings/feedback`, `/settings/help`
- `/athlete/[id]` (competitor profile)

Bottom nav: Home, Gyms, Rankings, Profile.

## Type Generation

Run `npm run db:types` to regenerate `types/database.ts` from the local Supabase instance in the backend repo. Run this after every backend migration.

## Backend Integration

**Full reference:** [research/005-backend-reference.md](research/005-backend-reference.md)
**Integration brief:** [research/007-frontend-backend-integration-brief.md](research/007-frontend-backend-integration-brief.md)
**Backend integration guide:** `jr_be/FRONTEND_INTEGRATION_GUIDE.md` (42KB, covers all features including presence, chat, challenges, matches)

Read these docs before building challenge, match, ELO, or presence features. Key points:

- **Athlete activation** requires `display_name` + `current_weight` + (`primary_gym_id` OR `free_agent = true`) + `gender` + `date_of_birth`
- **Setup flow:** Two-step wizard: Step 1 = TOS acceptance (waiver_acknowledgements), Step 2 = profile fields (name, weight, gym, gender, DOB, city, theme)
- **Challenges:** INSERT with RLS validation, max 3 pending, opponent must be `active`
- **Starting matches:** use `startMatchFromChallenge()` then `startMatch()` — never direct INSERT
- **Recording results:** use `recordMatchResult()` — auto-calculates ELO for ranked matches
- **ELO stakes preview:** use `getEloStakes()` for display before sending challenges — pass weights for weight-aware stakes
- **Weight-aware ELO:** When both athletes have weights, heavier athletes get a phantom ELO offset (+50 per IBJJF division gap). Pass weights to `calculate_elo_stakes` for accurate preview. Show `weight_division_gap` when > 0.
- **Draws always cost ELO (Pressure Score):** Both athletes lose ELO on draw. Show `challenger_draw` / `opponent_draw` in stakes UI (amber color). Equal match = harshest penalty.

### Frontend/Backend Discrepancies (Status)

1. ~~Activation trigger uses `primary_gym_id`, not `current_weight`~~ — [x] setup includes gym picker + free agent path
2. **Weight units unclear** — `athletes.current_weight` spec says kg, `challenges` spec says lbs. Needs BE resolution.
3. ~~Challenge creation not implemented~~ — [x] ChallengeSheet uses `createChallenge()` mutation (no raw inserts)
4. ~~No gym selection in setup~~ — [x] setup form includes gym dropdown
5. ~~Match flow not implemented~~ — [x] Session match wizard (`/session/[id]/match/[matchId]`) with 8-step state machine, timer, video recording, confirm/dispute
6. ~~Challenge→match flow bugs~~ — [x] All 4 bugs fixed. See `specs/challenge-match-flow-fixes.md`.
