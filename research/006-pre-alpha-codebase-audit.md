# 006 — Pre-Alpha Codebase Audit

**Date:** 2026-02-14
**Scope:** Architecture, design patterns, code standards, test health, configuration

---

## Summary

Five parallel audits covering component structure, types/data, duplication, routing/auth/a11y, and tests/config. The codebase has strong fundamentals (Suspense patterns, server/client separation, type safety, auth guards) but gaps in error handling, test coverage, and enforcement tooling that should be addressed before building more features.

---

## Critical — Fix Before Building More

### 1. No error boundaries anywhere

- Zero `error.tsx` files in the entire app. If a Supabase query fails or an RPC throws, users see the raw Next.js error page.
- Need at minimum: `app/error.tsx`, `app/(app)/error.tsx`, and `app/(app)/athlete/error.tsx`.

### 2. No `not-found.tsx` pages

- `/athlete/[id]` correctly calls `notFound()` but there's no custom 404 page to catch it. Users hit the default Next.js 404.

### 3. E2E tests are broken

- All 6 Playwright tests fail with `net::ERR_ABORTED` / timeout. The dev server isn't starting properly during test runs.

### 4. Test coverage is ~2%

- Only 2 unit test files (6 tests) covering `bottom-nav-bar` and `page-container`.
- Zero tests for: all domain components, all forms, guards, utilities (`computeStats`, `computeWinStreak`, `extractGymName`), and all page routes.

### 5. No git hooks enforcing quality checks

- CLAUDE.md documents `tsc --noEmit`, `next build`, `npm test` before every commit, but nothing enforces this. No husky, no lint-staged, no pre-commit hooks at all.

---

## High — Architectural Debt

### 6. Three components far exceed size limits

| File | Lines | Target |
|------|-------|--------|
| `components/profile/editable-profile-header.tsx` | 385 | 80 |
| `components/domain/challenge-response-sheet.tsx` | 293 | 80 |
| `app/(app)/arena/swipe/swipe-discovery-client.tsx` | 281 | 80 |

`editable-profile-header` has 5 inline sub-components (NameField, GymField, WeightField, SaveCancelButtons, SuccessState) that should be extracted to separate files.

### 7. Missing Suspense fallbacks on 3 pages

- Dashboard (`/`), Arena, and Leaderboard wrap async content in `<Suspense>` but provide **no fallback prop** — users see a blank void while data loads.

### 8. Client-side initial data fetch violation

- `app/(app)/profile/setup/setup-form.tsx` fetches gyms in a `useEffect` instead of receiving them as a server-fetched prop. This violates the CLAUDE.md rule: "Never fetch Supabase data in client components for initial loads."

### 9. `as unknown` type casts bypassing safety

- `app/(app)/match/pending/pending-challenges-content.tsx` and `app/(app)/athlete/[id]/athlete-profile-content.tsx` use `as unknown as Array<...>` to cast FK join results. Should use proper type definitions.

### 10. 4 ESLint errors in main code

- Unused variable `opacity` in swipe-discovery-client
- Unused variable `gyms` in leaderboard page
- Unused import `Badge` in challenge-sheet
- Plus 30+ warnings in `outside_assets/` (should be excluded from linting)

---

## Medium — Code Quality & Consistency

### 11. Duplicated date formatting — 3 separate implementations

- `formatRelativeDate()` in `components/domain/match-card.tsx`
- `timeAgo()` in `app/(app)/arena/arena-content.tsx`
- `formatTimeLeft()` in `components/domain/expiry-badge.tsx`
- Should extract to `lib/utils.ts`.

### 12. Duplicated ELO stakes display

- `components/domain/challenge-sheet.tsx` and `components/domain/challenge-response-sheet.tsx` have nearly identical ELO stakes preview UI (~50 lines each). Extract to shared `elo-stakes-preview.tsx`.

### 13. Auth form duplication (~70% overlap)

- `login-form`, `sign-up-form`, `forgot-password-form` share Card wrapper, error state, loading state, email input. Already noted as tech debt in CLAUDE.md but worth addressing before more auth work.

### 14. Magic strings scattered

- Status values (`"casual"`, `"ranked"`, `"pending"`, `"accepted"`), match results (`"win"`, `"loss"`, `"draw"`), and routes are string literals throughout. Consider a `lib/constants.ts`.

### 15. Missing composite types

- No `AthleteWithStats` or `ChallengeWithChallenger` types for common joined query shapes. Props get verbose and inconsistent.

### 16. Misleading function name

- `components/update-password-form.tsx` — `handleForgotPassword` should be `handleUpdatePassword`.

---

## Low — Nice to Have Before Alpha

### 17. Accessibility gaps

- Only 1 `aria-label` in the entire codebase (back button).
- Swipe UI has no keyboard alternative.
- Color-only indicators (green dot for "looking for match") with no text fallback.

### 18. No per-page metadata

- Only root `<title>` "Jits" — individual pages don't export metadata for browser tab titles.

