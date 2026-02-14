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
| 2026-02-13 | Step 4: Profile Screen Rebuild | **Done** | profile-header, elo-badge (CVA), profile page rebuild with achievements + account section, stats sub-page with tabs, LogoutButton fix |
| 2026-02-13 | Step 5: Leaderboard + Arena | **Done** | athlete-card, leaderboard (podium + Fighters/Gyms toggle), arena (looking-for-match toggle + competitors + activity feed), deleted challenges/ and gyms/ stubs, installed switch + select |
| 2026-02-13 | Step 6: Competitor Profile | **Done** | compare-stats-modal (dialog), athlete/[id] page with profile-header reuse, head-to-head history, action buttons, wrapped BottomNavBar in Suspense for dynamic routes |
| 2026-02-13 | Step 7: Pending Challenges | **Done** | match/pending page with Received/Sent tabs, challenge cards linking to athlete profiles, empty states with Arena CTA, info card |
| 2026-02-13 | Step 8: Share Profile | **Done** | share-profile-sheet (sheet), profile preview card, copy link + native share, privacy notice, Share button on profile page |
| 2026-02-13 | Step 9: Swipe Discovery | **Done** | arena/swipe page with draggable card stack, pointer-based swipe gestures, PASS/LIKE indicators, action buttons, end state with session summary |
| 2026-02-13 | Setup Refactor | **Done** | Backend auto-creates athletes on signup; setup form now UPDATEs instead of INSERTing; `current_weight == null` = needs onboarding |
| 2026-02-13 | Weight Display | **Done** | Added `current_weight` to profile-header, compare-stats-modal, swipe-card, share-profile-sheet; weight required during setup |

## Learnings

1. **Schema differs from design mocks** — Athletes table has no `belt_rank`, `wins`, `losses`, `win_streak`, `gym_name`. Stats must be computed from `match_participants`. Gym name requires joining via `primary_gym_id → gyms`.
2. **Supabase joins return arrays** — FK joins like `athletes!fk_participants_athlete(display_name)` return `T[]`, not `T`. Always access with `[0]`.
3. **Next.js 16 requires Suspense** — Async server components with data fetching must be wrapped in `<Suspense>` or the build fails with "Uncached data was accessed outside of `<Suspense>`".
4. **`belt-badge` is premature** — No `belt_rank` column exists in the database. Skip until the backend adds it.
5. **Client hooks in layout need Suspense for dynamic routes** — `usePathname()` in `BottomNavBar` causes prerender failures on `[id]` routes. Wrapping in `<Suspense>` fixes it.
6. **`cacheComponents` disables route segment config** — `export const dynamic = "force-dynamic"` is not compatible with Next.js 16 `cacheComponents`. Use Suspense boundaries instead.

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

## Step 6: Competitor Profile

View another athlete's public profile with stats, match history, and compare modal.

### Domain components to build (`components/domain/`)

| Component | Notes |
|-----------|-------|
| `compare-stats-modal.tsx` | Dialog showing side-by-side stat comparison (ELO, W/L, win rate) |

### shadcn to install

- `dialog` — for compare stats modal

### Route

| Route | Screen |
|-------|--------|
| `app/(app)/athlete/[id]/page.tsx` | Competitor profile with header, actions, match history |

### Screen sections

1. **Profile header** — reuse `profile-header.tsx` with competitor's data
2. **Action buttons** — "Challenge" (link to pending challenges) + "Compare Stats" (opens modal)
3. **ELO stakes** — `elo-badge.tsx` `stakes` variant showing potential win/loss
4. **Match history** — `match-card` entries for head-to-head matches
5. **Compare stats modal** — `Dialog` with side-by-side ELO, record, win rate

### Data

- Fetch competitor by `id`, join gym via `gyms!athletes_primary_gym_id_fkey(name)`
- Match history via `match_participants` for both athletes sharing the same `match_id`
- W/L stats from `match_participants.outcome`

---

## Step 7: Pending Challenges

Full-page list of sent and received challenges with status tracking.

### Route

| Route | Screen |
|-------|--------|
| `app/(app)/match/pending/page.tsx` | Sent/received challenge tabs |

### Screen sections

1. **Tabs** — "Received" / "Sent" (reuse `tabs` component)
2. **Challenge cards** — opponent avatar + name, match type badge, ELO stakes, timestamp
3. **Empty state** — "No pending challenges" with CTA to Arena
4. **Info card** — brief challenge flow explainer

### Data

- Received: `challenges` where `opponent_id = currentAthlete.id`, `status = 'pending'`
- Sent: `challenges` where `challenger_id = currentAthlete.id`, `status = 'pending'`
- Join athlete data via `athletes!fk_challenges_challenger` / `athletes!fk_challenges_opponent`

---

## Step 8: Share Profile

Share profile card triggered from profile page as a `<Sheet>` (not a route).

### Domain components to build (`components/domain/`)

| Component | Notes |
|-----------|-------|
| `share-profile-sheet.tsx` | Sheet with profile preview card + share actions |

### Screen sections

1. **Profile preview card** — name, ELO, W/L record, gym (styled as shareable card)
2. **Share actions** — Copy link (clipboard API), native share (if available)
3. **Privacy notice** — what's shared

### Integration

- Add "Share" button to `app/(app)/profile/page.tsx`
- Sheet receives athlete data + stats as props

---

## Step 9: Swipe Discovery

Tinder-style card swiping for opponent discovery. Client-heavy with drag interactions.

### Route

| Route | Screen |
|-------|--------|
| `app/(app)/arena/swipe/page.tsx` | Swipeable competitor cards |

### Screen sections

1. **Swipeable card stack** — drag left to pass, right to like (CSS transforms + pointer events)
2. **Card content** — avatar, name, ELO, gym, W/L record, ELO stakes
3. **Action buttons** — Pass (X), View Profile (eye), Like (heart)
4. **End state** — "All caught up" with session summary

### Data

- Same as arena: athletes excluding current user, ordered by ELO proximity
- Swipe state managed client-side

---

## Updated Dependency Graph

```
Steps 1-5 (complete)
  └── Step 6 (Competitor Profile) — reuses profile-header, elo-badge, match-card
        ├── Step 7 (Pending Challenges) — "Challenge" button links here
        └── Step 9 (Swipe Discovery) — "View Profile" links to athlete/[id]

Step 8 (Share Profile) — independent, builds on profile page
```

**Execution order:** 6 → 7 → 8 → 9

---

## Beyond Step 9 (speckit — match flow)

These screens require real-time state, timers, and multi-user coordination. Use speckit to spec:

- `match/[id]/accept/` — accept challenge
- `match/[id]/lobby/` — pre-match VS screen
- `match/[id]/live/` — active match timer
- `match/[id]/results/` — post-match results
