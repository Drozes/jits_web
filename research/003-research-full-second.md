# 003 — Full Screen & Layout Audit

**Source:** `outside_assets/FigmaMakeDemo/` (Figma Make export)
**Date:** 2026-02-13
**Scope:** Screen inventory, layout patterns, and icon mapping. Complements 001 (route/component architecture) and 002 (styling guide).

> This document focuses on what 001 and 002 don't cover in depth: a complete screen-by-screen inventory with demo component mappings, repeating layout patterns, and semantic icon usage. For route structure and component architecture, defer to 001. For colors, typography, spacing, and animations, defer to 002.

---

## 1. Route-Level Screens

The demo contains **14 distinct screens**, grouped by auth state and navigation depth.

### Public (unauthenticated)

| Screen       | Demo Component    | Description                                     |
| ------------ | ----------------- | ----------------------------------------------- |
| Landing Page | `LandingPage.tsx` | Marketing page (out of scope - different repo)  |
| Login/SignUp | `LoginScreen.tsx` | Auth screen with email/password + Google OAuth  |

### Authenticated — Tab-level (shown with bottom nav)

| Screen                 | Demo Component    | Route (per 001)       | Description                                              |
| ---------------------- | ----------------- | --------------------- | -------------------------------------------------------- |
| Dashboard (Home)       | `Dashboard.tsx`   | `(app)/page.tsx`      | User stats card, incoming challenges, past matches       |
| Leaderboard (Rankings) | `Leaderboard.tsx` | `(app)/leaderboard/`  | Athlete/Gym toggle, top-3 podium, full rankings list     |
| Arena                  | `Arena.tsx`       | `(app)/arena/`        | "Looking for match" toggle, nearby competitors, activity |
| Profile                | `Profile.tsx`     | `(app)/profile/`      | Editable profile, achievements, stats, settings          |

### Authenticated — Sub-screens (no bottom nav, back button)

| Screen             | Demo Component          | Route (per 001)            | Description                                        |
| ------------------ | ----------------------- | -------------------------- | -------------------------------------------------- |
| Competitor Profile | `CompetitorProfile.tsx` | `(app)/athlete/[id]/`      | View another athlete, challenge them, match history |
| Swipe Matches      | `SwipeMatches.tsx`      | `(app)/arena/swipe/`       | Tinder-style card swiping for opponent discovery    |
| Pending Challenges | `PendingChallenges.tsx` | `(app)/match/pending/`     | List of sent/received challenges                   |
| Accept Challenge   | `AcceptChallenge.tsx`   | `(app)/match/[id]/accept/` | Review and accept an incoming challenge             |
| Share Profile      | `ShareProfile.tsx`      | Sheet/modal from profile   | Shareable profile card (not a standalone route)     |
| View Stats         | `ViewStats.tsx`         | `(app)/profile/stats/`     | Detailed stats breakdown                           |
| Compare Stats      | `CompareStats.tsx`      | Modal from athlete/[id]    | Side-by-side stat comparison (modal, not a route)   |

### Authenticated — Match Flow (linear sequence, no bottom nav)

| Screen       | Demo Component    | Route (per 001)              | Description                                                |
| ------------ | ----------------- | ---------------------------- | ---------------------------------------------------------- |
| Match Lobby  | `MatchLobby.tsx`  | `(app)/match/[id]/lobby/`    | Pre-match: VS preview, ELO stakes, location, weight conf  |
| Live Match   | `ActiveMatch.tsx` | `(app)/match/[id]/live/`     | Countdown timer, pause/resume, match controls              |
| Post Match   | `PostMatch.tsx`   | `(app)/match/[id]/results/`  | Winner selection, finish method picker, ELO change summary |

---

## 2. Shared UI Primitives (demo source mapping)

This maps demo components to the three-layer architecture defined in 001.

### `components/layout/` — App Shell (per 001)

| Component          | Demo Source        | Notes                                                       |
| ------------------ | ------------------ | ----------------------------------------------------------- |
| `app-header.tsx`   | `AppHeader.tsx`    | Title bar with optional back button, icon, right action slot |
| `bottom-nav-bar.tsx` | `BottomNavBar.tsx` | Generic tab bar with badge support                         |
| `page-container.tsx` | (implicit)       | `max-w-md mx-auto px-4 pb-20` wrapper                      |

### `components/domain/` — BJJ-Specific (per 001)

