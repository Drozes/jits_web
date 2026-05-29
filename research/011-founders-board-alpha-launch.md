# 011, Founders Task Board: alpha-launch card set

Durable record of the internal Founders Task Board content (the Kanban at
`/design/board`). Captured here because the board's data lives in a local-only
Supabase table (`admin_cards`) that gets wiped whenever the local DB is rebuilt
from the remote. This doc is the source of truth until the table is published to
the remote (see "Operational notes").

## What the board is

A lightweight, internal Kanban for the founders to track the path to **alpha
launch** (a first limited/closed release to real users, not full GA). It is the
seed of a future admin dashboard (user counts, gym signups, tooling). It lives
under the login-gated `/design` section; cards are stored in `public.admin_cards`.

## Card set (alpha launch)

Columns: **To Do / Doing / Done**. Beads IDs referenced where tracked.

### Done
- **Founders board live**: internal Kanban at `/design/board`, Supabase-backed,
  login-gated.

### Doing
- **Mobile rebrand**: elo-system primitives + first/last-name signup + Google
  SSO (in-progress branch; needs `EXPO_PUBLIC_GOOGLE_*` client IDs, `jits-0of`).

### To Do, alpha blockers (must-have to put it in real users' hands)
- **Fix video upload reliability**: P0 cluster (orphan files on failed insert,
  POST vs PUT retry 400, videoId lost on unmount, retry double-orphan).
  `jits-1v6`, `jits-81l`, `jits-hu0`, `jits-voh`.
- **Web auth works end-to-end**: add email/password sign-in on `/login`
  (`jits-rvy`) and fix signup gym load blocked by anon RLS (`jits-ism`).
- **EAS setup**: `eas init`, fill `app.json` placeholders (`projectId`,
  `updates.url`), add EAS secrets (Sentry DSN, Supabase URL/anon, Google IDs).
- **Cut a real alpha build**: `eas build --profile preview` plus distribution
  via TestFlight / Play internal testing.
- **Fix web production build**: pre-existing `/` break ("uncached data outside
  `<Suspense>`") currently fails `build:web`; needed if web is part of alpha.

### To Do, should-have for alpha
- **Host universal-link files**: AASA + `assetlinks.json` at
  `elorated.com/.well-known` (real Apple Team ID + SHA256).
- **Host privacy policy + terms**: `PRIVACY_POLICY.md` / `TERMS.md` at public
  URLs; link from store listings.
- **Store listings**: screenshots at required resolutions + metadata (App Store
  + Play data-safety form).
- **Demo recorder**: repair scenes hitting hidden routes (`jits-asw`), if demos
  are part of the alpha push.
- **Publish `admin_cards` to remote + tighten board RLS**: makes this board
  durable and shared, stops the reset-wipes (`jits-5sz` / `jits-ali`).
- **Restructure `/design` into `/admin`**: design as a sub-section, dashboard
  with user/gym counts (`jits-cjo`).
- **Fix stale JITS branding**: README still says JITS (`jits-297`).

## Operational notes

- **Storage**: `public.admin_cards` exists only on the LOCAL Supabase instance
  (applied via `jr_be/supabase/migrations/20260529000000_admin_cards.sql`, run
  directly with `psql`). It is NOT on the remote, so any local DB reset/rebuild
  drops it. Re-apply that migration to recreate the empty table, then re-seed
  from this doc.
- **Why it keeps disappearing**: the local DB is rebuilt from the remote, which
  has no `admin_cards`. Durable fix is publishing to the remote (`jits-5sz`).
- **Login (local only)**: `founder@elorated.test` / `EloRated123!` (created via
  GoTrue signup + force-confirm; wiped on DB reset, recreate as needed).
- **App footprint**: kept intentionally small. The only shared-app-surface
  change is `apps/web/lib/supabase/proxy.ts` (removed `/design` from
  `publicPaths` so the section is login-gated). Board code is isolated under
  `apps/web/app/design/board/`; shared API additions are additive.
