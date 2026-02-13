# 001 — Figma Make Design Audit

**Source:** `outside_assets/FigmaMakeDemo/` (Figma Make export of [Jits Rework](https://www.figma.com/design/1OZUD2lqcgY16PMCupXbbQ/Jits-Rework))
**Date:** 2026-02-13
**Scope:** Visual UI specification only — no code changes proposed.

> The logged-out marketing homepage was intentionally excluded from this audit.

---

## 1. Route-Level Screens

The design contains **10 distinct screens**:

| Screen | Description |
|--------|-------------|
| **Login / Sign Up** | Email + password auth, Google OAuth, demo login, sign-up toggle |
| **Dashboard (Home)** | User summary, stat grid (W/L/Win%/Streak), pending challenges, past matches |
| **Leaderboard** | Athlete vs Gym toggle, top-10 rankings, filter by belt/location |
| **Arena (Explore)** | Nearby competitors with distance, belt, ELO; filter/search; recent activity |
| **Swipe Matches** | Tinder-style card swiping to challenge or pass on opponents |
| **Profile** | Current user's profile, editable display name/gym/weight/location, recent matches |
| **View Stats** | Tabbed deep stats — Overview, Performance, Submissions, Opponents, Time Analysis |
| **Competitor Profile** | Opponent detail view with stats, ELO comparison, challenge button |
| **Match Flow** | Multi-step: Pending → Accept (weight verify) → Lobby → Active Timer → Post-Match Results |
| **Share Profile** | Shareable URL, copy link, social sharing — likely a sheet/modal, not a standalone route |

---

## 2. Proposed Next.js Route Structure

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
- **Share Profile** — a `<Sheet>` triggered from `profile/page.tsx`, not its own route. It's a quick action (copy link, tap social icon), not a destination.

---

## 3. Component Architecture

### Layer Definitions

| Layer | Path | Rule | Test |
|-------|------|------|------|
| **ui** | `components/ui/` | Zero domain knowledge. No imports from `lib/supabase`, `types/`, or domain logic. Styled with Tailwind + CVA variants. | "Could this live in a generic component library?" |
| **domain** | `components/domain/` | BJJ/Jits-specific. Imports domain types. Composes `ui/` primitives. Contains presentation logic (belt colors, ELO math, submission lists). | "Does this know what an Athlete or Match is?" |
| **layout** | `components/layout/` | App shell concerns — navigation, page wrappers, responsive containers. Neither generic UI nor domain-specific. | "Is this about where things go, not what they show?" |

### `components/ui/` — Generic Primitives

These are (or will be) shadcn/ui components. Install via `npx shadcn@latest add <name>`.

| Component | Status | Notes |
|-----------|--------|-------|
| `avatar.tsx` | New | Add gradient-border variant via CVA |
| `badge.tsx` | Exists | — |
| `button.tsx` | Exists | — |
| `card.tsx` | Exists | — |
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

### `components/domain/` — BJJ-Specific

| Component | Responsibility |
|-----------|---------------|
| `athlete-card.tsx` | Competitor card — avatar, ELO, belt, distance, gym |
| `belt-badge.tsx` | Colored belt level indicator (white → black) |
| `challenge-modal.tsx` | Send challenge dialog — match type, location, ELO stakes |
| `compare-stats-modal.tsx` | Side-by-side stat comparison between two athletes |
| `elo-badge.tsx` | ELO rating display — current value, rank position, trend arrow, potential stakes. Single component handles all ELO presentation.* |
| `match-card.tsx` | Match history entry — result, method, opponent, ELO delta |
| `match-timer.tsx` | 10-min countdown — start/pause/reset, pre-match beep |
| `post-match-form.tsx` | Result entry — W/L/D, finish method (22+ options), duration |
| `profile-header.tsx` | User summary — avatar, name, ELO, belt, gym |
| `stat-overview.tsx` | Wins/losses/rate/streak stat block |
| `swipe-card.tsx` | Swipeable competitor card for arena discovery |
| `versus-display.tsx` | VS screen with two fighter summaries |
| `weight-verify.tsx` | Weight input + confirmation for match acceptance |

> *Consolidation: The Figma export has separate presentations for "ELO with rank", "ELO with trend arrow", and "potential ELO gain/loss". These are variants of the same data, not separate components. Use a single `elo-badge.tsx` with a `variant` prop (`display | compact | stakes`).

### `components/layout/` — App Shell

| Component | Responsibility |
|-----------|---------------|
| `bottom-nav-bar.tsx` | 4-tab fixed nav — Home, Rankings, Arena, Profile. Active state + badge count. |
| `app-header.tsx` | Top bar — back button, title, right action slot |
| `page-container.tsx` | `max-w-md mx-auto px-4 pb-20` wrapper (mobile container + nav clearance) |

### What's NOT a component

Some Figma screens show patterns that should stay inline in their route pages rather than being extracted prematurely:

- **Empty states** — each screen's empty state has unique copy and icons. Use inline JSX, not a generic `<EmptyState>` component, unless three or more screens share the exact same pattern.
- **Notification panel** — appears only on the dashboard. Build inline first; extract only if reused.
- **Stat grid** — the grid layout (`grid grid-cols-2 gap-3`) is Tailwind, not a component. The stat *items* are just `<Card>` with a label and value.
