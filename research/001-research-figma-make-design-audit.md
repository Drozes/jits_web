# 001 — Figma Make Design Audit

**Source:** `outside_assets/FigmaMakeDemo/` (Figma Make export of [Jits Rework](https://www.figma.com/design/1OZUD2lqcgY16PMCupXbbQ/Jits-Rework))
**Date:** 2026-02-13
**Scope:** Visual UI specification only — no code changes proposed.

> The logged-out marketing homepage was intentionally excluded from this audit.

---

## 1. Route-Level Screens

The design contains **10 distinct route-level screens**:

| Screen | Description |
|--------|-------------|
| **Login / Sign Up** | Email + password auth, Google OAuth, demo login, sign-up toggle |
| **Dashboard (Home)** | User summary, stat grid (W/L/Win%/Streak), pending challenges, past matches |
| **Leaderboard** | Athlete vs Gym toggle, top-10 rankings, filter by belt/location |
| **Arena (Explore)** | Nearby competitors with distance, belt, ELO; filter/search; recent activity |
| **Swipe Matches** | Tinder-style card swiping to challenge or pass on opponents |
| **Profile** | Current user's profile, editable display name/gym/weight/location, recent matches |
| **View Stats** | Tabbed deep stats — Overview, Performance, Submissions, Opponents, Time Analysis |
| **Share Profile** | Shareable URL, copy link, social sharing (Twitter/IG/WhatsApp), QR placeholder |
| **Competitor Profile** | Opponent detail view with stats, ELO comparison, challenge button, compare modal |
| **Match Flow** | Multi-step: Pending → Accept (weight verify) → Lobby → Active Timer → Post-Match Results |

---

## 2. Shared UI Primitives

### Already in the codebase (shadcn/ui)

`button`, `input`, `card`, `label`, `badge`, `checkbox`, `dropdown-menu`

### New primitives needed from the design

| Primitive | Usage |
|-----------|-------|
| **Avatar** (with gradient border + fallback) | Profile images everywhere — dashboard, leaderboard, arena, cards |
| **Tabs** | Leaderboard (Athlete/Gym), View Stats (5 tabs), Arena filters |
| **Dialog / Modal** | Challenge modal, Compare Stats modal, Edit Profile |
| **Sheet / Drawer** | Notification panel, mobile actions |
| **Select / Combobox** | Finish method (22+ options), filter dropdowns |
| **Progress** | Stat bars, win rate visualizations |
| **Separator** | "or" divider on login, section dividers |
| **Switch / Toggle** | Match type (Ranked/Casual), leaderboard mode |
| **Textarea** | Decline note, bio editing |
| **Tooltip** | Stat explanations, ELO info |
| **Carousel** (Embla) | Swipe match cards |

---

## 3. Proposed Next.js Route Structure

```
app/
├── (auth)/
│   ├── login/page.tsx            ← exists
│   ├── signup/page.tsx           ← exists
│   ├── signup-success/page.tsx   ← exists
│   ├── forgot-password/page.tsx  ← exists
│   ├── update-password/page.tsx  ← exists
│   ├── error/page.tsx            ← exists
│   └── confirm/route.ts         ← exists
│
├── (app)/
│   ├── layout.tsx                ← add BottomNavBar here
│   ├── page.tsx                  ← Dashboard/Home (exists)
│   │
│   ├── leaderboard/
│   │   └── page.tsx              ← NEW: rankings (athlete + gym tabs)
│   │
│   ├── arena/
│   │   ├── page.tsx              ← rename from challenges/ — explore/search opponents
│   │   └── swipe/page.tsx        ← NEW: tinder-style match discovery
│   │
│   ├── profile/
│   │   ├── page.tsx              ← exists — current user profile
│   │   ├── stats/page.tsx        ← NEW: detailed stats tabs
│   │   └── share/page.tsx        ← NEW: share profile screen
│   │
│   ├── athlete/
│   │   └── [id]/page.tsx         ← NEW: competitor profile + compare modal
│   │
│   └── match/
│       ├── pending/page.tsx      ← NEW: pending challenges list
│       ├── [id]/
│       │   ├── accept/page.tsx   ← NEW: accept challenge + weight verify
│       │   ├── lobby/page.tsx    ← NEW: pre-match lobby (VS screen)
│       │   ├── live/page.tsx     ← NEW: active match timer
│       │   └── results/page.tsx  ← NEW: post-match result entry
│       └── layout.tsx            ← shared match flow header
```

### Key changes from current structure

- `challenges/` → `arena/` (broader concept: discovery + challenges)
- `gyms/` stays or folds into leaderboard gym tab depending on its current scope
- `match/[id]/` uses nested routes for the multi-step match flow
- `athlete/[id]` for viewing any competitor's profile

---

## 4. Separation: `/ui` vs `/domain` Components

### `components/ui/` — Generic, reusable, zero domain knowledge

| Component | Notes |
|-----------|-------|
| `avatar.tsx` | With gradient border variant + fallback |
| `badge.tsx` | Exists |
| `bottom-nav-bar.tsx` | 4-tab nav (icon + label + badge count) |
| `button.tsx` | Exists |
| `card.tsx` | Exists (add `premium-card` variant) |
| `carousel.tsx` | Embla wrapper |
| `checkbox.tsx` | Exists |
| `dialog.tsx` | Modal primitive |
| `dropdown-menu.tsx` | Exists |
| `empty-state.tsx` | Icon + message + optional CTA |
| `input.tsx` | Exists (add icon slot variant) |
| `label.tsx` | Exists |
| `progress.tsx` | Progress bar |
| `select.tsx` | Combobox / command palette |
| `separator.tsx` | Divider line |
| `sheet.tsx` | Slide-in drawer |
| `stat-grid.tsx` | Generic grid of stat items |
| `tabs.tsx` | Tab switcher |
| `textarea.tsx` | Multiline input |
| `toggle.tsx` | Toggle switch |
| `tooltip.tsx` | Hover info |

### `components/domain/` — BJJ/Jits-specific, composed from `ui/`

| Component | Notes |
|-----------|-------|
| `athlete-card.tsx` | Competitor card (avatar, ELO, belt, distance) |
| `belt-badge.tsx` | Colored belt level indicator |
| `challenge-modal.tsx` | Send challenge dialog (match type, location) |
| `compare-stats-modal.tsx` | Side-by-side ELO/stat comparison |
| `elo-display.tsx` | ELO rating with rank + trend arrow |
| `elo-stakes.tsx` | Potential ELO gain/loss preview |
| `match-card.tsx` | Match history entry (result, method, ELO delta) |
| `match-timer.tsx` | 10-min countdown with start/pause/reset |
| `notification-panel.tsx` | Challenge/match/system notification list |
| `post-match-form.tsx` | Result entry (W/L/D, method, duration) |
| `profile-header.tsx` | User profile summary (avatar, name, ELO, belt) |
| `rank-badge.tsx` | Leaderboard position indicator |
| `stat-overview.tsx` | Wins/losses/rate/streak stat block |
| `submission-select.tsx` | 22+ finish method combobox |
| `swipe-card.tsx` | Swipeable competitor card for arena/swipe |
| `versus-display.tsx` | VS screen with two fighters |
| `weight-verify.tsx` | Weight input + confirmation for match accept |

### Separation principle

- **`/ui`** — No imports from `lib/supabase`, no domain types, no business logic. Styled with Tailwind + CVA variants. Could be extracted to a standalone package.
- **`/domain`** — Imports domain types (Athlete, Match, Challenge, ELO). Composes `ui/` primitives. Contains BJJ-specific presentation logic (belt colors, ELO calculations, submission lists, match flow state).

---

## Appendix: Design Tokens

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#d20a0a` | Brand red — buttons, accents, active states |
| Primary Foreground | `#ffffff` | Text on primary |
| Background | `#f8f9fa` (light) / `#0a0a0a` (dark) | Page background |
| Card | `#ffffff` (light) / `#151515` (dark) | Card surfaces |
| Foreground | `#1a1a1a` | Primary text |
| Muted | `#e9ecef` (light) / `#2a2a2a` (dark) | Subtle backgrounds |
| Muted Foreground | `#6c757d` / `#a1a1a1` | Secondary text |
| Border | `rgba(0,0,0,0.08)` / `rgba(255,255,255,0.1)` | Borders |
| Destructive | `#dc2626` | Delete/danger actions |
| Logo Gold | `#f59e0b` | Accent highlights |
| Logo Orange | `#f97316` | Fire/streak accents |

### Typography

- **Font:** Inter (system-ui fallback)
- **Weights:** 400, 600, 700, 900
- **Scale:** 10.5px (small) → 14px (body) → 28px (H1)

### Animations

| Name | Duration | Usage |
|------|----------|-------|
| `pulse-red` | 2s | Active status indicators |
| `slide-in-left/right` | 0.5s | Screen transitions |
| `fade-in-up` | 0.6s | List item entrances |
| `glow-pulse` | 2s | Champion/rank highlights |
| `fire-pulse` | 2s | Streak indicators |
| `gradient` | 3s | Animated gradient backgrounds |

### Bottom Navigation

4 tabs: **Home** (Home icon) · **Rankings** (Trophy) · **Arena** (Search) · **Profile** (User)
Active state: primary color highlight + icon scale effect + badge counter support.
