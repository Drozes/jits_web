import * as Sentry from "@sentry/react-native";

const processEnv: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

const dsn = processEnv.EXPO_PUBLIC_SENTRY_DSN;
const appEnv = processEnv.EXPO_PUBLIC_APP_ENV || "development";

let initialized = false;

/**
 * Initialize Sentry error tracking. No-ops gracefully when
 * `EXPO_PUBLIC_SENTRY_DSN` is not set, so the app works fine
 * in local development without a DSN.
 *
 * Call once at the top of the root layout, before any component renders.
 */
export function initSentry(): void {
  if (initialized) return;
  if (!dsn || dsn === "your-sentry-dsn-here") return;

  Sentry.init({
    dsn,
    environment: appEnv,
    tracesSampleRate: 0.1,
    enabled: !__DEV__,
  });

  initialized = true;
}

/**
 * Report an error to Sentry. Safe to call even when Sentry is not
 * initialized; the call is silently dropped.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;

  Sentry.captureException(error, context ? { extra: context } : undefined);
}
