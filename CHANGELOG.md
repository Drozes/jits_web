# Changelog

## [Unreleased]

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