### 19. No Prettier configured

- ESLint is set up but no `.prettierrc` for consistent formatting.

### 20. Outdated dependencies

- `eslint-config-next` at 15.x (should match Next 16)
- `@types/node` at 20.x (current is 25.x)
- `tailwindcss` at 3.x (4.x available)

### 21. `"latest"` version tags in package.json

- Supabase packages use `"latest"` — risky for production stability. Pin to specific versions.

---

## What's Already Good

- Suspense pattern correctly implemented on all pages
- Server/client component separation is clean — no cross-contamination
- Auth guard hierarchy (`requireAuth` → `requireAthlete`) consistently applied
- FK joins correctly accessed with `[0]` everywhere (aside from the `as unknown` casts)
- Stats properly computed from `match_participants`, never read from `athletes`
- `cn()`, `computeStats()`, `extractGymName()`, `getInitials()` all properly centralized
- Color tokens (green-500/red-500/text-primary) used consistently
- Route structure well-organized with `(app)` and `(auth)` groups
- TypeScript strict mode enabled, zero `any` types in source
- Proper use of CVA for variant-based styling where appropriate
- Clean layout hierarchy (root → app → page) without bloat
- Proxy/middleware correctly configured for Next.js 16
- All navigation uses Next.js `Link` component
- Auth flow well-designed with setup redirect for pending athletes

---

## Detailed Metrics

### Component Size Distribution

```
Under 30 lines:   14 files  (excellent — very focused)
30-80 lines:      25 files  (good — on target)
80-120 lines:     11 files  (above target but reasonable)
120+ lines:        3 files  (critical — needs refactoring)
Total: 53 TSX files (excluding shadcn/ui and test files)
```

### Test Health

```
Unit test files:   2 (6 tests, all passing)
E2E test files:    1 (3 tests × 2 browsers, all failing)
Source files:      94
Coverage:          ~2%
TypeScript errors: 0
ESLint errors:     4 (main code)
Build status:      Passing
```

### Files Needing Refactoring (by line count)

| File | Lines | Priority |
|------|-------|----------|
| `components/profile/editable-profile-header.tsx` | 385 | Critical |
| `components/domain/challenge-response-sheet.tsx` | 293 | Critical |
| `app/(app)/arena/swipe/swipe-discovery-client.tsx` | 281 | Critical |
| `components/domain/challenge-sheet.tsx` | 221 | High |
| `app/(app)/leaderboard/leaderboard-content.tsx` | 186 | Medium |
| `app/(app)/page.tsx` (Dashboard) | 181 | Medium |
| `app/(app)/match/pending/pending-challenges-content.tsx` | 171 | Medium |
| `app/(app)/arena/arena-content.tsx` | 171 | Medium |
| `app/(app)/profile/setup/setup-form.tsx` | 166 | Medium |
| `app/(app)/athlete/[id]/athlete-profile-content.tsx` | 163 | Medium |
| `app/(app)/profile/stats/stats-tabs.tsx` | 143 | Low |
| `app/(app)/profile/profile-content.tsx` | 138 | Low |
| `components/login-form.tsx` | 134 | Low |
| `components/domain/compare-stats-modal.tsx` | 124 | Low |
| `components/sign-up-form.tsx` | 120 | Low |
| `components/domain/share-profile-sheet.tsx` | 118 | Low |
| `components/forgot-password-form.tsx` | 105 | Low |

---

## Execution Plan

### Phase 1 — Safety Net (do first, unblocks everything)

Establishes error handling and quality gates so nothing built after this ships broken silently.

| # | Task | Files touched | Issues addressed |
|---|------|---------------|------------------|
| 1a | Add `app/error.tsx` (root error boundary) | 1 new | #1 |
| 1b | Add `app/(app)/error.tsx` (app error boundary) | 1 new | #1 |
| 1c | Add `app/(app)/athlete/error.tsx` (dynamic route) | 1 new | #1 |
| 1d | Add `app/not-found.tsx` (root 404) | 1 new | #2 |
| 1e | Add `app/(app)/not-found.tsx` (app 404) | 1 new | #2 |
| 1f | Add Suspense fallback skeletons to Dashboard, Arena, Leaderboard pages | 3 modified | #7 |
| 1g | Fix 4 ESLint errors (unused vars/imports) | 3 modified | #10 |
| 1h | Exclude `outside_assets/` from ESLint config | 1 modified | #10 |

**Commit:** `fix: add error boundaries, 404 pages, suspense fallbacks, and lint cleanup`

---

### Phase 2 — Tooling & Test Foundation

Gets the test suite working and adds enforcement so the quality bar holds going forward.

