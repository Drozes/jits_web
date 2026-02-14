# CLAUDE.md — JITS Web Development Principles

## Project Overview

JITS Web is a BJJ competitor matchmaking app built with Next.js 16, Supabase, Tailwind CSS, and shadcn/ui. The backend lives in a separate repo — this is frontend only.

**Backend repo:** `/Users/msponagle/code/experiments/jr_be/`
- Supabase migrations in `supabase/migrations/`
- DB tests in `supabase/tests/`
- Feature specs in `specs/`
- Read the BE repo's `README.md` and migrations when you need to understand the database schema, RLS policies, or business rules.

## Architecture

- **Framework:** Next.js 16 App Router with `cacheComponents` enabled
- **Auth/DB:** Supabase (server client for RSC, browser client for client components)
- **Styling:** Tailwind CSS + shadcn/ui component library
- **Guards:** `requireAuth()` → `requireAthlete()` → progressive auth checks in `lib/guards.ts`

### Directory Structure

```
app/(app)/          # Authenticated app routes (layout with nav shell)
components/
  domain/           # Business-logic components (athlete-card, match-card, etc.)
  layout/           # Shell components (app-header, bottom-nav-bar, page-container)
  profile/          # Profile-specific components
  ui/               # shadcn/ui primitives (DO NOT edit manually)
lib/
  supabase/         # Server and browser Supabase clients
  guards.ts         # Auth guard functions
  utils.ts          # Shared utilities (cn, helpers)
types/              # database.ts (generated) + per-table aliases
```

### Naming Conventions

- **Files:** kebab-case (`athlete-card.tsx`, `match-card.tsx`)
- **Components:** PascalCase (`AthleteCard`, `MatchCard`)
- **Types:** PascalCase (`Athlete`, `AthleteInsert`)

## Code Quality Principles

### 1. Keep Components Short

- **Target: under 80 lines per component.** If a component exceeds this, split it.
- Server data-fetching components can stretch to 120 lines but no further.
- Extract sub-components into the same file or sibling files.

### 2. Don't Duplicate Logic

When you see the same logic in 2+ files, extract it to `lib/utils.ts`. Before writing a new helper, check if one already exists there.

**Currently duplicated (tech debt — extract when you touch these files):**
- `getInitials(name)` — duplicated in 5 files
- Win/loss/winRate computation from outcomes — duplicated in 6 files
- Gym name fetching by `primary_gym_id` — duplicated in 3 files
- Relative date formatting — duplicated in 2 files

### 3. Supabase FK Joins Return Arrays

FK joins like `athletes!fk_name(col)` return `T[]`, not `T`. Always access with `[0]`:
```ts
const gymsArr = a.gyms as { name: string }[] | null;
const gymName = gymsArr?.[0]?.name ?? null;
```

### 4. Stats Are Computed, Not Stored

The `athletes` table has no `wins`, `losses`, `win_streak`, or `belt_rank` columns. All stats come from querying `match_participants` and filtering by `outcome`.

### 5. Suspense Is Mandatory for Async Server Components

Next.js 16 with `cacheComponents` requires all async data-fetching components to be wrapped in `<Suspense>`. The pattern:

```tsx
// page.tsx — synchronous, wraps content in Suspense
export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content />
    </Suspense>
  );
}

// content.tsx — async, does data fetching
async function Content() {
  const data = await fetchData();
  return <div>{data}</div>;
}
```

`export const dynamic` route segment config is NOT compatible with `cacheComponents`. Use Suspense instead.

### 6. Dynamic Route Params Are Promises

In Next.js 16, `params` is a `Promise`. Await it inside the Suspense boundary, not in the page component:
```tsx
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Content paramsPromise={params} />
    </Suspense>
  );
}
```

### 7. Client vs Server Components

- Default to **server components** unless you need interactivity (state, effects, event handlers).
- Client components must have `"use client"` at the top.
- Never fetch Supabase data in client components for initial loads — fetch server-side and pass as props.

