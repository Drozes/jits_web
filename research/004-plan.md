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
| 2026-02-13 | Code Review | **Done** | Full codebase review; created CLAUDE.md with principles, code quality guidelines, UI kit rules, and tech debt tracker |
| 2026-02-14 | Arena FK Fix | **Done** | FK constraint is `fk_athletes_primary_gym`, not `athletes_primary_gym_id_fkey`. Fixed across all queries. Split arena into two targeted queries (looking vs. not-looking). |
| 2026-02-14 | RPC Contracts | **Done** | Integrated BE `docs/rpc-contracts.md` into `research/005-backend-reference.md`. All 7 RPCs documented with params, responses, and error hints. |
| 2026-02-14 | Step 10: Setup Fix | **Done** | Gym picker now required (not optional). Guard checks `status='pending'` instead of `current_weight`. Setup page checks status for redirect. `primary_gym_id` always sent on submit. |
| 2026-02-14 | Step 11: Challenge Response | **Done** | Accept/decline already existed (challenge-response-sheet). Added: cancel button on sent challenges (sent-challenges-list), expiry badge with countdown (expiry-badge), expired challenge filtering server-side. |

## Learnings

1. **Schema differs from design mocks** — Athletes table has no `belt_rank`, `wins`, `losses`, `win_streak`, `gym_name`. Stats must be computed from `match_participants`. Gym name requires joining via `primary_gym_id → gyms`.
2. **Supabase joins return arrays** — FK joins like `athletes!fk_participants_athlete(display_name)` return `T[]`, not `T`. Always access with `[0]`.
3. **Next.js 16 requires Suspense** — Async server components with data fetching must be wrapped in `<Suspense>` or the build fails with "Uncached data was accessed outside of `<Suspense>`".
4. **`belt-badge` is premature** — No `belt_rank` column exists in the database. Skip until the backend adds it.
5. **Client hooks in layout need Suspense for dynamic routes** — `usePathname()` in `BottomNavBar` causes prerender failures on `[id]` routes. Wrapping in `<Suspense>` fixes it.
6. **`cacheComponents` disables route segment config** — `export const dynamic = "force-dynamic"` is not compatible with Next.js 16 `cacheComponents`. Use Suspense boundaries instead.
7. **FK constraint names don't match Supabase auto-naming** — The `athletes → gyms` FK is `fk_athletes_primary_gym`, not the auto-generated `athletes_primary_gym_id_fkey`. Always verify FK names against migrations.
8. **Gym is required for activation, not weight** — Backend trigger `handle_athlete_activation()` activates athletes when `primary_gym_id IS NOT NULL`, not when `current_weight` is set. Setup flow must require gym selection.

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

- Fetch competitor by `id`, join gym via `gyms!fk_athletes_primary_gym(name)`
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

## Step 10: Setup Fix — Require Gym for Activation

The setup flow currently treats gym as optional, but the backend activation trigger requires `primary_gym_id IS NOT NULL` to move athletes from `pending` → `active`. Without activation, athletes are invisible to other users via RLS.

### Changes

| File | Change |
|------|--------|
| `setup-form.tsx` | Make gym picker **required** (not optional). Disable submit until gym selected. |
| `setup/page.tsx` | Check `primary_gym_id IS NULL` instead of `current_weight == null` for "needs setup" |
| `lib/guards.ts` | Update `requireAthlete()` to redirect to setup if `status = 'pending'` |

### Current state

- Setup form has gym picker but labeled "optional" with hint "You can set or change this later"
- Backend: `handle_athlete_activation()` fires on UPDATE — if `status = 'pending'` AND `primary_gym_id IS NOT NULL` AND `display_name IS NOT NULL`, sets `status = 'active'`
- RLS `athletes_select_public` only shows `active`/`inactive` athletes to others

---

## Step 11: Challenge Response Flow

The pending challenges page (Step 7) shows received/sent challenges but has no accept/decline buttons. The challenge-sheet (Step 6) already handles **creating** challenges. This step adds **responding** to them.

### What exists

- `match/pending/page.tsx` — lists challenges in Received/Sent tabs
- `challenge-sheet.tsx` — creates challenges with match type, weight, ELO stakes preview
- Backend: `challenges` table supports `pending → accepted → started` and `pending → declined` transitions
- RLS: only opponent can accept/decline, only pending challenges can be updated

### What to build

| Component | Notes |
|-----------|-------|
| Accept/Decline buttons on received challenge cards | Update `status` to `accepted`/`declined` via Supabase |
| Cancel button on sent challenges | Update `status` to `cancelled` (only for pending) |
| Expiry display | Show `expires_at` countdown, disable actions if expired |
| Weight confirmation on accept | Opponent enters their weight when accepting |

