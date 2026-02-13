# 004 — Implementation Plan

**Date:** 2026-02-13
**Prerequisites:** Styling migration complete (globals.css + tailwind.config.ts branded). Backend/database exists in a separate repo — no table creation needed.
**References:** [001-research-figma-make-design-audit.md](001-research-figma-make-design-audit.md), [002-research-styling-guide.md](002-research-styling-guide.md)

---

## Change Log

| Date | Step | Status | Notes |
|------|------|--------|-------|
| 2026-02-13 | Step 1: Layout Shell | **Done** | app-header, bottom-nav-bar, page-container, header-user-button, layout migration |
| 2026-02-13 | Step 2: Types & Data Fetching | **Done** | Already existed — database.ts generated, domain type aliases, guards in place |
| 2026-02-13 | Step 3: Dashboard Screen | **Done** | stat-overview, match-card, interactive card CVA variant, full page rebuild with Suspense |

## Learnings

1. **Schema differs from design mocks** — Athletes table has no `belt_rank`, `wins`, `losses`, `win_streak`, `gym_name`. Stats must be computed from `match_participants`. Gym name requires joining via `primary_gym_id → gyms`.
2. **Supabase joins return arrays** — FK joins like `athletes!fk_participants_athlete(display_name)` return `T[]`, not `T`. Always access with `[0]`.
3. **Next.js 16 requires Suspense** — Async server components with data fetching must be wrapped in `<Suspense>` or the build fails with "Uncached data was accessed outside of `<Suspense>`".
4. **`belt-badge` is premature** — No `belt_rank` column exists in the database. Skip until the backend adds it.

---

## Principles

These principles address problems identified during plan review:

1. **Install shadcn components on demand** — don't batch-install primitives we won't use yet. Each step lists its own prerequisites.
2. **Build domain components alongside screens** — don't speculatively design component APIs. Build them when a screen needs them, so props are driven by real usage.
3. **No stub routes** — create routes when building the actual screen, not as empty placeholders.
4. **Migrate the existing layout explicitly** — document what gets kept, moved, or removed from the current `(app)/layout.tsx`.
5. **Standardize auth patterns** — use `guards.ts` consistently instead of inline auth checks per page.

---

## Step 1: Layout Shell + Layout Migration

### Build

| Component | Path | Notes |
|-----------|------|-------|
| `app-header.tsx` | `components/layout/` | Title bar with optional back button, icon, and right action slot |
| `bottom-nav-bar.tsx` | `components/layout/` | 4-tab fixed nav (Home / Rankings / Arena / Profile) with active state + badge count |
| `page-container.tsx` | `components/layout/` | `max-w-md mx-auto px-4 pb-20` wrapper |

### shadcn to install

- `avatar` — needed for header user display

### Migrate existing layout

The current `app/(app)/layout.tsx` has a desktop-width nav (`max-w-5xl`), links to `/challenges` and `/gyms`, `AuthButton`, `EnvVarWarning`, `ThemeSwitcher`, and a footer. These need to be resolved:

| Existing Element | Decision |
|-----------------|----------|
| Top nav bar (Home / Challenges / Gyms links) | **Replace** with `bottom-nav-bar` (4 tabs: Home / Rankings / Arena / Profile) |
| `AuthButton` | **Move** into `app-header` right slot (shows avatar + name when logged in) |
| `EnvVarWarning` | **Remove** — dev bootstrapping artifact, no longer needed |
| `ThemeSwitcher` | **Move** to Profile page settings section |
| Footer | **Remove** — mobile app pattern has no footer |
| `max-w-5xl` container | **Replace** with `page-container` (`max-w-md`) |

### Standardize auth

- All `(app)/` pages should use `requireAuth()` or `requireAthlete()` from `lib/guards.ts`
- Fix Profile page: currently does inline auth check redirecting to `/auth/login` (wrong path) instead of using guards
- Ensure guard redirects are consistent (`/login`, not `/auth/login`)

**Layout patterns served:** A (Tab Screen), B (Sub-screen — via `app-header` with back button).

---

## Step 2: Types & Data Fetching

Define TypeScript interfaces for the core domain and establish data fetching patterns. The database already exists in a separate backend — this step is about the frontend contract.

### Types to define (`types/`)

| Type | Key Fields | Source |
|------|-----------|--------|
| `Athlete` | `id`, `auth_user_id`, `display_name`, `current_elo`, `highest_elo`, `belt_rank`, `weight_class`, `gym_name`, `wins`, `losses`, `win_streak` | `athletes` table (partially used in Profile already) |
| `Match` | `id`, `athlete_1_id`, `athlete_2_id`, `winner_id`, `status`, `finish_method`, `elo_change`, `created_at` | `matches` table |
| `Challenge` | `id`, `challenger_id`, `challenged_id`, `status`, `weight_class`, `match_type`, `created_at` | `challenges` table |