### 8. Props Design

When passing 4+ related fields about the same entity, group them into an object prop. New components should follow this pattern. Existing components using granular props are tech debt — refactor when touched.

### 9. Color Tokens for Stats

Use these consistently across all stat displays:
- **Wins/positive:** `text-green-500`
- **Losses/negative:** `text-red-500`
- **Primary/ELO:** `text-primary`
- **Neutral stats:** default text color with `tabular-nums`

### 10. Avoid Premature Abstraction

Don't create abstractions for things used once. Don't add error handling for impossible states. This is alpha — ship fast, refactor when real patterns emerge. The threshold for extraction is 2+ usages across files (see Principle 2).

## UI Kit Maintenance

### shadcn/ui Components (`components/ui/`)

- **Never edit these files manually.** They are managed by `npx shadcn@latest add <component>`.
- To customize, use Tailwind classes in the consuming component or extend via `cn()`.
- Currently installed: `avatar`, `badge`, `button`, `card`, `dialog`, `input`, `label`, `select`, `separator`, `sheet`, `switch`, `tabs`

### Domain Components (`components/domain/`)

Custom business components. Each should:
- Have a clear, typed props interface
- Be under 80 lines
- Use CVA for variant-based styling when there are visual variants (see `elo-badge.tsx`)
- Not duplicate logic that belongs in `lib/utils.ts`

### Layout Components (`components/layout/`)

Shell components that define the app's structure:
- `app-header.tsx` — top bar with title, back button, optional actions
- `bottom-nav-bar.tsx` — tab navigation (Home, Arena, Leaderboard, Profile)
- `page-container.tsx` — content wrapper with consistent padding

## Known Tech Debt (Priority Order)

**High — functional issues:**
- [x] `proxy.ts` — already correctly named for Next.js 16 (`proxy` convention, not `middleware`)
- [x] `update-password-form.tsx` redirect fixed to `/`

**Medium — duplication cleaned up:**
- [x] `getInitials()` extracted to `lib/utils.ts`
- [x] `computeStats()` and `computeWinStreak()` extracted to `lib/utils.ts`
- [x] `extractGymName()` extracted to `lib/utils.ts`

**Low — code style improvements:**
- [x] `share-profile-sheet.tsx` refactored to use `athlete` object prop
- [ ] Auth form components (`login-form`, `sign-up-form`, `forgot-password-form`) share ~70% identical code

## Key FK Join Names

```
Athletes -> Gyms:              gyms!athletes_primary_gym_id_fkey(name)
Match participants -> Athletes: athletes!fk_participants_athlete(display_name)
Challenges -> Challenger:       athletes!fk_challenges_challenger(display_name)
Matches -> Participants:        matches!fk_participants_match(completed_at, status)
```

## Backend Integration

**Full reference:** [research/005-backend-reference.md](research/005-backend-reference.md)

Read this doc before building challenge, match, or ELO features. Key points:

- **Athlete activation** requires `primary_gym_id` to be set (trigger-based, not `current_weight`)
- **Challenges:** INSERT with RLS validation, max 3 pending, opponent must be `active`
- **Starting matches:** use `start_match_from_challenge()` RPC, never direct INSERT
- **ELO stakes preview:** use `calculate_elo_stakes()` RPC for display
- **ELO updates:** frontend responsible for computing + writing new ELO (no backend service yet)

### Frontend/Backend Discrepancies (Must Fix)

1. **Activation trigger uses `primary_gym_id`, not `current_weight`** — setup must include gym picker
2. **Weight units unclear** — `athletes.current_weight` constraint is 0-500 with no unit. Challenge weights are explicitly lbs.
3. **Challenge creation not implemented** — button disabled on competitor profile
4. **No gym selection in setup** — required for backend activation
5. **Match flow not implemented** — RPC exists but no frontend screens