| # | Task | Files touched | Issues addressed |
|---|------|---------------|------------------|
| 2a | Fix Playwright config (dev server startup) | 1 modified | #3 |
| 2b | Verify E2E smoke tests pass | 0 | #3 |
| 2c | Add unit tests for `lib/utils.ts` (`computeStats`, `computeWinStreak`, `extractGymName`, `getInitials`) | 1 new | #4 |
| 2d | Install husky + lint-staged | package.json, 1 new config | #5 |
| 2e | Configure pre-commit hook: `tsc --noEmit` + `eslint` + `vitest run` | .husky/pre-commit | #5 |
| 2f | Pin Supabase packages to current versions (remove `"latest"`) | package.json | #21 |

**Commit:** `chore: fix e2e tests, add util tests, set up husky pre-commit hooks`

---

### Phase 3 — Type Safety & Data Patterns

Fixes the type-level issues and data-fetching violations so new features built on top are sound.

| # | Task | Files touched | Issues addressed |
|---|------|---------------|------------------|
| 3a | Remove `as unknown` casts in `pending-challenges-content.tsx` — use proper FK join types | 1 modified | #9 |
| 3b | Remove `as unknown` casts in `athlete-profile-content.tsx` — use proper FK join types | 1 modified | #9 |
| 3c | Move gym fetch from `setup-form.tsx` client useEffect to server page, pass as prop | 2 modified | #8 |
| 3d | Add composite types (`AthleteWithGym`, `ChallengeWithParticipants`) to `types/` | 1-2 new | #15 |
| 3e | Add `lib/constants.ts` for status values, match results, match types | 1 new | #14 |
| 3f | Update consumers to use constants (challenge-sheet, challenge-response-sheet, match-card, etc.) | ~6 modified | #14 |

**Commit:** `refactor: fix type casts, add composite types and constants, move gym fetch to server`

---

### Phase 4 — Extract Shared Code

Eliminates duplication before the codebase grows further. Each extraction reduces line counts in the oversized files too.

| # | Task | Files touched | Issues addressed |
|---|------|---------------|------------------|
| 4a | Extract `formatRelativeDate()` and `formatTimeRemaining()` to `lib/utils.ts` | 1 modified + 3 consumers | #11 |
| 4b | Extract `components/domain/elo-stakes-preview.tsx` from challenge-sheet + challenge-response-sheet | 1 new + 2 modified | #12 |
| 4c | Rename `handleForgotPassword` → `handleUpdatePassword` in update-password-form | 1 modified | #16 |
| 4d | Add tests for newly extracted utils (date formatting) | 1 modified | #4 |

**Commit:** `refactor: extract date utils, ELO stakes component, fix naming`

---

### Phase 5 — Split Oversized Components

Breaks down the 3 critical files. Easier now that shared code is already extracted in Phase 4.

| # | Task | Files touched | Issues addressed |
|---|------|---------------|------------------|
| 5a | Split `editable-profile-header.tsx` (385→~80): extract NameField, GymField, WeightField, SaveCancelButtons to sibling files | 1 modified + 4 new | #6 |
| 5b | Split `challenge-response-sheet.tsx` (293→~80): extract SuccessState, use shared elo-stakes-preview | 1 modified + 1 new | #6 |
| 5c | Split `swipe-discovery-client.tsx` (281→~80): extract SwipeCard component, extract drag hook | 1 modified + 2 new | #6 |
| 5d | Split `challenge-sheet.tsx` (221→~80): extract form sections, use shared elo-stakes-preview | 1 modified + 1-2 new | #6 |

**Commit:** `refactor: split oversized components into focused sub-components`

---

### Phase 6 — Polish (before alpha tag)

Lower priority items that improve production readiness without blocking feature work.

| # | Task | Files touched | Issues addressed |
|---|------|---------------|------------------|
| 6a | Add `aria-label` to icon buttons (swipe pass/like, password toggle, theme switcher) | ~5 modified | #17 |
| 6b | Add text fallbacks for color-only indicators | ~2 modified | #17 |
| 6c | Add per-page metadata exports (title per route) | ~8 modified | #18 |
| 6d | Add `.prettierrc` + format codebase | 1 new + all files | #19 |
| 6e | Update outdated deps (`eslint-config-next`, `@types/node`) | package.json | #20 |
| 6f | Extract auth form base component (login/signup/forgot-password) | 1 new + 3 modified | #13 |

**Commit(s):** Split as makes sense — a11y, metadata, formatting, deps, auth refactor

---

### Phase Summary

| Phase | Focus | Issues closed | Estimated scope |
|-------|-------|---------------|-----------------|
| **1** | Safety net | #1, #2, #7, #10 | 8 tasks, ~10 files |
| **2** | Tooling & tests | #3, #4, #5, #21 | 6 tasks, ~5 files |
| **3** | Types & data | #8, #9, #14, #15 | 6 tasks, ~12 files |
| **4** | Extract shared code | #11, #12, #16 | 4 tasks, ~8 files |
| **5** | Split components | #6 | 4 tasks, ~12 files |
| **6** | Polish | #13, #17, #18, #19, #20 | 6 tasks, ~20 files |

Phases 1-3 should be done before building any new features. Phases 4-5 can interleave with feature work (refactor as you touch files). Phase 6 is pre-alpha-tag cleanup.
