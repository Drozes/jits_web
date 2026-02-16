# Changelog

## [Unreleased]

### Online Presence Indicators (2026-02-16)

**Added**
- `hooks/use-online-presence.ts` — Core Supabase Presence hook for the `app:online` channel. Uses an external store pattern (`useSyncExternalStore`) so any client component can check online status without a React Context provider. Tracks `{ athlete_id, display_name, profile_photo_url }` per the BE contract.
- `components/layout/online-presence-bootstrap.tsx` — Side-effect client component mounted in app layout. Sets up the presence channel on app open (same pattern as `GlobalNotificationsProvider`).
- `components/domain/online-indicator.tsx` — Green dot component. Uses `useOnlineStatus(athleteId)` from the store. Renders nothing when offline, shows an absolutely-positioned green circle when online. Supports `className` override for size variants.
- Online indicators added to 4 avatar locations: leaderboard athlete cards, arena competitor cards, chat conversation list (DMs only), and competitor profile header.

**Changed**
- `app/(app)/layout.tsx` — Added `PresenceBootstrap` async component in a Suspense boundary.
- `CLAUDE.md` — Added Realtime & Presence architecture section documenting the two-tier model, external store pattern, and all realtime hooks.

### Step 12: Match Flow — Lobby → Live → Results (2026-02-14)

**Added**
- Match Lobby page (`app/(app)/match/[id]/page.tsx`) — VS screen with both athletes, ELO stakes for ranked, start match via `start_match_from_challenge()` RPC
- Live Match page (`app/(app)/match/[id]/live/page.tsx`) — countdown timer, start/end match controls, `start_match()` RPC for pending → in_progress transition
- Match Results page (`app/(app)/match/[id]/results/page.tsx`) — dual-purpose: records result via `record_match_result()` RPC or displays completed results with ELO changes
- `record-result-client.tsx` — submission type picker (grouped by category), winner selection, finish time from timer
- `results-display.tsx` — victory/defeat/draw display with ELO delta for ranked matches
- `MATCH_STATUS` and `MATCH_RESULT` constants in `lib/constants.ts`
- Unit tests: `lib/constants.test.ts` (9 tests), `results-display.test.tsx` (8 tests), `live-match-client.test.tsx` (9 tests) — 49 total tests now

**Match Flow Lifecycle**
- Challenge accepted → Match Lobby (VS screen + ELO stakes)
- Start Match → creates match via RPC → redirects to Live page
- Live page → Start Timer (pending → in_progress) → countdown → End Match
- End Match → Results page → record submission/draw → ELO updates (ranked only)
- Results display → Back to Arena / Home navigation

### Phase 1 — Safety Net (2026-02-14)

**Added**
- Error boundaries at root (`app/error.tsx`), app (`app/(app)/error.tsx`), and athlete profile (`app/(app)/athlete/error.tsx`) — graceful error UI instead of raw Next.js error page
- Custom 404 pages at root and app levels (`not-found.tsx`)
- Suspense fallback skeletons for Dashboard, Arena, and Leaderboard pages — loading placeholders instead of blank screens
- Pre-alpha codebase audit (`research/006-pre-alpha-codebase-audit.md`)

**Fixed**
- Removed unused `opacity` variable in swipe-discovery-client
- Removed unused `Badge` import in challenge-sheet
- Removed unused `gyms` query in leaderboard page (gym stats already computed from athlete FK joins)
- Excluded `outside_assets/` from ESLint to eliminate 30+ irrelevant warnings

### Phase 2 — Tooling & Test Foundation (2026-02-14)

**Added**
- Unit tests for `lib/utils.ts` — 17 tests covering `getInitials`, `computeStats`, `computeWinStreak`, `extractGymName` (23 total tests now)
- Husky pre-commit hook running `tsc --noEmit`, `eslint`, and `vitest run` on every commit

**Changed**
- Pinned `@supabase/ssr` (^0.8.0), `@supabase/supabase-js` (^2.94.1), and `next` (^16.1.6) — removed `"latest"` tags
- Rewrote E2E smoke tests for auth-aware routes (public pages + redirect assertions instead of guarded pages)
- Playwright config: increased webServer timeout, `reuseExistingServer: true`

