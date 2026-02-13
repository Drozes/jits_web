# Jits Arena – Web (Frontend)

This repository contains the **mobile-first web frontend** for **Jits Arena**, a submission-only grappling competition platform.

The frontend is built as a **responsive web app first**, with the intention of being wrapped as a WebView (iOS / Android) for alpha distribution. Native apps are **explicitly out of scope** at this stage.

This repo is optimized for:
- fast iteration
- correctness over polish
- clean separation between layout and logic
- AI-assisted development (Figma Make + Claude Code)

---

## Product Context (High Level)

Jits Arena allows athletes to:
- authenticate
- maintain an athlete profile
- issue and accept challenges
- compete under a simple ruleset
- see results reflected in a global ELO ladder

The frontend talks directly to Supabase for:
- authentication
- reading domain data
- simple writes

Critical or irreversible workflows (ranked matches, ELO updates) will eventually be handled by Supabase Edge Functions.

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (mobile-first)
- **Backend:** Supabase
  - Auth
  - Postgres
  - RLS
- **AI Tools:**
  - Figma Make → layout & presentational components
  - Claude Code → data wiring, logic, refactors

---

## Architectural Principles (Very Important)

### 1. Mobile-first, always
- Design for phone screens first
- Touch-friendly spacing
- No hover-only interactions
- Desktop is secondary

If it doesn’t feel good on a phone browser, it’s wrong.

---

### 2. Separation of concerns (non-negotiable)

**Figma Make**
- Generates layout and presentational components only
- No data fetching
- No auth logic
- No Supabase calls

**Claude Code**
- Wires data
- Handles auth/session logic
- Adds guards, redirects, and mutations
- Must not rewrite layout unless explicitly asked

Never ask both tools to solve the same problem.

---

### 3. Auth assumptions (locked in)

- Supabase Auth is the source of truth
- Every authenticated user **already has an athlete record**
  - Athlete records are created automatically via a backend trigger
- The frontend may assume:
  > “If the user is authenticated, an athlete row exists.”

No onboarding state machine is required.

---

## Repo Structure

```
/app
  /(auth)        // login, signup, reset-password
  /(app)         // authenticated app routes
    page.tsx     // home
    profile/
    challenges/
    gyms/

/components
  /ui            // Figma Make allowed
  /layout        // Figma Make allowed
  /domain        // domain-aware components (Claude only)

/lib
  supabase/
    client.ts
    server.ts
  guards.ts      // auth / athlete guards

/types
  athlete.ts
  challenge.ts
  gym.ts
```

---

## Supabase Usage Rules

- Use `@supabase/supabase-js`
- Do not create ad-hoc clients inline
- Server components use the server client
- Client components use the browser client

The frontend:
- reads tables directly (via RLS)
- performs simple inserts/updates
- does **not** apply ELO logic

---

## Data Flow Pattern

1. Authenticated session is resolved
2. Athlete record is fetched
3. Page renders with typed props
4. Mutations redirect or revalidate

Components do **not** fetch their own data in alpha.

---

## What This Repo Is NOT Responsible For

- ELO calculation logic
- Match integrity enforcement
- Dispute resolution
- Admin tooling
- Marketing pages

Those belong to:
- backend Edge Functions
- separate marketing repo

---

## Development Philosophy

- Alpha-first
- Learn fast
- Delete freely
- Avoid abstractions you can’t justify
- Prefer explicit code over clever code

Breaking changes are acceptable during alpha.

---

## AI Tooling Guidance (For Claude Code)

When modifying this repo:
- Do not introduce global state without justification
- Do not add SDK layers on top of Supabase
- Do not refactor layout unless explicitly asked
- Respect existing folder boundaries
- Optimize for clarity, not extensibility

If uncertain, ask before acting.

---

## Goal of the Alpha Frontend

The frontend is “ready” when:
- A user can sign up and log in
- They immediately see their athlete profile
- They can create and accept challenges
- State updates are reflected correctly

Everything else is optional.
