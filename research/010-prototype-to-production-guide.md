# 010 — Prototype to Production: A Reproducible Guide

**Date:** 2026-02-18
**Scope:** How to go from a Figma Make prototype + Supabase backend to a maintainable, high-quality Next.js app using Claude Code — based on the JITS Arena buildout (125 commits, 5 days, 20 routes).

---

## What This Guide Covers

This is a case study and playbook rolled into one. It documents the exact workflow, tooling, and prompting patterns used to build JITS Arena from a Figma Make export and a Supabase backend repo. The goal: a reproducible process you can apply to your next project.

### The Starting Inputs

| Input | What It Is | Role |
|-------|-----------|------|
| **Figma Make export** | A Vite + React app auto-generated from a Figma design file | Visual reference — routes, components, tokens. Never run directly. |
| **Supabase backend repo** | Separate git repo with migrations, RLS policies, RPCs, and pgTAP tests | Source of truth for schema, business logic, and API contracts |
| **Next.js starter template** | Vercel's official Supabase + Next.js template (includes auth forms, proxy middleware, shadcn/ui) | Scaffold — provides auth, routing, and component primitives |
| **Claude Code** | AI coding agent with persistent instructions via CLAUDE.md | Builder — reads all three inputs and produces the app |

### The Output

| Metric | JITS Arena |
|--------|-----------|
| Commits | 125 |
| Active build days | 5 |
| Routes | 20 (14 app + 6 auth) |
| Components | 55+ shared, 59 route-specific |
| Research docs | 13 |
| Tests | 3 unit suites + 1 E2E suite |
| PRs merged | 24 |

---

## Part 1: Project Setup

### Step 1 — Scaffold from the Supabase Next.js Template

Start with Vercel's Supabase template. It gives you auth forms, server/browser Supabase clients, proxy middleware, and shadcn/ui out of the box.

```bash
# Option A: Via Vercel dashboard
# Go to https://vercel.com/new → choose "Supabase Starter" template

# Option B: Via CLI (if template is available)
npx create-next-app@latest my-app --example with-supabase
```

**What the template provides:**

```
app/
  auth/                          # Auth pages (login, signup, forgot-password, etc.)
  protected/                     # Stub for authenticated content
  layout.tsx                     # Root layout with theme provider
  globals.css                    # Default shadcn/ui color tokens
components/
  ui/                            # shadcn/ui primitives (button, card, input, label, badge)
  login-form.tsx                 # Supabase auth form
  sign-up-form.tsx               # Registration form
  forgot-password-form.tsx       # Password reset
  update-password-form.tsx       # Password update
lib/
  supabase/
    client.ts                    # Browser Supabase client
    server.ts                    # Server Supabase client (cookie-based)
    proxy.ts                     # Auth session refresh middleware
  utils.ts                       # Tailwind cn() utility
proxy.ts                         # Next.js 16 middleware entry point
tailwind.config.ts               # Tailwind with shadcn/ui tokens
components.json                  # shadcn/ui configuration
```

### Step 2 — Restructure into Route Groups

The template uses `/auth/` and `/protected/`. Restructure into semantic route groups:

```
app/
  (auth)/                        # Public auth routes (no nav shell)
    login/page.tsx
    signup/page.tsx
    forgot-password/page.tsx
    update-password/page.tsx
    error/page.tsx
  (app)/                         # Authenticated routes (with nav shell)
    layout.tsx                   # Nav shell: header + content + bottom nav
    page.tsx                     # Dashboard (home)
```

**JITS commit:** `92092f6` — "Restructure app with route groups and remove boilerplate"

Delete the template's tutorial components, hero section, deploy button, and marketing page. Keep auth forms, Supabase clients, and shadcn/ui primitives.

### Step 3 — Clean the Template

Remove everything you won't use:

```
# Deleted from JITS template:
components/hero.tsx
components/deploy-button.tsx
components/env-var-warning.tsx
components/next-logo.tsx
components/supabase-logo.tsx
components/tutorial/              # Entire directory
app/page.tsx                      # Marketing homepage (replaced by dashboard)
```

