import type { InAppBrowser, InviteKind, LandingStep } from "./types";

type TapStep = Exclude<LandingStep, "landing_viewed">;

/**
 * Fire-and-forget landing telemetry (POST /api/invite-events, contract 6).
 * sendBeacon survives the page unloading into the App Store or the app;
 * fetch keepalive is the fallback. Never throws. `kind` is the invite kind
 * the page shows (null on the unavailable page) so taps can be split by kind.
 */
export function sendLandingEvent(
  token: string,
  step: TapStep,
  inAppBrowser: InAppBrowser,
  kind: InviteKind | null = null,
): void {
  try {
    const body = JSON.stringify({ token, step, in_app_browser: inAppBrowser, kind });
    const blob = new Blob([body], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.("/api/invite-events", blob)) {
      return;
    }
    void fetch("/api/invite-events", {
      method: "POST",
      body,
      keepalive: true,
      headers: { "content-type": "application/json" },
    }).catch(() => {});
  } catch {
    // Telemetry must never break the page.
  }
}