**Known Issue**
- Playwright browser launch hangs in current environment — E2E tests need `npx playwright install` and may require system dependencies

### Phase 3 — Type Safety & Data Patterns (2026-02-14)

**Added**
- `lib/constants.ts` — centralized `MATCH_TYPE`, `CHALLENGE_STATUS`, `MATCH_OUTCOME`, `ATHLETE_STATUS` constants with TypeScript types
- `types/composites.ts` — shared FK join shapes (`ChallengerJoin`, `OpponentJoin`, `GymJoin`, `MatchJoin`), `ComputedStats`, and `EloStakes` types

**Changed**
- Replaced `as unknown as Array<...>` casts with proper FK join array types in `pending-challenges-content.tsx` and `athlete-profile-content.tsx`
- Moved gym fetch from client-side `useEffect` in `setup-form.tsx` to server-side in `setup/page.tsx` — gyms now passed as prop
- Challenge sheet and challenge response sheet now use shared `EloStakes` type and `MATCH_TYPE` constants instead of local duplicates
- Match card uses `MATCH_OUTCOME` constants for result config
- Guards use `ATHLETE_STATUS.PENDING` instead of string literal

### Step 1: Layout Shell + Layout Migration (004-plan)

**Added**
- `components/layout/app-header.tsx` — sticky header with title, optional back button, icon, and right action slot
- `components/layout/bottom-nav-bar.tsx` — fixed 4-tab bottom nav (Home / Rankings / Arena / Profile) with active state highlighting
- `components/layout/page-container.tsx` — mobile-width content wrapper (`max-w-md mx-auto px-4 pb-20`)
- `components/layout/header-user-button.tsx` — server component showing user avatar with initials, linked to profile
- `components/ui/avatar.tsx` — installed shadcn avatar primitive
- `app/(app)/profile/profile-content.tsx` — extracted async profile content for Suspense boundary

**Changed**
- `app/(app)/layout.tsx` — replaced desktop nav bar, footer, and `max-w-5xl` container with mobile app shell (app-header + page-container + bottom-nav-bar)
- `app/(app)/profile/page.tsx` — wrapped in Suspense boundary to fix Next.js 16 prerender error; uses `requireAthlete()` guard instead of inline auth check
- `lib/guards.ts` — fixed `requireAthlete()` column name from `user_id` to `auth_user_id` to match database schema

**Removed**
- `EnvVarWarning` from app layout (dev bootstrapping artifact)
- `ThemeSwitcher` from app layout footer (will move to profile settings in Step 4)
- Desktop top nav bar with Home/Challenges/Gyms links (replaced by bottom nav)
- Footer section from app layout

### Test Suite Setup

**Added**
- Vitest configured with React Testing Library and jsdom environment
  - `vitest.config.ts` — path aliases, jsdom, setup file
  - `vitest.setup.ts` — jest-dom matchers
  - `components/layout/bottom-nav-bar.test.tsx` — 3 tests (renders tabs, active state, correct routes)
  - `components/layout/page-container.test.tsx` — 3 tests (renders children, constraint classes, custom className)
- Playwright configured for E2E testing
  - `playwright.config.ts` — chromium + mobile-chrome projects, auto-start dev server
  - `e2e/smoke.spec.ts` — 3 tests (layout shell renders, nav links correct, login form renders)
- npm scripts: `test`, `test:watch`, `test:e2e`, `test:e2e:ui`, `typecheck`

### Constitution Update (v1.0.0 → v1.1.0)

**Added**
- Principle VI: Testing Discipline — Vitest for unit/component, Playwright for E2E, build gates
- Component Architecture subsection in Tech Stack — three-tier layer rules (ui/domain/layout)
- "Database schema management" added to Out of Scope (separate backend repo)

**Changed**
- Principle II: Added component layer table and install-on-demand rules for shadcn
- Principle III: Added `requireAthlete()` guard standardization rule
- Tech Stack table: Updated UI Components entry, added test framework rows
