# Alpha Build Orchestration Plan

**Goal:** Ship first TestFlight (iOS) + Play Internal Test (Android) build of ELO RATED with Gym Manager feature, bot-session-commands, CI/CD, and multi-env Supabase.

**Timeline:** ASAP (days, not weeks)
**Date:** 2026-05-06

## Decisions

| Decision | Value |
|----------|-------|
| Bundle ID | `com.elorated.mobile` |
| App name | ELO RATED |
| Domain | `elorated.com` |
| Platforms | iOS + Android |
| CI/CD | GitHub Actions |
| DB strategy | Staging + Production Supabase |
| Gym manager perms | `gym_managers` junction table |
| Bot commands | Dev/test tool only |
| Universal links | `elorated.com/.well-known/` |

---

## Phase 0: Commit & Stabilize (prerequisite)

**What:** Commit all 57 uncommitted files, merge development -> main.

1. Stage and commit current work in logical groups
2. Run `npm run typecheck` to verify clean
3. Merge development into main
4. Push both branches

**Verification:** `git status` clean, `npm run typecheck` passes, main == development.

---

## Phase 1: Infrastructure (parallelizable)

### 1A: GitHub Actions CI/CD

Create `.github/workflows/ci.yml`:
- Trigger: push to `main`, `development`, and all PRs
- Matrix: typecheck (all workspaces), test (all workspaces), build:web
- Cache: node_modules via `actions/setup-node` with cache
- Mobile bundle smoke: `npx expo export --platform ios --no-bytecode`

### 1B: Multi-Environment Supabase Config

- Create `packages/shared/src/config/env.ts` with environment detection
- Update `apps/web/.env.example` and `apps/mobile/.env.example` with full variable list
- Add env-switching docs to README
- Web: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already exists)
- Mobile: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (already exists)
- Add `NEXT_PUBLIC_APP_ENV` / `EXPO_PUBLIC_APP_ENV` for staging/prod detection
- Supabase CLI: script to create + migrate staging project

### 1C: Sentry Wiring

- Create Sentry project setup instructions doc
- Wire `@sentry/react-native` init in mobile root layout (guarded by DSN env var)
- Wire error boundary to forward to Sentry
- Add `EXPO_PUBLIC_SENTRY_DSN` to env examples
- Web: add `@sentry/nextjs` with basic config (guarded by env var)

### 1D: App Identity Updates

- Update `apps/mobile/app.json`:
  - `name`: "ELO RATED"
  - `slug`: "elo-rated"
  - `ios.bundleIdentifier`: "com.elorated.mobile"
  - `android.package`: "com.elorated.mobile"
  - `scheme`: "elorated" (update from "jits")
  - `owner`: TBD (Expo account)
- Update deep link handler for new scheme
- Update `apps/mobile/app.json` associated domains to `elorated.com`

**Verification:** CI pipeline green on push. `npm run typecheck` passes. App launches with new identity in simulator.

---

## Phase 2: Backend (sequential, in jr_be repo)

### 2A: gym_managers Migration

Create migration in `jr_be/supabase/migrations/`:

```sql
-- gym_managers junction table
CREATE TABLE public.gym_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES public.athletes(id),
  UNIQUE(gym_id, athlete_id)
);

-- RLS
ALTER TABLE public.gym_managers ENABLE ROW LEVEL SECURITY;

-- Anyone can read gym managers
CREATE POLICY gym_managers_select ON public.gym_managers
  FOR SELECT USING (true);

-- Only existing gym managers can add new ones
CREATE POLICY gym_managers_insert ON public.gym_managers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_managers gm
      JOIN public.athletes a ON a.id = gm.athlete_id
      WHERE gm.gym_id = gym_id
      AND a.auth_user_id = auth.uid()
    )
  );

-- Update sessions RLS: only gym managers can create sessions
-- (replaces or supplements current create policy)
```

### 2B: Session Creation RLS Update

Update session creation policy so only gym managers of that gym can create sessions:

```sql
CREATE POLICY sessions_insert_gym_manager ON public.sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_managers gm
      JOIN public.athletes a ON a.id = gm.athlete_id
      WHERE gm.gym_id = sessions.gym_id
      AND a.auth_user_id = auth.uid()
    )
  );
```

### 2C: Bot Session Commands

Update `jr_be/scripts/test-bot/bot.mjs`:
- Add session management commands (session, sessions, activate, endsession)
- Add participation commands (join, leave)
- Add match flow commands (match, random, startmatch, endmatch, record, confirm)
- Update seed command for session-based match history
- Update help output

