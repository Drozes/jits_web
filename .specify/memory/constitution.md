<!--
SYNC IMPACT REPORT
==================
Version change: 0.0.0 → 1.0.0
Bump rationale: Initial constitution creation (MAJOR)

Modified principles: N/A (initial creation)

Added sections:
- Core Principles (5 principles derived from README.md)
- Tech Stack Constraints
- Governance

Removed sections: N/A (initial creation)

Templates requiring updates:
- .specify/templates/plan-template.md: ⚠️ pending (Constitution Check section needs principle alignment)
- .specify/templates/spec-template.md: ✅ no updates required
- .specify/templates/tasks-template.md: ✅ no updates required

Follow-up TODOs: None
-->

# Jits Arena Web Constitution

## Core Principles

### I. Mobile-First Design

All user interfaces MUST be designed for phone screens first. Desktop is secondary.

- Touch-friendly spacing with minimum 44px tap targets
- No hover-only interactions permitted
- All layouts must render correctly at 320px width minimum
- If it doesn't feel good on a phone browser, it is wrong

**Rationale**: The app will be distributed as a WebView-wrapped mobile app for alpha. Phone experience is the primary user experience.

### II. Separation of Concerns

Layout generation and data wiring MUST be handled by separate tools with no overlap.

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

**Rationale**: Clean separation prevents conflicts, enables parallel tooling, and maintains clear ownership of concerns.

### III. Auth Assumptions

Supabase Auth is the single source of truth. Authentication state guarantees athlete existence.

- Every authenticated user ALREADY has an athlete record
- Athlete records are created automatically via backend trigger
- The frontend MAY assume: "If the user is authenticated, an athlete row exists"
- No onboarding state machine is required
- No defensive checks for missing athlete records needed

**Rationale**: Simplifies frontend logic by eliminating authentication edge cases. Backend guarantees data integrity.

### IV. Alpha-First Development

Optimize for learning speed over production polish. Breaking changes are acceptable.

- Correctness over polish
- Learn fast, delete freely
- Avoid abstractions you cannot justify
- Prefer explicit code over clever code
- No backwards compatibility requirements during alpha phase

**Rationale**: Alpha phase is for validation. Technical debt is acceptable if it accelerates learning about user needs.

### V. Clarity Over Extensibility

Code should be immediately understandable. Optimize for readability, not future flexibility.

- Do not introduce global state without justification
- Do not add SDK layers on top of Supabase
- Do not refactor layout unless explicitly asked
- Respect existing folder boundaries
- When uncertain, ask before acting

**Rationale**: Premature abstraction creates cognitive overhead. Simple, explicit code is easier to modify and delete.

## Tech Stack Constraints

The following technologies are locked in for the alpha phase:

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js (App Router) | Server components by default |
| Language | TypeScript | Strict mode required |
| Styling | Tailwind CSS | Mobile-first utilities |
| Backend | Supabase | Auth, Postgres, RLS |
| UI Components | Radix UI | Accessible primitives |

### Supabase Usage Rules

- Use `@supabase/supabase-js` exclusively
- Do NOT create ad-hoc clients inline
- Server components MUST use the server client (`lib/supabase/server.ts`)
- Client components MUST use the browser client (`lib/supabase/client.ts`)
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

## Governance

This constitution supersedes all other development practices for this repository.

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

- All PRs must verify alignment with these principles
- Complexity must be justified against Principle V
- Template outputs (spec.md, plan.md, tasks.md) must reference applicable principles

**Version**: 1.0.0 | **Ratified**: 2026-02-04 | **Last Amended**: 2026-02-04