### Data patterns (from RPC contracts)

```ts
// Accept
.from('challenges').update({ status: 'accepted', opponent_weight: 160, updated_at: new Date().toISOString() }).eq('id', challengeId).eq('status', 'pending')

// Decline
.from('challenges').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', challengeId).eq('status', 'pending')

// Cancel (either party, accepted challenges only)
.from('challenges').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', challengeId).eq('status', 'accepted')
```

---

## Step 12: Match Flow — Lobby → Live → Results

This is the core gameplay loop. Uses RPCs for all state transitions.

### Routes

| Route | Screen | RPC |
|-------|--------|-----|
| `match/[id]/page.tsx` | Match lobby / VS screen | `start_match_from_challenge(p_challenge_id)` |
| `match/[id]/live/page.tsx` | Active match timer | `start_match(p_match_id)` |
| `match/[id]/results/page.tsx` | Post-match results + ELO changes | `record_match_result(...)` |

### Match Lobby (`match/[id]/page.tsx`)

Entry point after challenge is accepted. Shows VS screen with both athletes.

1. **VS header** — Both athletes' avatars, names, ELO, weight
2. **ELO stakes** — `calculate_elo_stakes()` RPC for ranked matches
3. **Start Match button** — calls `start_match_from_challenge(p_challenge_id)`
4. **Cancel button** — updates challenge status to `cancelled`
5. **Status**: match transitions `pending` after RPC call

### Live Match (`match/[id]/live/page.tsx`)

Countdown timer + match controls.

1. **Timer** — 10:00 countdown (uses `duration_seconds` from match, default 600)
2. **Start button** — calls `start_match(p_match_id)` to transition `pending → in_progress`
3. **End Match button** — navigates to results when timer hits 0 or manual end
4. **Match info** — match type badge (ranked/casual), opponent name

### Results Recording (`match/[id]/results/page.tsx`)

Record the outcome using `record_match_result()` RPC.

1. **Outcome selection** — Submission or Draw
2. **If submission**: select winner, pick submission type (from `submission_types` table), enter finish time
3. **Submit** — calls `record_match_result()` RPC
4. **Results display** — show outcome, ELO changes (for ranked), submission details
5. **Navigation** — "Back to Arena" / "View Match History"

### RPC contracts (see 005-backend-reference.md for full details)

```ts
// 1. Create match from accepted challenge
await supabase.rpc('start_match_from_challenge', { p_challenge_id })
// → { match_id, status: 'pending', already_exists }

// 2. Start the match (pending → in_progress)
await supabase.rpc('start_match', { p_match_id })
// → { success: true, match_id }

// 3. Record result
await supabase.rpc('record_match_result', {
  p_match_id, p_result: 'submission',
  p_winner_id, p_submission_type_code: 'rear_naked_choke',
  p_finish_time_seconds: 245
})
// → { success, match_id, result, elo_changes }

// 4. Get submission types for picker
await supabase.from('submission_types').select('code, display_name, category')
  .eq('status', 'active').order('sort_order')
```

### Error handling

All RPCs return structured errors with `hint` codes for programmatic handling:
- `not_participant` — user isn't in this match
- `invalid_status` — match isn't in expected state
- `missing_fields` — submission result missing required fields

---

## Step 13: Match History (Profile Enhancement)

Add match history to the profile using the `get_match_history()` RPC.

### Changes

| File | Change |
|------|--------|
| `profile/stats/page.tsx` | Add "Match History" tab using `get_match_history(p_athlete_id)` RPC |
| `match-card.tsx` | Extend to show submission type, finish time, opponent ELO at time |

### RPC response columns

`match_id`, `match_type`, `result`, `completed_at`, `opponent_id`, `opponent_display_name`, `athlete_outcome`, `submission_type_code`, `submission_type_display_name`, `finish_time_seconds`, `elo_before`, `elo_after`, `elo_delta`, `opponent_elo_at_time`

---

## Updated Dependency Graph (Steps 10+)

```
Step 10 (Setup Fix) — independent, fixes activation blocker
  └── All subsequent steps require athletes to be 'active'

Step 11 (Challenge Response) — depends on Step 7 (Pending Challenges)
  └── Step 12 (Match Flow) — depends on accepted challenges

Step 12 (Match Flow) — core gameplay
  └── Step 13 (Match History) — depends on completed matches existing

Step 13 (Match History) — profile enhancement
```

**Execution order:** 10 → 11 → 12 → 13

**Priority rationale:** Step 10 is the activation blocker — without it, new users can never become visible to others. Step 11 enables the challenge handshake. Step 12 is the main gameplay. Step 13 surfaces the data generated by matches.
