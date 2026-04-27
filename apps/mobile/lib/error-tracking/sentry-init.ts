import * as Sentry from "@sentry/react-native";

/**
 * Sentry initialization for the mobile app.
 *
 * Reads the DSN from `EXPO_PUBLIC_SENTRY_DSN` (must be EXPO_PUBLIC_*-prefixed
 * so Expo inlines the value at bundle time). When the DSN is missing -- which
 * is the expected case in local dev where developers have not provisioned a
 * Sentry project -- we no-op with a single warn instead of throwing so the
 * dev loop is unaffected.
 *
 * Call this once at module load (before any UI renders) so native crashes
 * that happen during JS bootstrap can still be captured.
 */
let initialized = false;

export function initSentry(): void {
  if (initialized) return;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        "[sentry] EXPO_PUBLIC_SENTRY_DSN not set; skipping initialization",
      );
    }
    return;
  }

  Sentry.init({
    dsn,
    enableNative: true,
    // 10% transaction sampling for beta -- bumps the volume down before
    // we have data to know what's noise vs. signal.
    tracesSampleRate: 0.1,
    environment: __DEV__ ? "development" : "production",
    // Disable debug logging in production builds.
    debug: __DEV__,
  });

  initialized = true;
}

/**
 * Forwards an error to Sentry. No-op when Sentry hasn't been initialized
 * (DSN missing). Safe to call from `componentDidCatch`, mutation error
 * handlers, or anywhere else uncaught errors surface.
 */
export function captureError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