### Step 4 — Install Dev Tooling

Add testing frameworks and git hooks:

```bash
# Testing
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install -D @playwright/test
npx playwright install chromium

# Git hooks
npm install -D husky
npx husky init

# Local fonts (avoid external Google Fonts for reliable builds)
npm install geist
```

Create config files:

**vitest.config.ts:**
```ts
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "outside_assets", ".next", "e2e"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
});
```

**playwright.config.ts:**
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Step 5 — Connect to Your Backend

Point the frontend at your Supabase backend's local instance:

**.env.local:**
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
```

Add a type generation script to `package.json`:

```json
{
  "scripts": {
    "db:types": "cd ../your_backend_repo && supabase gen types typescript --local > ../your_frontend_repo/types/database.ts"
  }
}
```

Run it immediately:

```bash
npm run db:types
```

This generates `types/database.ts` with TypeScript types for every table, view, and RPC function in your backend schema. **Run this after every backend migration.**

### Step 6 — Drop in Your Figma Make Export

Place the Figma Make export in a reference directory:

```bash
mkdir outside_assets
# Copy your Figma Make export here
cp -r ~/Downloads/FigmaMakeDemo outside_assets/
```

Add it to `.gitignore` exclusions and `tsconfig.json` excludes:

```json
// tsconfig.json
{
  "exclude": ["node_modules", "outside_assets"]
}
```

**Critical: you never import from `outside_assets/`.** It's a visual reference, not source code. The Figma Make export is a Vite + React app with hardcoded data — you extract *design decisions* from it, not code.

---

## Part 2: The Governance Layer

This is what separates a "vibe coded" project from a maintainable one. Before writing any feature code, set up the files that guide every future Claude session.

### CLAUDE.md — Persistent Instructions for Claude

Create `CLAUDE.md` at the project root. This is loaded into every Claude Code session automatically. Start minimal and grow it as you discover patterns.

**Starter template:**

```markdown
# CLAUDE.md — [Project Name] Development Principles

## Project Overview
[One paragraph: what the app does, tech stack, where the backend lives]

**Backend repo:** `/path/to/your/backend/repo/`
- Read the BE repo's README.md and migrations when you need to understand the database schema.

## Architecture
- **Framework:** Next.js 16 App Router
- **Auth/DB:** Supabase
- **Styling:** Tailwind CSS + shadcn/ui

### Directory Structure
[List your directories with one-line descriptions]

### Naming Conventions
- **Files:** kebab-case
- **Components:** PascalCase
- **Types:** PascalCase

## Code Quality Principles

### 1. Keep Components Short
Target: under 80 lines per component.

### 2. Don't Duplicate Logic
Extract to lib/utils.ts at 2+ usages across files.

### 3. Suspense Is Mandatory for Async Server Components
[Include code example of the pattern]

## Pre-Commit Quality Checks
1. `npx tsc --noEmit`
2. `npx next build`
3. `npm test`

## Changelog
Always update CHANGELOG.md when committing changes.
```

**How JITS evolved this file:** Started at 170 lines on Feb 13, grew to 350+ lines by Feb 17. New sections were added after each review pass — FK join patterns after discovering Supabase quirks, color tokens after inconsistent styling, RPC documentation after building the data access layer.

### Cross-Repo CLAUDE.md — The Coordination Pattern

Make each repo's CLAUDE.md aware of the other:

**Frontend CLAUDE.md:**
```markdown
**Backend repo:** `/path/to/backend/`
- Supabase migrations in `supabase/migrations/`
- Read the BE repo's README.md and migrations for schema/RLS/business rules.
```

**Backend CLAUDE.md or FRONTEND_INTEGRATION_GUIDE.md:**
```markdown
**Frontend repo:** `/path/to/frontend/`
- Frontend expects these RPC signatures: [list them]
- Type generation: frontend runs `npm run db:types` after migrations
```

**Why this matters:** When Claude works in either repo, it can read the other repo's source of truth before proposing changes. It acts like a tech lead who attends both teams' standups — catching mismatches before they become bugs.

**JITS example:** The frontend's `CLAUDE.md` documents a "Frontend/Backend Discrepancies" section with checkboxes. Each session, Claude reads both repos and flags conflicts. Items like "Weight units unclear — spec says kg, challenges spec says lbs" get tracked until resolved.

### research/ — Numbered Research Documents

Create a `research/` directory for design documents. Use sequential numbering:

```
research/
  001-figma-design-audit.md        # What the Figma export contains
  002-styling-guide.md             # Tokens extracted from Figma
  004-plan.md                      # Master implementation plan
  005-backend-reference.md         # Schema, RLS, RPCs from BE repo
  006-codebase-audit.md            # Health check after initial build
  007-integration-brief.md         # FE↔BE alignment status