### 2D: pgTAP Tests

Add tests for:
- gym_managers table CRUD + RLS
- Session creation restricted to gym managers
- Bot seed produces valid session-based match history

**Verification:** `supabase db test` passes. Bot can create sessions, join, match, and seed.

---

## Phase 3: Gym Manager Feature (frontend)

### 3A: Shared Mutations

In `packages/shared/src/api/mutations.ts`:
- Update `createSession` to accept `CreateSessionParams` (title, start, end, max, notes)
- Add `updateSession`, `cancelSession`, `activateSession`, `completeSession`
- Add `isGymManager` query to `packages/shared/src/api/queries.ts`

### 3B: Web Implementation

- `apps/web/app/(app)/gyms/[id]/create-session-dialog.tsx`: dialog with title, time presets, duration, capacity, notes
- Update `apps/web/app/(app)/gyms/[id]/session-list.tsx`: creator controls (activate, cancel, end session)
- Gate "Create Session" button behind `isGymManager` check
- Remove deleted `start-session-button.tsx` references

### 3C: Mobile Implementation

- `apps/mobile/components/session/create-session-sheet.tsx`: bottom sheet with same fields
- Update gym detail screen to show create button for managers
- Add session management controls to session cards for creators

### 3D: Shared Types

- Add `GymManager` type to `packages/shared/src/types/`
- Update `CreateSessionParams` type
- Regenerate database types after migration

**Verification:** `npm run typecheck` passes. Web: can create session with custom params as gym manager. Mobile: same flow works.

---

## Phase 4: Build Pipeline

### 4A: EAS Setup

- Run `eas init` (requires Expo account, will leave clear instructions if can't automate)
- Update `apps/mobile/eas.json` with real project references
- Set EAS secrets for each build profile
- Configure OTA update channel mapping

### 4B: Universal Links

- Create `.well-known/apple-app-site-association` for `elorated.com`
- Create `.well-known/assetlinks.json` for Android
- Document DNS/hosting setup for these files
- Update `apps/mobile/app.json` associated domains

### 4C: Store Assets

- Update app icon and splash screen references
- Prepare screenshot dimensions list
- Draft store description from STORE_LISTING.md

### 4D: Legal Hosting

- Update PRIVACY_POLICY.md and TERMS.md with elorated.com URLs
- Document where to host these (elorated.com/privacy, elorated.com/terms)

**Verification:** `eas build --profile preview --platform all` succeeds. Universal link config validates.

---

## Phase 5: Verification & Ship

### 5A: Full Test Suite

- `npm run typecheck` (all workspaces)
- `npm run test` (all workspaces)
- `npm run build:web`
- `cd apps/mobile && npx expo export --platform ios --no-bytecode`
- E2E smoke tests (web)

### 5B: Alpha Build

- `eas build --profile preview --platform ios`
- `eas build --profile preview --platform android`
- Distribute via TestFlight + Play Internal Testing

### 5C: Smoke Test Checklist

- [ ] App launches, shows login screen
- [ ] Sign up + profile setup completes
- [ ] Dashboard loads with stats
- [ ] Gym list loads, detail shows sessions
- [ ] Gym manager can create session
- [ ] Non-manager cannot create session
- [ ] Join session lobby works
- [ ] Challenge in lobby works
- [ ] Match flow completes (all 8 steps)
- [ ] Push notification received
- [ ] Deep link opens correct screen
- [ ] Leaderboard loads
- [ ] Profile shows stats
- [ ] Settings accessible

**Verification:** Both builds install and pass smoke test checklist.

---

## Execution Order (Parallelism Map)

```
Phase 0 (commit/merge)
  |
  v
Phase 1A + 1B + 1C + 1D  (all parallel)
  |
  v
Phase 2A + 2B (sequential, backend)
  |         \
  v          v
Phase 2C    Phase 3A (shared mutations, needs migration)
  |           |
  v           v
Phase 2D    Phase 3B + 3C (web + mobile parallel)
              |
              v
            Phase 3D (types regen)
              |
              v
            Phase 4A + 4B + 4C + 4D (all parallel)
              |
              v
            Phase 5A -> 5B -> 5C (sequential)
```

## Autonomous Execution Rules

- Commit and push to `development` without asking
- Create PRs to `main` without asking
- Run straight through all phases
- Never read .env files, API keys, or security-sensitive content
- Update CHANGELOG.md with every commit
- Run typecheck after every phase as gate