| Component                | Demo Source              | Used In                                           |
| ------------------------ | ------------------------ | ------------------------------------------------- |
| `match-card.tsx`         | `MatchCard.tsx`          | Dashboard, CompetitorProfile, match lists         |
| `athlete-card.tsx`       | `AthleteCard.tsx`        | Leaderboard, search results                       |
| `competitor-list-item.tsx` | (pattern in Arena)     | Arena, challenge lists — avatar+ELO+distance      |
| `elo-badge.tsx`          | (repeated pattern)       | Arena, Swipe, CompetitorProfile, MatchLobby. Use CVA variants: `display`, `compact`, `stakes` |
| `challenge-modal.tsx`    | `ChallengeModal.tsx`     | CompetitorProfile, Arena — send challenge dialog  |
| `compare-stats-modal.tsx`| `CompareStats.tsx`       | CompetitorProfile — side-by-side comparison       |
| `versus-display.tsx`     | (pattern in match flow)  | VS layout with two fighter summaries              |
| `fighter-preview.tsx`    | (pattern in match flow)  | Avatar+name+ELO+weight for match screens          |
| `achievement-card.tsx`   | (pattern in Profile)     | Achievement grid item with gradient icon          |
| `activity-feed-item.tsx` | (pattern in Arena)       | Activity feed entries                             |
| `finish-method-picker.tsx` | (pattern in PostMatch) | Searchable combobox of BJJ submissions            |
| `tab-bar.tsx`            | `TabBar.tsx`             | App-specific nav config (Home/Rankings/Arena/Profile) |
| `belt-badge.tsx`         | (pattern in CompetitorProfile) | Colored badge based on belt rank            |
| `match-timer.tsx`        | (pattern in ActiveMatch) | 10-min countdown — start/pause/reset, pre-match beep |
| `post-match-form.tsx`    | (pattern in PostMatch)   | Result entry — W/L/D, finish method, duration     |
| `swipe-card.tsx`         | (pattern in SwipeMatches)| Swipeable competitor card for arena discovery      |
| `weight-verify.tsx`      | (pattern in AcceptChallenge) | Weight input + confirmation for match acceptance |
| `profile-header.tsx`     | (pattern in Profile)     | User summary — avatar, name, ELO, belt, gym       |
| `stat-overview.tsx`      | (pattern in Dashboard)   | Wins/losses/rate/streak stat block                 |

### `components/ui/` — shadcn/ui (per 001)

Keep existing shadcn/ui primitives. Add as needed: `avatar`, `dialog`, `progress`, `select`, `separator`, `sheet`, `tabs`, `toggle`, `tooltip`. See 001 Section 3 for the full list.

### What's NOT a component (per 001)

- **StatGrid** — the grid layout is just Tailwind (`grid grid-cols-2 gap-3`). The stat items are `<Card>` with a label and value. Don't extract unless three or more screens share identical structure.
- **EmptyState** — each screen's empty state has unique copy and icons. Use inline JSX unless three or more screens share the exact same pattern.
- **Notification panel** — appears only on the dashboard. Build inline first.
- **SectionHeader** — borderline. If you find yourself repeating the same title+icon+action pattern in 3+ places, extract it. Otherwise keep inline.

---

## 3. Repeated Layout Patterns

### Pattern A: "Tab Screen" layout

Used by: Dashboard, Leaderboard, Arena, Profile

```
┌─────────────────────────┐
│ AppHeader (title + icon) │
├─────────────────────────┤
│                         │
│  Scrollable content     │
│  with px-4 padding      │
│  and space-y-6 gaps     │
│                         │
├─────────────────────────┤
│ BottomNavBar (4 tabs)   │
└─────────────────────────┘
```

- `min-h-screen bg-background pb-20` on container
- `pb-20` accounts for fixed bottom nav
- Content wrapped in `page-container` (`max-w-md mx-auto px-4`)

### Pattern B: "Sub-screen" layout

Used by: CompetitorProfile, SwipeMatches, PendingChallenges, AcceptChallenge, ViewStats

```
┌─────────────────────────┐
│ AppHeader (back + title) │
├─────────────────────────┤
│                         │
│  Full-bleed hero or     │
│  colored header section │
│                         │
│  Content with px-4      │
│                         │
└─────────────────────────┘
```

