<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 1.2.0
Bump rationale: MINOR — new principle added (VI. Change Tracking).
Previous Testing Discipline renumbered from VI to VII.

Added sections:
- Principle VI: Change Tracking — requires maintaining a changelog
  and learnings section in the active plan file.

Renumbered sections:
- Testing Discipline: VI → VII

Removed sections: None

Templates requiring updates:
- .specify/templates/plan-template.md: ⚠️ pending
  (Should include Change Log table and Learnings section in template.
  Constitution Check should reference Principle VII for test gates.)
- .specify/templates/spec-template.md: ✅ no updates required
- .specify/templates/tasks-template.md: ✅ no updates required
-->

# Jits Arena Web Constitution

## Core Principles

### I. Mobile-First Design

All user interfaces MUST be designed for phone screens first.
Desktop is secondary.

- Touch-friendly spacing with minimum 44px tap targets
- No hover-only interactions permitted
- All layouts MUST render correctly at 320px width minimum
- Content MUST be constrained to `max-w-md` (448px) via
  `PageContainer` layout component
- If it doesn't feel good on a phone browser, it is wrong

**Rationale**: The app will be distributed as a WebView-wrapped
mobile app for alpha. Phone experience is the primary user
experience.

### II. Separation of Concerns

Layout generation and data wiring MUST be handled by separate
tools with no overlap.

- **Figma Make**: Generates layout and presentational components ONLY
  - No data fetching
  - No auth logic
  - No Supabase calls
- **Claude Code**: Handles all data wiring and logic
  - Wires data to components
  - Handles auth/session logic
  - Adds guards, redirects, and mutations
  - MUST NOT rewrite layout unless explicitly requested

Never ask both tools to solve the same problem.

**Component layers** MUST follow the three-tier architecture:

| Layer | Path | Rule |
|-------|------|------|
| **ui** | `components/ui/` | Zero domain knowledge. Styled with Tailwind + CVA. |
| **domain** | `components/domain/` | BJJ-specific. Composes ui/ primitives. |
| **layout** | `components/layout/` | App shell: navigation, page wrappers. |

- shadcn primitives MUST be installed on demand (when a step needs
  them), not batch-installed speculatively.
- Domain components MUST be built alongside the screen that first
  uses them, not speculatively.

**Rationale**: Clean separation prevents conflicts, enables parallel
tooling, and maintains clear ownership of concerns.

### III. Auth Assumptions

Supabase Auth is the single source of truth. Authentication state
guarantees athlete existence.

- Every authenticated user ALREADY has an athlete record
- Athlete records are created automatically via backend trigger
- The frontend MAY assume: "If the user is authenticated, an
  athlete row exists"
- No onboarding state machine is required
- No defensive checks for missing athlete records needed
- All `(app)/` pages MUST use `requireAuth()` or
  `requireAthlete()` from `lib/guards.ts` — no inline auth checks

**Rationale**: Simplifies frontend logic by eliminating
authentication edge cases. Backend guarantees data integrity.

### IV. Alpha-First Development

Optimize for learning speed over production polish. Breaking
changes are acceptable.

- Correctness over polish
- Learn fast, delete freely
- Avoid abstractions you cannot justify
- Prefer explicit code over clever code
- No backwards compatibility requirements during alpha phase

**Rationale**: Alpha phase is for validation. Technical debt is
acceptable if it accelerates learning about user needs.

### V. Clarity Over Extensibility

Code MUST be immediately understandable. Optimize for readability,
not future flexibility.

- Do not introduce global state without justification
- Do not add SDK layers on top of Supabase
- Do not refactor layout unless explicitly asked
- Respect existing folder boundaries
- When uncertain, ask before acting

**Rationale**: Premature abstraction creates cognitive overhead.
Simple, explicit code is easier to modify and delete.

### VI. Change Tracking

Every implementation step MUST be logged in the plan's Change Log
when completed.

- The active plan file (`research/004-plan.md` or equivalent) MUST
  include a **Change Log** table at the top
- Each completed step MUST be recorded with: date, step name,
  status (**Done**), and brief notes on what was built or changed
- Learnings discovered during implementation (schema surprises,
  framework quirks, pattern decisions) MUST be recorded in a
  **Learnings** section in the plan file
- The change log is the source of truth for what has been
  implemented — keep it current

**Rationale**: Without a living record of progress and learnings,
context is lost between sessions. The changelog prevents duplicate
work and ensures hard-won knowledge is preserved.

### VII. Testing Discipline

Every feature MUST be verifiable. Tests exist to catch regressions
and validate user flows, not to achieve coverage metrics.

- **Vitest**: Unit and component tests
  - Test domain components with meaningful assertions
  - Test utility functions and guards
  - Do NOT test shadcn primitives or trivial wrappers
- **Playwright**: End-to-end browser tests
  - Test critical user flows (login, navigation, data display)
  - Test layout shell renders correctly across routes
  - Do NOT test every permutation — focus on happy paths and
    known edge cases
- TypeScript compilation (`tsc --noEmit`) MUST pass before commit
- Next.js build (`next build`) MUST pass before commit
- Tests SHOULD be written alongside features, not deferred to a
  polish phase

**Rationale**: Alpha does not mean untested. Catching regressions
early is cheaper than debugging broken flows later. The two-layer
test strategy (fast unit + selective E2E) balances speed with
confidence.

## Tech Stack Constraints

The following technologies are locked in for the alpha phase:

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js (App Router) | Server components by default |
| Language | TypeScript | Strict mode required |
| Styling | Tailwind CSS | Mobile-first utilities |
| Backend | Supabase | Auth, Postgres, RLS |
| UI Components | Radix UI + shadcn/ui | Accessible primitives with CVA variants |
| Unit Tests | Vitest + React Testing Library | Component and utility tests |
| E2E Tests | Playwright | Critical user flow validation |

### Component Architecture

```
components/
├── ui/          # shadcn/ui primitives (zero domain knowledge)
├── domain/      # BJJ-specific (composes ui/ primitives)
└── layout/      # App shell (app-header, bottom-nav-bar, page-container)
```

### Supabase Usage Rules

- Use `@supabase/supabase-js` exclusively
- Do NOT create ad-hoc clients inline
- Server components MUST use the server client
  (`lib/supabase/server.ts`)
- Client components MUST use the browser client
  (`lib/supabase/client.ts`)
- Frontend reads tables directly via RLS
- Frontend performs simple inserts/updates only
- Frontend does NOT apply ELO logic (backend responsibility)

### Out of Scope

The following are explicitly NOT this repository's responsibility:

- ELO calculation logic
- Match integrity enforcement
- Dispute resolution
- Admin tooling
- Marketing pages
- Database schema management (separate backend repo)

## Governance

This constitution supersedes all other development practices for
this repository.

### Amendment Procedure

1. Propose change via pull request to this file
2. Document rationale for change
3. Update dependent templates if principles change
4. Increment version according to semantic versioning

### Versioning Policy

- **MAJOR**: Principle removal or incompatible redefinition
- **MINOR**: New principle added or materially expanded guidance
- **PATCH**: Clarifications, wording fixes, non-semantic refinements

### Compliance Review

- All PRs MUST verify alignment with these principles
- Complexity MUST be justified against Principle V
- Template outputs (spec.md, plan.md, tasks.md) MUST reference
  applicable principles
- TypeScript and Next.js build MUST pass (Principle VII)

**Version**: 1.2.0 | **Ratified**: 2026-02-04 | **Last Amended**: 2026-02-13