```

For complex features, use a 3-doc suite:

```
research/chat/
  001-chat-backend-contract.md     # What the backend provides
  002-chat-architecture.md         # How we'll build it
  003-chat-implementation-plan.md  # Step-by-step tasks
```

**The pattern:** Research before building. Every major feature gets a doc that reads the backend contract *before* writing frontend code.

### CHANGELOG.md — Feature Tracking

```markdown
# Changelog

## [Unreleased]

### Layout Shell (2026-02-13)

**Added**
- `components/layout/app-header.tsx` — top bar with back button and actions
- `components/layout/bottom-nav-bar.tsx` — 4-tab navigation
- `components/layout/page-container.tsx` — content wrapper

**Changed**
- `app/(app)/layout.tsx` — migrated to new shell components
```

**Rule:** Update before every commit, not after.

---

## Part 3: The Figma Make Audit Workflow

This is the critical step that most people skip. Instead of copying Figma Make's generated code (which is throwaway Vite/React with hardcoded data), you **audit** it to extract design decisions.

### What to Extract

| Extract | Don't Extract |
|---------|---------------|
| Route structure (which screens exist) | Component implementations |
| Color tokens (hex → HSL conversion) | Inline styles |
| Typography scale (font sizes, weights) | Hardcoded data |
| Component inventory (what exists) | Event handlers |
| Layout patterns (spacing, grid) | State management |
| Icon usage (which Lucide icons) | API calls |

### The Audit Prompt

This is the first prompt you give Claude Code when starting a new project:

```
I have a Figma Make export in outside_assets/FigmaMakeDemo/. This is a Vite + React
app auto-generated from a Figma design. I need you to audit it — do NOT copy code
from it.

Please create research/001-figma-design-audit.md with:

1. **Screen inventory** — List every distinct screen in the export. For each:
   - Screen name
   - The component file in the export
   - The Next.js route it maps to
   - One-line description

2. **Route structure** — A tree showing the proposed app/(app)/ and app/(auth)/
   directory structure

3. **Component inventory** — List reusable components visible across screens
   (cards, badges, modals, etc.) with their visual purpose

4. **Layout patterns** — Bottom nav structure, header patterns, page containers

Do not include: component code, inline styles, data shapes, or API calls.
Those will come from the backend repo, not Figma.
```

**JITS result:** [001-research-figma-make-design-audit.md](001-research-figma-make-design-audit.md) — identified 14 screens, mapped them to routes, cataloged components and layout patterns.

### The Styling Extraction Prompt

```
Now read outside_assets/FigmaMakeDemo/src/styles/globals.css (or equivalent) and
create research/002-styling-guide.md with:

1. **Color tokens** — Map every Figma hex color to an HSL value for our
   globals.css CSS variables. Show the migration: current value → target value.

2. **Typography** — Font families, sizes, weights, and line heights used.

3. **Spacing** — Common padding/margin values and any grid patterns.

4. **Animations** — Any CSS transitions or keyframes worth adopting.

