import Constants from "expo-constants";

type EnvKey = "SUPABASE_URL" | "SUPABASE_ANON_KEY";
type OptionalEnvKey = "FACEBOOK_APP_ID";

// `process.env` is injected at build time by the Expo/Metro bundler.
// Avoid pulling in `@types/node` just for this; reach via a structural cast.
const processEnv: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

/**
 * Reads an environment value at call time. Prefers `Constants.expoConfig.extra`
 * (which can be set via `app.config.js`), then falls back to
 * `process.env.EXPO_PUBLIC_*`.
 *
 * Throws at call time (not module-load time) so that `expo export` and other
 * static analysis can still load the bundle without secrets present.
 */
function readEnv(key: EnvKey): string {
  const fromExtra = Constants.expoConfig?.extra?.[key];
  if (typeof fromExtra === "string" && fromExtra.length > 0) return fromExtra;

  const fromProcess = processEnv[`EXPO_PUBLIC_${key}`];
  if (typeof fromProcess === "string" && fromProcess.length > 0) return fromProcess;

  throw new Error(
    `Missing env var: EXPO_PUBLIC_${key}. Set it in apps/mobile/.env or via app.config.js extras.`,
  );
}

/**
 * An OPTIONAL value: extra first, then `process.env.EXPO_PUBLIC_*`, trimmed;
 * absent or blank is null, never a throw.
 */
function readOptionalEnv(key: OptionalEnvKey): string | null {
  const fromExtra = Constants.expoConfig?.extra?.[key];
  if (typeof fromExtra === "string" && fromExtra.trim().length > 0) return fromExtra.trim();

  const fromProcess = processEnv[`EXPO_PUBLIC_${key}`];
  if (typeof fromProcess === "string" && fromProcess.trim().length > 0) return fromProcess.trim();

  return null;
}

/**
 * Lazy-evaluating env accessor. Each access reads the value fresh, ensuring
 * `expo export` can bundle without env vars set (the throw only fires when
 * code actually reads `env.supabaseUrl` at runtime).
 */
export const env = {
  get supabaseUrl(): string {
    return readEnv("SUPABASE_URL");
  },
  get supabaseAnonKey(): string {
    return readEnv("SUPABASE_ANON_KEY");
  },
  /**
   * Meta (Facebook) App ID for the Instagram Reels handoff
   * (`docs/meta-app-setup.md`). Optional: null means the Reels path is not
   * offered and sharing uses the system share sheet.
   */
  get facebookAppId(): string | null {
    return readOptionalEnv("FACEBOOK_APP_ID");
  },
};
