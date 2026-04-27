# JITS

JITS is a Brazilian Jiu-Jitsu (BJJ) competitor matchmaking app. Athletes check in to a session at their gym, get paired with a partner near their size and skill, run a structured ranked or casual match (timer, video recording, confirm/dispute), and track their ELO rating over time.

This repo is an npm-workspaces monorepo:

- `apps/web/`, Next.js 16 web app (active beta).
- `apps/mobile/`, Expo SDK 54 React Native app (beta-ready, EAS builds pending).
- `packages/shared/` (`@jits/shared`), the cross-platform data layer (queries, mutations, types, hooks, utilities) consumed by both apps.

The Supabase backend (Postgres + RLS + Edge Functions + Realtime + Storage) lives in a separate repo at `/Users/msponagle/code/experiments/jr_be/`.

## Tech Stack

- **Frontend (web):** Next.js 16 App Router (`cacheComponents`), React 19, Tailwind CSS, shadcn/ui, Geist Sans.
- **Frontend (mobile):** Expo SDK 54, Expo Router, React Native 0.81, NativeWind v4, gluestack-style native primitives, gorhom/bottom-sheet, lucide-react-native.
- **Backend:** Supabase (Auth, Postgres + RLS, Realtime via Postgres Changes + Broadcast + Presence, Storage for `match-videos` and `athlete-photos`).
- **Native bits:** `expo-camera` (video), `expo-secure-store` (token persistence), `expo-notifications` (push), `expo-location`, `expo-haptics`, `expo-keep-awake`, `@react-native-community/netinfo`, `@sentry/react-native`.
- **Testing:** Vitest + React Testing Library + Playwright (web). Mobile has no test suite yet.
- **Tooling:** TypeScript, ESLint, Husky pre-commit (`npm run typecheck` + `npm run test` across workspaces).

## Quick Start

```bash
# Install everything (root, since it's a workspaces install)
npm install
```

Set up environment variables. Each app has its own `.env.example`.

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Both apps need a Supabase URL and anon key (the same project values).

### Web

```bash
npm run dev:web                  # next dev on apps/web (http://localhost:3000)
npm run build:web                # next build
npm run test:web                 # vitest
cd apps/web && npm run test:e2e  # playwright
```

### Mobile

```bash
cd apps/mobile
npx expo start                   # dev server; press i (iOS) / a (Android) / w (web preview)
```

For native modules (camera, notifications, secure-store) you need a development build, not Expo Go:

```bash
cd apps/mobile
eas build --profile development --platform ios     # or android
```

### Shared package

`@jits/shared` is consumed by source (`"main": "src/index.ts"`); nothing to build. Changes are picked up by both apps automatically.

```bash
npm run typecheck:shared
```

## Repo Layout

```
apps/web/         Next.js 16 frontend (web)
apps/mobile/      Expo React Native frontend (iOS + Android)
packages/shared/  @jits/shared, cross-platform data layer
research/         architecture references and integration briefs
specs/            feature specs
```

For the full directory tree (per app) plus naming conventions, code-quality principles, and the data-access function inventory, see [CLAUDE.md](CLAUDE.md). For the design system (color tokens, components, interaction patterns), see [DESIGN.md](DESIGN.md).

## Repo-Wide Scripts (root `package.json`)

| Script | What it does |
| --- | --- |
| `npm run dev:web` | `next dev` in `apps/web/` |
| `npm run build:web` | `next build` in `apps/web/` |
| `npm run test:web` | Vitest in `apps/web/` |
| `npm run start:mobile` | `expo start` in `apps/mobile/` |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run typecheck:web` / `:mobile` / `:shared` | Per-workspace typecheck |
| `npm run test` | `npm run test --workspaces --if-present` |
| `npm run db:types` | Regenerate `packages/shared/src/types/database.ts` from the local Supabase instance in the backend repo |

A Husky `pre-commit` hook runs `typecheck` and `test` across workspaces. Don't bypass it.

## Beta Launch Status (2026-04-27)

Phase 1 through 5 shipped on 2026-04-27. The mobile app is feature-complete for the beta scope: auth, dashboard, gyms, leaderboard, sessions (join wizard + lobby), live match flow with video recording, push notifications, online presence, deep links (`jits://` + universal links to `jits.app`), error boundary, offline banner + mutation queue, EAS Build config, and Sentry wiring.

Outstanding before the first store submission:
- Replace placeholders in `apps/mobile/app.json` (bundle identifier, package, EAS project ID, updates URL).
- Host AASA + Android `assetlinks.json` files at `https://jits.app/.well-known/`.
- Set Sentry `org`/`project` and a real `EXPO_PUBLIC_SENTRY_DSN`.
- Capture screenshots from a TestFlight build.
- Run the 18-item checklist in [STORE_LISTING.md](STORE_LISTING.md).
- Replace [PRIVACY_POLICY.md](PRIVACY_POLICY.md) and [TERMS.md](TERMS.md) drafts with legal-reviewed copy hosted at public URLs.

## Contributing

See [CLAUDE.md](CLAUDE.md). Highlights:
- Components stay short; data fetching uses the shared `@jits/shared/api` layer; no raw `.from()` / `.rpc()` calls in new code.
- Web wraps async server components in `<Suspense>` (Next.js 16 `cacheComponents`); mobile fetches via `useEffect` + cancellation-gated state writes.
- Color tokens (`text-success`, `text-destructive`, `text-amber-500`, default foreground for ELO) are mandatory for stat displays.
- Always update `CHANGELOG.md` under `## [Unreleased]` on every commit.
