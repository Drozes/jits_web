# Environment Setup

ELO RATED uses three environments. Each environment should use its own Supabase project to keep data, auth, and RLS policies fully isolated.

## Environments

| Environment   | Purpose                                      | Supabase Project   |
|---------------|----------------------------------------------|--------------------|
| `development` | Local dev against a local or dev Supabase    | Local (`supabase start`) or a dedicated dev project |
| `staging`     | Pre-release testing with production-like data | Separate Supabase project |
| `production`  | Live app serving real users                  | Separate Supabase project |

## Required Variables

### Web (`apps/web/.env.local`)

| Variable                        | Required | Notes |
|---------------------------------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Supabase anon/public key |
| `NEXT_PUBLIC_APP_ENV`           | Yes      | `development`, `staging`, or `production` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | No       | For Web Push notifications |
| `NEXT_PUBLIC_SENTRY_DSN`        | No       | Sentry error tracking DSN |
| `NEXT_PUBLIC_BUILD_ID`          | No       | Auto-set by CI; leave blank locally |

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in your values.

### Mobile (`apps/mobile/.env`)

| Variable                        | Required | Notes |
|---------------------------------|----------|-------|
| `EXPO_PUBLIC_SUPABASE_URL`      | Yes      | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Supabase anon/public key |
| `EXPO_PUBLIC_APP_ENV`           | No       | `development`, `staging`, or `production` |
| `EXPO_PUBLIC_SENTRY_DSN`        | No       | Sentry error tracking DSN |

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in your values.

Mobile env vars are read at build time by the Expo/Metro bundler. For EAS builds, set them in your EAS environment configuration rather than committing `.env` files.

## Switching Environments

Each environment points at a different Supabase project. To switch:

1. Update the `SUPABASE_URL` and `SUPABASE_ANON_KEY` values to point at the target project.
2. Set `APP_ENV` to match (`development`, `staging`, or `production`).

For local development, run `supabase start` in the backend repo (`jr_be/`) and use the local URL (`http://127.0.0.1:54321`) and the anon key printed by the CLI.

### Web

Restart the Next.js dev server after changing `.env.local`.

### Mobile

For local development, restart Metro (`npx expo start --clear`). For EAS builds, configure environment variables in the EAS dashboard or `eas.json` environment secrets. Each EAS build channel (`development`, `preview`, `production`) can target a different Supabase project.

## Supabase Project Isolation

Each environment should have its own Supabase project so that:

- Database schemas and migrations can be tested in staging before production.
- RLS policies are validated in isolation.
- Auth providers (email, OAuth) are configured independently.
- Realtime channels and presence do not leak between environments.
- Storage buckets (match videos) are separate.

Apply migrations to each project independently using `supabase db push` or the Supabase dashboard.