- Back button in AppHeader
- No bottom nav
- Often has a colored hero section (e.g., CompetitorProfile's red bg-primary header)

### Pattern C: "Match Flow" layout

Used by: MatchLobby, ActiveMatch (live), PostMatch

```
┌─────────────────────────┐
│ Gradient Header          │
│ (primary -> accent)      │
│ icon + title + subtitle  │
├─────────────────────────┤
│                         │
│  Fighter VS Fighter     │
│  preview card            │
│                         │
│  Match-specific content │
│                         │
│  Primary CTA button     │
│  Secondary cancel       │
│                         │
└─────────────────────────┘
```

- Sticky gradient header (`bg-gradient-to-r from-primary to-accent`)
- VS preview with two avatars flanking a circular "VS" badge
- Full-width action buttons at bottom
- No bottom nav
- Shares a `match/layout.tsx` for the gradient header

### Pattern D: "Card List" section

Used by: Dashboard (challenges), Arena (nearby competitors), Leaderboard (rankings)

```
SectionHeader (icon + title + "View All")
┌─────────────────────────┐
│ Card item 1             │
├─────────────────────────┤
│ Card item 2             │
├─────────────────────────┤
│ Card item 3             │
└─────────────────────────┘
Button: "View All X Items"
```

- Title with icon and optional "View All" action link
- `space-y-3` card list
- Optional "View All" button below

### Pattern E: "ELO Stakes" display

Used by: Arena competitor cards, SwipeMatches cards, CompetitorProfile, MatchLobby

```
┌─────────────────────────┐
│ ELO Stakes (+diff):     │
│ ┌─────────┐ ┌─────────┐│
│ │  +win   │ │  -loss  ││
│ └─────────┘ └─────────┘│
│ "Higher risk, reward!"  │
└─────────────────────────┘
```

- Green box for win, red box for loss
- `TrendingUp` / `TrendingDown` icons
- Contextual message based on ELO difference
- This is a single `elo-badge.tsx` component with a `stakes` variant (see 001)

### Pattern F: "Stat Row" (3-column)

Used by: Profile, CompetitorProfile, SwipeMatches

```
┌────────┬────────┬────────┐
│  Wins  │ Losses │Win Rate│
│   45   │   12   │  79%   │
└────────┴────────┴────────┘
```

- `grid grid-cols-3 gap-4 text-center`
- Bold value on top, muted label below
- Inline Tailwind, not a separate component (see "What's NOT a component" above)

---

## 4. Icon Mapping (lucide-react)

### Navigation

| Icon                       | Usage                    |
| -------------------------- | ------------------------ |
| `Home`                     | Dashboard tab            |
| `Trophy`                   | Rankings tab             |
| `Search`                   | Arena tab                |
| `User`                     | Profile tab              |
| `ChevronRight` (rotated)  | Back navigation          |
| `ArrowLeft`                | Alternative back nav     |

### Domain

| Icon                          | Usage                         |
| ----------------------------- | ----------------------------- |
| `Swords`                      | Match/challenge contexts      |
| `Target`                      | Challenge action, submissions |
| `Trophy`                      | ELO, achievements, rankings   |
| `TrendingUp` / `TrendingDown` | ELO gain/loss                |
| `MapPin`                      | Location/distance             |
| `Clock`                       | Time, timestamps, duration    |
| `Heart`                       | Like/match in swipe mode      |
| `Zap`                         | Swipe mode CTA ("Tinder mode")|
| `Crown` / `Medal`            | Podium ranks (1st, 2nd/3rd)   |
| `Scale`                       | Weight comparison              |
| `Activity`                    | Recent activity feed           |
| `Users`                       | Match lobby, team contexts     |
| `Award`                       | Post-match results             |
| `Play` / `Pause`             | Match timer controls           |
| `Bell`                        | Match buzzer                   |
| `CheckCircle`                 | Confirmations, ready states    |

### Badge Variants (visual reference)

| State    | Classes                                              |
| -------- | ---------------------------------------------------- |
| Ranked   | `bg-orange-500/10 text-orange-700 border-orange-200` |
| Casual   | `bg-green-500/10 text-green-700 border-green-200`    |
| LIVE     | `bg-red-600 text-white animate-pulse` (destructive)  |
| Upcoming | `bg-blue-100 text-blue-700`                          |
| Finished | `text-gray-500 border-gray-200` (outline)            |

### Belt Color Map

| Belt         | Classes                          |
| ------------ | -------------------------------- |
| White Belt   | `bg-gray-100 text-gray-800`     |
| Blue Belt    | `bg-blue-100 text-blue-800`     |
| Purple Belt  | `bg-purple-100 text-purple-800` |
| Brown Belt   | `bg-amber-100 text-amber-800`   |
| Black Belt   | `bg-gray-800 text-white`        |

---

## 5. Style Guide

> **See [002-research-styling-guide.md](002-research-styling-guide.md)** for the authoritative style guide including color tokens (HSL), typography scale, spacing conventions, animations, gradients, and migration checklist.

This section is intentionally omitted to avoid duplication and conflicting values. 002 is the source of truth for all styling decisions.
