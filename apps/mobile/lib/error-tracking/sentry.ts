import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { darkTokens as t } from "../tokens";

const processEnv: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

// Prefer the value baked into the manifest by app.config.js (reliable in
// release/TestFlight bundles), then fall back to the EXPO_PUBLIC_* env (local
// dev). Mirrors lib/env.ts: relying on EXPO_PUBLIC_* inlining alone silently
// dropped the value from release builds before.
const extra = Constants.expoConfig?.extra ?? {};
const dsn =
  (extra.SENTRY_DSN as string | undefined) ?? processEnv.EXPO_PUBLIC_SENTRY_DSN;
const appEnv =
  (extra.APP_ENV as string | undefined) ??
  processEnv.EXPO_PUBLIC_APP_ENV ??
  "development";

let initialized = false;

/**
 * On-brand styling for the Sentry feedback form. The app is dark-first (opens
 * dark, defaults to it), so the form is themed dark: Signal Red submit, sharp
 * 4px corners, no shadows.
 */
const FEEDBACK_STYLES = {
  container: { backgroundColor: t.bgPrimary },
  title: { color: t.textPrimary },
  label: { color: t.textTertiary },
  input: {
    backgroundColor: t.bgElevated,
    color: t.textPrimary,
    borderColor: t.borderHairline,
    borderRadius: 4,
  },
  textArea: {
    backgroundColor: t.bgElevated,
    color: t.textPrimary,
    borderColor: t.borderHairline,
    borderRadius: 4,
    minHeight: 120,
  },
  submitButton: { backgroundColor: t.accentCta, borderRadius: 4 },
  submitText: { color: t.textOnAccent },
  cancelButton: { borderColor: t.borderHairlineStrong, borderRadius: 4 },
  cancelText: { color: t.textPrimary },
  screenshotButton: { borderColor: t.borderHairlineStrong, borderRadius: 4 },
  takeScreenshotButton: {
    borderColor: t.borderHairlineStrong,
    borderRadius: 4,
  },
};

/**
 * Initialize Sentry error tracking and the in-app feedback flow. No-ops
 * gracefully when `EXPO_PUBLIC_SENTRY_DSN` is not set, so the app works fine
 * in local development without a DSN.
 *
 * Call once at the top of the root layout, before any component renders. The
 * root layout must also be wrapped in `Sentry.wrap()` for the feedback form
 * (and shake-to-report) to render; `Sentry.wrap` mounts the form provider.
 */
export function initSentry(): void {
  if (initialized) return;
  if (!dsn || dsn === "your-sentry-dsn-here") return;

  Sentry.init({
    dsn,
    environment: appEnv,
    enabled: !__DEV__,
    tracesSampleRate: 0.1,
    // Attach a screenshot of the screen at the moment an error is captured.
    attachScreenshot: true,
    attachStacktrace: true,
    integrations: (integrations) => [
      ...integrations,
      Sentry.feedbackIntegration({
        // Shake the device on any screen to open the feedback form. iOS uses
        // UIKit motion detection, Android the accelerometer; no permissions and
        // no expo-sensors needed.
        enableShakeToReport: true,
        // "Capture this screen" button: snapshots what the user is looking at
        // and attaches it to the report.
        enableTakeScreenshot: true,
        showBranding: false,
        showName: true,
        showEmail: true,
        isNameRequired: false,
        isEmailRequired: false,
        // Name/email prefill comes from the Sentry user scope (set by
        // setSentryUser()); the form reads `_getUser()` directly. We do NOT
        // pass `useSentryUser` here: in 8.11.1 its values are used verbatim, so
        // `{ email: "email" }` would prefill the literal string "email".
        colorScheme: "dark",
        formTitle: "Report a bug",
        messageLabel: "What happened?",
        messagePlaceholder:
          "What went wrong, and what did you expect instead?",
        submitButtonLabel: "Send feedback",
        cancelButtonLabel: "Cancel",
        addScreenshotButtonLabel: "Attach a screenshot",
        captureScreenshotButtonLabel: "Capture this screen",
        removeScreenshotButtonLabel: "Remove screenshot",
        successMessageText: "Thanks, we got it.",
        styles: FEEDBACK_STYLES,
      }),
    ],
  });

  initialized = true;
}

/** Whether Sentry is live (a real DSN was provided and init ran). */
export function isSentryEnabled(): boolean {
  return initialized;
}

/** Open the Sentry feedback form. No-ops when Sentry is not initialized. */
export function showFeedback(): void {
  if (!initialized) return;
  Sentry.showFeedbackForm();
}

/**
 * Attribute errors and feedback to the signed-in athlete so reports are
 * actionable, and so the feedback form prefills name/email. No-ops when Sentry
 * is not initialized.
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  username?: string;
}): void {
  if (!initialized) return;
  // `username` is Sentry's standard attribution/search field; `name` is what the
  // feedback form reads to prefill the Name input (it falls back to the scope
  // user's `name`, which the Sentry User type allows via its index signature).
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.username,
  });
}

/**
 * Clear the attributed user on sign-out. No-ops when Sentry is not initialized.
 */
export function clearSentryUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
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