Format the color table as: Token | Current HSL | Target HSL | Hex | Role
```

**JITS result:** [002-research-styling-guide.md](002-research-styling-guide.md) — produced a complete token migration table that was applied directly to `globals.css` and `tailwind.config.ts`.

---

## Part 4: The Build Cycle

### Phase 0: Research (Before Any Code)

```
Read the backend repo at /path/to/backend/:
- supabase/migrations/ (all SQL files)
- README.md
- Any docs/ or specs/ directories

Create research/005-backend-reference.md documenting:
1. All tables with their columns and types
2. RLS policies (who can read/write what)
3. RPC functions with parameter and return types
4. FK relationships (exact constraint names)
5. Any triggers or computed columns
```

### Phase 1: Layout Shell

Build the app skeleton first — header, navigation, page wrapper. No data fetching yet.

```
Build the layout shell for the authenticated app. Reference:
- research/001-figma-design-audit.md for layout patterns
- research/002-styling-guide.md for colors and spacing

Create:
1. components/layout/app-header.tsx — top bar with title, optional back button, action slot
2. components/layout/bottom-nav-bar.tsx — tab navigation matching Figma's bottom nav
3. components/layout/page-container.tsx — content wrapper (max-w-md, padding, safe areas)
4. Update app/(app)/layout.tsx to compose these three components

Install any shadcn/ui components needed (avatar, separator, etc.) using npx shadcn@latest add.
```

### Phase 2: Types & Data Layer

Generate types and create the API wrapper layer:

```
1. Run npm run db:types to generate types/database.ts from the backend
2. Create type aliases in types/ for frequently used tables (e.g., types/athlete.ts)
3. Create lib/api/queries.ts with typed server-side query functions
4. Create lib/api/mutations.ts with typed client-side mutation functions
5. Create lib/api/errors.ts with Result<T> pattern for error handling
6. Create lib/guards.ts with requireAuth() and requireAthlete() functions
```

### Phase 3: Screen-by-Screen Build

Build one screen at a time, creating domain components as needed:

```
Build the [Screen Name] screen. Reference:
- research/001-figma-design-audit.md for visual structure
- research/005-backend-reference.md for data requirements

The screen needs to:
1. [What the screen shows]
2. [What data it fetches]
3. [What actions the user can take]

Create domain components in components/domain/ for any reusable pieces.
Use server components for data fetching, client components only for interactivity.
Follow the Suspense pattern from CLAUDE.md principle 5.
```

**JITS order (optimized for dependency chain):**
1. Dashboard (home) — establishes stat card and match card components
2. Profile — establishes profile header component
3. Leaderboard + Arena — establishes athlete card component
4. Competitor profile — reuses profile header + adds compare modal
5. Pending challenges — reuses match card
6. Share profile + Swipe discovery
7. Challenge creation + response
8. Match flow (lobby → live → results)
9. Chat + realtime
10. Presence + notifications

### Phase 4: Cross-Repo Review

After the initial build, run a cross-repo alignment check:

```
Read both repos and create research/007-integration-brief.md documenting:

1. **What's wired** — Features where FE and BE are fully connected
2. **Discrepancies** — Where the FE assumes something the BE doesn't provide (or vice versa)
3. **Missing RPCs** — Queries the FE needs that the BE doesn't have yet
4. **Type mismatches** — Where generated types don't match actual behavior

Update CLAUDE.md with any new patterns discovered.
```

### Phase 5: Hardening

```
Run a full codebase audit. Check for:
1. Missing error boundaries on route segments
2. Missing 404/not-found pages
3. Missing Suspense fallbacks
4. Type safety issues (any `as any` or `// @ts-ignore`)
5. Components over 80 lines that should be split
6. Duplicated logic that should be extracted to lib/utils.ts
7. Missing tests for utility functions

