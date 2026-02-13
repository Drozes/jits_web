# 001 — Figma Make Design Audit

**Source:** `outside_assets/FigmaMakeDemo/` (Figma Make export of [Jits Rework](https://www.figma.com/design/1OZUD2lqcgY16PMCupXbbQ/Jits-Rework))
**Date:** 2026-02-13
**Scope:** Screen inventory, route structure, component architecture, layout patterns, and icon mapping. For colors, typography, spacing, and animations, see [002-research-styling-guide.md](002-research-styling-guide.md).

> The logged-out marketing homepage is excluded from this audit (different repo).

---

## 1. Route-Level Screens

The demo contains **14 distinct screens**, grouped by auth state and navigation depth.

### Public (unauthenticated)

| Screen       | Demo Component    | Description                                    |
| ------------ | ----------------- | ---------------------------------------------- |
| Landing Page | `LandingPage.tsx` | Marketing page (out of scope — different repo) |
| Login/SignUp | `LoginScreen.tsx` | Auth screen with email/password + Google OAuth |

### Authenticated — Tab-level (shown with bottom nav)

| Screen                 | Demo Component    | Route                 | Description                                              |
| ---------------------- | ----------------- | --------------------- | -------------------------------------------------------- |
| Dashboard (Home)       | `Dashboard.tsx`   | `(app)/page.tsx`      | User stats card, incoming challenges, past matches       |
| Leaderboard (Rankings) | `Leaderboard.tsx` | `(app)/leaderboard/`  | Athlete/Gym toggle, top-3 podium, full rankings list     |
| Arena                  | `Arena.tsx`       | `(app)/arena/`        | "Looking for match" toggle, nearby competitors, activity |
| Profile                | `Profile.tsx`     | `(app)/profile/`      | Editable profile, achievements, stats, settings          |

### Authenticated — Sub-screens (no bottom nav, back button)

| Screen             | Demo Component          | Route                      | Description                                        |
| ------------------ | ----------------------- | -------------------------- | -------------------------------------------------- |
| Competitor Profile | `CompetitorProfile.tsx` | `(app)/athlete/[id]/`      | View another athlete, challenge them, match history |
| Swipe Matches      | `SwipeMatches.tsx`      | `(app)/arena/swipe/`       | Tinder-style card swiping for opponent discovery    |
| Pending Challenges | `PendingChallenges.tsx` | `(app)/match/pending/`     | List of sent/received challenges                   |
| Accept Challenge   | `AcceptChallenge.tsx`   | `(app)/match/[id]/accept/` | Review and accept an incoming challenge             |
| View Stats         | `ViewStats.tsx`         | `(app)/profile/stats/`     | Detailed stats breakdown                           |
| Share Profile      | `ShareProfile.tsx`      | Sheet/modal from profile   | Shareable profile card (not a standalone route)     |
| Compare Stats      | `CompareStats.tsx`      | Modal from athlete/[id]    | Side-by-side stat comparison (modal, not a route)   |

### Authenticated — Match Flow (linear sequence, no bottom nav)

| Screen      | Demo Component    | Route                        | Description                                               |
| ----------- | ----------------- | ---------------------------- | --------------------------------------------------------- |
| Match Lobby | `MatchLobby.tsx`  | `(app)/match/[id]/lobby/`    | Pre-match: VS preview, ELO stakes, location, weight conf |
| Live Match  | `ActiveMatch.tsx` | `(app)/match/[id]/live/`     | Countdown timer, pause/resume, match controls             |
| Post Match  | `PostMatch.tsx`   | `(app)/match/[id]/results/`  | Winner selection, finish method picker, ELO change summary|

---

## 2. Next.js Route Structure

```
app/
├── (auth)/
│   ├── login/page.tsx              ← exists
│   ├── signup/page.tsx             ← exists
│   ├── signup-success/page.tsx     ← exists
│   ├── forgot-password/page.tsx    ← exists
│   ├── update-password/page.tsx    ← exists
│   ├── error/page.tsx              ← exists
│   └── confirm/route.ts            ← exists
│
├── (app)/
│   ├── layout.tsx                  ← add BottomNavBar + mobile container here
│   ├── page.tsx                    ← Dashboard/Home (exists)
│   │
│   ├── leaderboard/
│   │   └── page.tsx                ← NEW: rankings (athlete + gym tabs)
│   │
│   ├── arena/
│   │   ├── page.tsx                ← rename from challenges/ — explore/search
│   │   └── swipe/page.tsx          ← NEW: tinder-style match discovery
│   │
│   ├── profile/
│   │   ├── page.tsx                ← exists — current user profile
│   │   └── stats/page.tsx          ← NEW: detailed stats tabs
│   │
│   ├── athlete/
│   │   └── [id]/page.tsx           ← NEW: competitor profile + compare modal
│   │
│   └── match/
│       ├── pending/page.tsx        ← NEW: pending challenges list
│       ├── [id]/
│       │   ├── accept/page.tsx     ← NEW: accept challenge + weight verify
│       │   ├── lobby/page.tsx      ← NEW: pre-match lobby (VS screen)
│       │   ├── live/page.tsx       ← NEW: active match timer
│       │   └── results/page.tsx    ← NEW: post-match result entry
│       └── layout.tsx              ← shared match flow header
```

### Decisions

- **`challenges/` → `arena/`** — broader concept: discovery + challenges.
- **`gyms/`** — folds into leaderboard gym tab unless it has independent purpose.
- **`match/[id]/`** — nested routes for the multi-step match flow.
- **`athlete/[id]`** — any competitor's public profile.
- **Share Profile** — a `<Sheet>` triggered from `profile/page.tsx`, not its own route.
- **Compare Stats** — a `<Dialog>` triggered from `athlete/[id]/page.tsx`, not its own route.

---

## 3. Component Architecture

### Layer Definitions

| Layer | Path | Rule | Test |
|-------|------|------|------|
| **ui** | `components/ui/` | Zero domain knowledge. No imports from `lib/supabase`, `types/`, or domain logic. Styled with Tailwind + CVA variants. | "Could this live in a generic component library?" |
| **domain** | `components/domain/` | BJJ/Jits-specific. Imports domain types. Composes `ui/` primitives. Contains presentation logic (belt colors, ELO math, submission lists). | "Does this know what an Athlete or Match is?" |
| **layout** | `components/layout/` | App shell concerns — navigation, page wrappers, responsive containers. Neither generic UI nor domain-specific. | "Is this about where things go, not what they show?" |

### `components/ui/` — shadcn/ui Primitives

Install via `npx shadcn@latest add <name>`.

| Component | Status | Notes |
|-----------|--------|-------|
| `avatar.tsx` | New | Add gradient-border variant via CVA |
| `badge.tsx` | Exists | — |
| `button.tsx` | Exists | — |
| `card.tsx` | Exists | Add `variant="interactive"` via CVA (see 002 Section 3) |
| `carousel.tsx` | New | Embla wrapper (shadcn has one) |
| `checkbox.tsx` | Exists | — |
| `dialog.tsx` | New | Modal primitive |
| `dropdown-menu.tsx` | Exists | — |
| `input.tsx` | Exists | Add leading-icon slot via CVA variant |
| `label.tsx` | Exists | — |
| `progress.tsx` | New | Progress bar |
| `select.tsx` | New | Combobox / command palette |
| `separator.tsx` | New | Divider line |
| `sheet.tsx` | New | Slide-in drawer |
| `tabs.tsx` | New | Tab switcher |
| `textarea.tsx` | New | Multiline input |
| `toggle.tsx` | New | Toggle switch |
| `tooltip.tsx` | New | Hover info |

### `components/layout/` — App Shell

| Component            | Demo Source        | Notes                                                       |
| -------------------- | ------------------ | ----------------------------------------------------------- |
| `app-header.tsx`     | `AppHeader.tsx`    | Title bar with optional back button, icon, right action slot |
| `bottom-nav-bar.tsx` | `BottomNavBar.tsx` | 4-tab fixed nav with active state + badge count             |
| `page-container.tsx` | (implicit)         | `max-w-md mx-auto px-4 pb-20` wrapper                      |

### `components/domain/` — BJJ-Specific

| Component                  | Demo Source                        | Used In                                                    |
| -------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `athlete-card.tsx`         | `AthleteCard.tsx`                  | Leaderboard, search results                                |
| `belt-badge.tsx`           | (pattern in CompetitorProfile)     | Colored badge based on belt rank                           |
| `challenge-modal.tsx`      | `ChallengeModal.tsx`               | CompetitorProfile, Arena — send challenge dialog           |
| `compare-stats-modal.tsx`  | `CompareStats.tsx`                 | CompetitorProfile — side-by-side comparison                |
| `elo-badge.tsx`            | (repeated pattern)                 | Arena, Swipe, CompetitorProfile, MatchLobby. CVA variants: `display`, `compact`, `stakes` |
| `match-card.tsx`           | `MatchCard.tsx`                    | Dashboard, CompetitorProfile, match lists                  |
| `match-timer.tsx`          | (pattern in ActiveMatch)           | 10-min countdown — start/pause/reset, pre-match beep      |
| `post-match-form.tsx`      | (pattern in PostMatch)             | Result entry — W/L/D, finish method, duration              |
| `profile-header.tsx`       | (pattern in Profile)               | User summary — avatar, name, ELO, belt, gym               |
| `stat-overview.tsx`        | (pattern in Dashboard)             | Wins/losses/rate/streak stat block                         |
| `swipe-card.tsx`           | (pattern in SwipeMatches)          | Swipeable competitor card for arena discovery              |
| `versus-display.tsx`       | (pattern in match flow)            | VS layout with two fighter summaries                       |
| `weight-verify.tsx`        | (pattern in AcceptChallenge)       | Weight input + confirmation for match acceptance           |
| `competitor-list-item.tsx` | (pattern in Arena)                 | Arena, challenge lists — avatar+ELO+distance               |
| `fighter-preview.tsx`      | (pattern in match flow)            | Avatar+name+ELO+weight for match screens                   |
| `achievement-card.tsx`     | (pattern in Profile)               | Achievement grid item with gradient icon                   |
| `activity-feed-item.tsx`   | (pattern in Arena)                 | Activity feed entries                                      |
| `finish-method-picker.tsx` | (pattern in PostMatch)             | Searchable combobox of BJJ submissions                     |
| `tab-bar.tsx`              | `TabBar.tsx`                       | App-specific nav config (Home/Rankings/Arena/Profile)      |

> **ELO consolidation:** The Figma export has separate presentations for "ELO with rank", "ELO with trend arrow", and "potential ELO gain/loss". These are variants of the same data, not separate components. Use a single `elo-badge.tsx` with a `variant` prop (`display | compact | stakes`).

### What's NOT a component

Some patterns should stay inline in their route pages rather than being extracted prematurely:

- **StatGrid** — the grid layout is just Tailwind (`grid grid-cols-2 gap-3`). The stat items are `<Card>` with a label and value. Don't extract unless 3+ screens share identical structure.
- **EmptyState** — each screen's empty state has unique copy and icons. Use inline JSX unless 3+ screens share the exact same pattern.
- **Notification panel** — appears only on the dashboard. Build inline first; extract only if reused.
- **SectionHeader** — borderline. If repeating the same title+icon+action pattern in 3+ places, extract it. Otherwise keep inline.

---

## 4. Layout Patterns

### Pattern A: "Tab Screen"

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

### Pattern B: "Sub-screen"

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

### Pattern C: "Match Flow"

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
- This is `elo-badge.tsx` with the `stakes` variant

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
- Inline Tailwind, not a separate component (see "What's NOT a component")

---

## 5. Icon Mapping (lucide-react)

### Navigation

| Icon                      | Usage                |
| ------------------------- | -------------------- |
| `Home`                    | Dashboard tab        |
| `Trophy`                  | Rankings tab         |
| `Search`                  | Arena tab            |
| `User`                    | Profile tab          |
| `ChevronRight` (rotated) | Back navigation      |
| `ArrowLeft`               | Alternative back nav |

### Domain

| Icon                          | Usage                        |
| ----------------------------- | ---------------------------- |
| `Swords`                      | Match/challenge contexts     |
| `Target`                      | Challenge action, submissions|
| `Trophy`                      | ELO, achievements, rankings  |
| `TrendingUp` / `TrendingDown` | ELO gain/loss               |
| `MapPin`                      | Location/distance            |
| `Clock`                       | Time, timestamps, duration   |
| `Heart`                       | Like/match in swipe mode     |
| `Zap`                         | Swipe mode CTA              |
| `Crown` / `Medal`            | Podium ranks (1st, 2nd/3rd)  |
| `Scale`                       | Weight comparison            |
| `Activity`                    | Recent activity feed         |
| `Users`                       | Match lobby, team contexts   |
| `Award`                       | Post-match results           |
| `Play` / `Pause`             | Match timer controls         |
| `Bell`                        | Match buzzer                 |
| `CheckCircle`                 | Confirmations, ready states  |

### Badge Variants (visual reference)

| State    | Classes                                              |
| -------- | ---------------------------------------------------- |
| Ranked   | `bg-orange-500/10 text-orange-700 border-orange-200` |
| Casual   | `bg-green-500/10 text-green-700 border-green-200`    |
| LIVE     | `bg-red-600 text-white animate-pulse` (destructive)  |
| Upcoming | `bg-blue-100 text-blue-700`                          |
| Finished | `text-gray-500 border-gray-200` (outline)            |

### Belt Color Map

| Belt        | Classes                          |
| ----------- | -------------------------------- |
| White Belt  | `bg-gray-100 text-gray-800`     |
| Blue Belt   | `bg-blue-100 text-blue-800`     |
| Purple Belt | `bg-purple-100 text-purple-800` |
| Brown Belt  | `bg-amber-100 text-amber-800`   |
| Black Belt  | `bg-gray-800 text-white`        |

---

## 6. Style Guide

> **See [002-research-styling-guide.md](002-research-styling-guide.md)** for the authoritative style guide including color tokens (HSL), typography scale, spacing conventions, animations, gradients, and migration checklist.

This section is intentionally omitted to avoid duplication. 002 is the source of truth for all styling decisions.
