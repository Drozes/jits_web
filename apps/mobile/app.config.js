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

  // Sentry source-map / dSYM upload is configured from the environment so no
  // org/project/token live in the repo. The native SDK is autolinked
  // regardless (crash + feedback capture works without this), so the Expo
  // plugin (which only adds the build-time symbol upload) is added ONLY when
  // ALL of org + project + auth token are present. Requiring the token too
  // means a credential-less build never attempts (and can't fail on) an
  // upload, and `expo export` stays clean before the values are provided.
  const plugins = [...(config.plugins ?? [])];
  if (
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.SENTRY_AUTH_TOKEN
  ) {
    plugins.push([
      "@sentry/react-native/expo",
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        url: process.env.SENTRY_URL || "https://sentry.io/",
      },
    ]);
  }

  return {
    ...config,
    plugins,
    extra: {
      ...config.extra,
      SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      // Bake the Sentry runtime config into the manifest (EXConstants) so it is
      // embedded reliably in release bundles, independent of the flaky
      // EXPO_PUBLIC_* Metro inlining (same hardening as the Supabase values
      // above). sentry.ts reads these from Constants.expoConfig.extra first.
      SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
      APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    },
  };
};