Fix everything found. Update CLAUDE.md with any new principles.
```

### Phase 6: Polish & Performance

```
Audit the app for performance:
1. Find N+1 query patterns (sequential fetches that could be parallel)
2. Find pages making multiple sequential Supabase calls (parallelize with Promise.all)
3. Check for missing loading states and skeleton screens
4. Add PWA metadata (manifest.json, safe areas, viewport)
5. Test on mobile viewport (375px)
```

### Gates Between Phases

Before moving to the next phase, run:

```bash
npx tsc --noEmit       # Type check
npx next build         # Build succeeds
npm test               # Unit tests pass
```

If any fail, fix before proceeding. This prevents debt from compounding.

---

## Part 5: Claude Code Prompt Guide

### Prompt Pattern 1 — Research Before Building

**Don't:** "Build me a chat feature"
**Do:** "Read the backend migration for chat (jr_be/supabase/migrations/20260216_chat.sql) and the frontend integration guide (jr_be/FRONTEND_INTEGRATION_GUIDE.md). Then create research/chat/001-chat-backend-contract.md documenting what RPCs, tables, and realtime channels are available. Don't write any code yet."

**Why:** Forces Claude to understand the contract before generating code. Prevents building against imagined APIs.

### Prompt Pattern 2 — Referencing Research

**Don't:** "Add online presence with green dots"
**Do:** "Implement online presence. Reference research/005-backend-reference.md for the Supabase Presence API contract. Use the external store pattern (useSyncExternalStore) instead of React Context to avoid wrapping the layout in a provider."

**Why:** Points Claude at the specific decisions you've already made instead of letting it improvise.

### Prompt Pattern 3 — Cross-Repo Check

```
Before implementing [feature], read:
1. The backend migration: /path/to/backend/supabase/migrations/TIMESTAMP_feature.sql
2. The RPC contracts: /path/to/backend/docs/rpc-contracts.md
3. Our integration brief: research/007-integration-brief.md

Flag any discrepancies between what the backend provides and what the frontend needs.
Then propose the implementation plan.
```

### Prompt Pattern 4 — Code Review Pass

```
Do a full review of the codebase. Check for:
- Components over 80 lines (CLAUDE.md principle 1)
- Duplicated logic across files (CLAUDE.md principle 2)
- Direct table queries that should use RPCs (CLAUDE.md principle 4)
- Missing Suspense boundaries (CLAUDE.md principle 5)
- Inconsistent color tokens (CLAUDE.md principle 9)