### Data fetching pattern

- Server components fetch via `createClient()` from `lib/supabase/server.ts`
- Use `requireAthlete()` guard to get current user + athlete in one call
- Generate Supabase types from the remote database (`npx supabase gen types`) for type safety if possible
- Keep queries in the page server components, not in separate data-access files (avoid premature abstraction)

---

## Step 3: Dashboard Screen

Build the home page end-to-end (`app/(app)/page.tsx`). This is the first real screen, so it validates the full stack: layout shell → domain components → data fetching.

### Domain components to build (`components/domain/`)

| Component | Notes |
|-----------|-------|
| `stat-overview.tsx` | Wins/losses/rate/streak stat block |
| `match-card.tsx` | Match summary card (opponent, result, ELO change, date) |

### shadcn to install

- None expected — uses existing `card`, `badge`

### Screen sections

1. **User stats card** — `stat-overview` with data from `athletes` table
2. **Incoming challenges** — list of `match-card` entries with pending challenges
3. **Recent matches** — list of `match-card` entries with past results
4. Add `interactive` CVA variant to `components/ui/card.tsx` for clickable cards

### Data

- Fetch current athlete stats via `requireAthlete()`
- Fetch recent matches from `matches` table
- Fetch pending challenges from `challenges` table

---

## Step 4: Profile Screen Rebuild

Rebuild the existing profile page using the new layout + domain components.

### Domain components to build (`components/domain/`)

| Component | Notes |
|-----------|-------|
| `profile-header.tsx` | Avatar + name + ELO + belt + gym summary |
| `elo-badge.tsx` | CVA variants: `display`, `compact`, `stakes` |
| `belt-badge.tsx` | Colored badge by belt rank (uses belt color map from 001 §5) |

### shadcn to install

- `sheet` — share profile drawer
- `tabs` — stats sub-page tab switcher
- `separator` — section dividers

### Screen work

- Rebuild `app/(app)/profile/page.tsx` with `profile-header`, achievements grid, settings
- Add `app/(app)/profile/stats/page.tsx` — detailed stats with tab breakdown
- Share profile as a `<Sheet>` triggered from profile page (not a separate route)
- Move `ThemeSwitcher` into profile settings section
- Migrate existing `DisplayNameEditor` into the new layout
- Replace inline auth check with `requireAthlete()` guard

---

## Step 5: Leaderboard + Arena Screens

Build the two remaining tab-level screens that complete the bottom nav.

### Domain components to build (`components/domain/`)

| Component | Notes |
|-----------|-------|
| `athlete-card.tsx` | Avatar + name + ELO + belt for list display |
| `competitor-list-item.tsx` | Arena list: avatar + ELO + distance |

### shadcn to install

- `tabs` — if not already installed in Step 4 (Leaderboard Athlete/Gym toggle)
- `toggle` — Arena "looking for match" switch

### Routes to create

| Route | Screen |
|-------|--------|
| `app/(app)/leaderboard/page.tsx` | Rankings with Athlete/Gym tabs, top-3 podium, full list |
| `app/(app)/arena/page.tsx` | Rename from `challenges/` — explore, nearby competitors, activity |

### Cleanup

- **Delete** `app/(app)/challenges/` (replaced by arena)
- **Evaluate** `app/(app)/gyms/` — fold into leaderboard gym tab or delete

---

## Dependency Graph

```
Step 1 (Layout Shell)
  └── Step 3 (Dashboard) — needs layout
  └── Step 4 (Profile Rebuild) — needs layout
  └── Step 5 (Leaderboard + Arena) — needs layout

Step 2 (Types & Data Fetching)
  └── Step 3 (Dashboard) — needs types for queries
  └── Step 4 (Profile Rebuild) — needs Athlete type
  └── Step 5 (Leaderboard + Arena) — needs types

Step 3 (Dashboard)
  └── Step 4 (Profile Rebuild) — can reuse match-card, stat-overview

Step 4 (Profile Rebuild)
  └── Step 5 (Leaderboard + Arena) — can reuse elo-badge, belt-badge, athlete-card
```

**Execution order:** Steps 1 and 2 can run in parallel. Then Steps 3 → 4 → 5 sequentially (each builds on the domain components created by the previous step).

---

## Beyond Step 5 (future)

These screens are deferred — they depend on the match flow which requires more backend coordination:

- `athlete/[id]/` — competitor profile + compare stats modal
- `arena/swipe/` — tinder-style match discovery
- `match/pending/` — pending challenges list
- `match/[id]/accept/` — accept challenge
- `match/[id]/lobby/` — pre-match VS screen
- `match/[id]/live/` — active match timer
- `match/[id]/results/` — post-match results
