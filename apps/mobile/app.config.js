// Dynamic Expo config.
//
// Why this file exists: the public Supabase credentials are read at startup by
// lib/env.ts. They MUST be present in the production JS bundle or the app throws
// at launch ("Missing env var: EXPO_PUBLIC_SUPABASE_URL") -> uncaught error ->
// SIGABRT. Relying on Metro's `EXPO_PUBLIC_*` inlining is unreliable for release
// `expo export:embed` / EAS bundles (it shipped two launch-crashing TestFlight
// builds). This config reads the values from the build environment and writes
// them to `extra`, which:
//   - lib/env.ts reads FIRST (before process.env), and
//   - is embedded into the app via the config manifest (EXConstants app.config),
//     independent of the flaky `EXPO_PUBLIC_*` inlining transform.
//
// On EAS the values come from eas.json `env`; locally they come from
// apps/mobile/.env (both loaded into process.env before this runs).
const REQUIRED_ENV = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"];

module.exports = ({ config }) => {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

  // Fail the EAS build loudly rather than ship a binary that crashes on launch.
  // EAS sets both EAS_BUILD=true and EAS_BUILD_PROFILE=<profile> on its builders;
  // check both so a change to either signal can't silently disable this guard.
  const isEasBuild =
    process.env.EAS_BUILD === "true" || Boolean(process.env.EAS_BUILD_PROFILE);
  if (missing.length > 0 && isEasBuild) {
    throw new Error(
      `[app.config] Missing required env on EAS build: ${missing.join(", ")}. ` +
        `Set them in the EAS environment (eas env:list) or eas.json "env".`,
    );
  }
  if (missing.length > 0) {
    // Local dev: only Supabase breaks, not the whole app -- warn and continue.
    console.warn(`[app.config] Missing env (local build): ${missing.join(", ")}`);
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  };
};