For each issue: fix it, then update CLAUDE.md if you discovered a new pattern.
```

### Prompt Pattern 5 — Feature Build with Quality Gates

```
Build [feature]. After implementation:
1. Run npx tsc --noEmit and fix any type errors
2. Run npx next build and fix any build failures
3. Add unit tests for any new utility functions
4. Update CHANGELOG.md with what was added/changed
5. Update CLAUDE.md if this introduced new patterns or FK joins
```

### Prompt Pattern 6 — Branching for Research

For complex or uncertain features, use named branches:

```
Create a new branch claude/explore-[feature] and research the implementation.
Read the relevant backend code, explore existing patterns in the codebase,
and propose an approach. Don't merge — I want to review the research first.
```

This lets you spin up multiple research branches for the same problem, compare approaches, and consolidate the best parts before merging to `development`.

**JITS example:** `claude/improve-app-performance-6kb6Q` produced two PRs (#20 and #21) — one for query parallelization and one for mobile PWA polish. Same research topic, different outputs, merged separately after review.

---

## Part 6: The Living Documentation Cycle

The key insight: **documentation is not a deliverable, it's a feedback loop.**

```
Session 1: Build feature → discover pattern → add to CLAUDE.md
Session 2: CLAUDE.md loads → Claude follows pattern → no rework needed
Session 3: Pattern proves wrong → update CLAUDE.md → future sessions correct
```

### What Goes Where

| Document | Updated When | Purpose |
|----------|-------------|---------|
| `CLAUDE.md` | After every review pass | Coding principles, patterns, architecture |
| `MEMORY.md` | After hard-won learnings | FK join quirks, schema gotchas, RPC signatures |
| `research/004-plan.md` | After every step completion | Implementation progress tracking |
| `research/005-backend-reference.md` | After every BE migration | Schema/RPC documentation |
| `CHANGELOG.md` | Before every commit | Feature tracking |

### CLAUDE.md Growth Pattern (from JITS)

| Date | Lines | What Was Added |
|------|-------|---------------|
| Feb 13 | 170 | Initial: architecture, naming, 6 principles |
| Feb 14 | 220 | FK join patterns, pre-commit checks, data access layer |
| Feb 15 | 280 | Chat UI patterns, realtime/presence docs |
| Feb 16 | 320 | Color tokens, match type labels, weight-aware ELO |
| Feb 17 | 350+ | Full RPC reference, two-tier presence model, cross-repo integration |

Each growth spurt came from a code review that discovered an undocumented pattern. The review prompt ("check for X, Y, Z") surfaces these; the CLAUDE.md update locks them in for future sessions.

---

## Part 7: Cross-Repo Coordination Deep Dive

### The Type Generation Pipeline

```
Backend: supabase/migrations/*.sql
  ↓ (schema changes)
Backend: supabase start (local DB running)
  ↓
Frontend: npm run db:types
  ↓ (generates types/database.ts)
Frontend: npx tsc --noEmit
  ↓ (catches breaking changes at compile time)
Frontend: Update lib/api/ wrappers if needed
```

**Rule:** After every backend migration, the frontend must run `npm run db:types`. If the TypeScript build breaks, the migration changed an API contract and the frontend needs to adapt.

### The 48KB Integration Guide

JITS's backend repo includes a `FRONTEND_INTEGRATION_GUIDE.md` (48KB) that documents every table, RPC, realtime channel, and storage bucket from the frontend's perspective. This is written *by the backend* (or by Claude working in the backend repo) and consumed *by the frontend*.

**How to prompt for this in the backend repo:**

```
Create FRONTEND_INTEGRATION_GUIDE.md documenting everything the frontend
needs to know to integrate with this backend:

1. Every table with column names, types, and RLS summary
2. Every RPC with parameters, return types, and error codes
3. Every realtime channel with payload shapes
4. Every storage bucket with access policies
5. Auth flow: what happens on signup, login, logout
6. Common gotchas (FK join names, RLS edge cases)

Write it for a frontend developer (or AI) who has never seen the schema.
```

### Tracking Discrepancies

Add a section to the frontend's `CLAUDE.md`:

```markdown
### Frontend/Backend Discrepancies (Status)

1. ~~Weight units unclear — spec says kg, challenges says lbs~~ — [x] resolved: using lbs
2. **Missing RPC for batch stats** — need get_athletes_stats for leaderboard
3. ~~No gym selection in setup~~ — [x] setup form includes gym picker
```

This gives Claude a checklist to reference every session. Resolved items get struck through. Open items inform what to build or request from the backend.

---

## Part 8: Branching Strategy

### Phase 1: Velocity (Development Branch)

During the initial build, stack features on a single `development` branch and merge frequently:

```
development → PR #1 → main (layout shell)
development → PR #2 → main (dashboard + profile + leaderboard)
development → PR #3 → main (competitor profile + challenges)
```

**JITS:** PRs #1–#8 (Feb 13–14) all came from `development`. 7 PRs merged on Feb 13 alone.

### Phase 2: Research Branches

Once the app is functional, switch to named branches for individual features:

```
claude/implement-match-flow    → PR #15 → main
claude/improve-chat-ui         → PR #17 → main
claude/improve-app-performance → PR #20 → main (query parallelization)
claude/improve-app-performance → PR #21 → main (mobile/PWA polish)
```

**Why this shift:** Early on, everything is greenfield — no risk of conflicts. Later, features touch existing code and benefit from isolated branches where Claude can research and experiment without polluting `development`.

### Parallel Research → Consolidation

For complex problems, spin up multiple branches exploring different angles:

1. Create `claude/explore-feature-approach-a` — research one approach
2. Create `claude/explore-feature-approach-b` — research another
3. Review both branches, cherry-pick the best parts
4. Merge the consolidated result

This gives you multiple perspectives on the same problem without committing to one too early.

---

## Appendix A: Full Script List

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "typecheck": "tsc --noEmit",
    "db:types": "cd ../backend_repo && supabase gen types typescript --local > ../frontend_repo/types/database.ts",
    "prepare": "husky"
  }
}
```

## Appendix B: Pre-Commit Hook

`.husky/pre-commit`:
```bash
npx tsc --noEmit
npx next build
npm test
```

## Appendix C: Target Directory Structure

```
app/
  (app)/                         # Authenticated routes with nav shell
    layout.tsx                   # Header + content + bottom nav
    page.tsx                     # Dashboard
    [feature]/page.tsx           # Feature routes
  (auth)/                        # Public auth routes
    login/page.tsx
    signup/page.tsx
components/
  domain/                        # Business-logic components
  layout/                        # Shell components (header, nav, page-container)
  profile/                       # Feature-specific components
  ui/                            # shadcn/ui primitives (managed by CLI)
hooks/                           # Client-side hooks (realtime, presence, state)
lib/
  api/                           # Typed data access layer
    queries.ts                   # Server-side fetchers
    mutations.ts                 # Client-side mutators
    errors.ts                    # Result<T> and domain errors
  supabase/                      # Supabase clients
    server.ts
    client.ts
    proxy.ts
  guards.ts                      # Auth guards (requireAuth, requireAthlete)
  utils.ts                       # Shared utilities
  constants.ts                   # App-wide constants
types/
  database.ts                    # Generated (npm run db:types)
  composites.ts                  # FK join shapes, shared interfaces
  [table].ts                     # Per-table type aliases
research/                        # Design docs, plans, audits
  001-figma-design-audit.md
  002-styling-guide.md
  004-plan.md
  005-backend-reference.md
outside_assets/                  # Figma Make export (reference only, gitignored from build)
e2e/                             # Playwright E2E tests
CLAUDE.md                        # Persistent Claude Code instructions
CHANGELOG.md                     # Feature tracking
```

## Appendix D: Day-by-Day JITS Timeline

| Day | Date | Commits | What Was Built |
|-----|------|---------|---------------|
| 0 | Feb 4 | 4 | Template scaffold, route groups, constitution, README |
| 1 | Feb 13 | 41 | Research audit → styling migration → Steps 1-9 (layout through swipe) → CLAUDE.md → backend reference → challenge flow |
| 2 | Feb 14 | 61 | Steps 10-12 (setup fix, challenges, match flow) → typed API layer → error boundaries → tests → type safety |
| 3 | Feb 15 | 33 | Real-world testing: RLS fixes, OAuth, weight confirmation, challenge indicators, achievements |
| 4 | Feb 16 | 60 | Chat system → notifications → online presence → performance → PWA → deployment checks → weight-aware ELO → dashboard redesign |
| 5 | Feb 17 | 47 | Supabase optimization audit → query parallelization → lobby presence → profile photos → UI polish |

---

## Key Takeaways

1. **Audit the Figma export, don't copy it.** Extract routes, tokens, and component inventory. Build from scratch with real data.

2. **Research before building.** Every major feature gets a numbered doc that reads the backend contract first.

3. **CLAUDE.md is your most important file.** It accumulates patterns session over session, preventing rework and enforcing consistency.

4. **Two CLAUDE.md files that reference each other** create a bidirectional contract between repos. Claude acts as the integration layer.

5. **Type generation is the contract check.** `npm run db:types` → `tsc --noEmit` catches API mismatches at compile time.

6. **Build velocity first, branch for research later.** Stack features on `development` during the greenfield phase, then use named branches for isolated features.

7. **Gates, not guidelines.** Pre-commit hooks that run TypeScript + build + tests prevent debt from compounding.

8. **Documentation is a feedback loop.** Build → discover pattern → document → next session follows the pattern automatically.
