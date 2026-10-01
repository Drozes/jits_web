import "server-only";
import { createInviteAdminClient } from "./admin-client";
import type { InAppBrowser, InviteKind, LandingStep } from "./types";

export const LANDING_STEPS: readonly LandingStep[] = [
  "landing_viewed",
  "open_in_app_tapped",
  "app_store_tapped",
  "link_copied",
  "code_viewed",
];

export function isLandingStep(value: unknown): value is LandingStep {
  return typeof value === "string" && (LANDING_STEPS as readonly string[]).includes(value);
}

/**
 * Landing telemetry via log_invite_landing_event (contract 4.14). Detail is
 * limited to in_app_browser and kind: never IP, user agent or device id.
 * Best effort: a failure is swallowed so it never breaks the page.
 */
export async function logLandingEvent(
  token: string,
  step: LandingStep,
  detail: { in_app_browser: InAppBrowser; kind: InviteKind | null },
): Promise<void> {
  if (process.env.E2E_INVITE_FIXTURES === "1") return;
  const admin = createInviteAdminClient();
  if (!admin) return;
  await admin.rpc("log_invite_landing_event", {
    p_token: token,
    p_step: step,
    p_detail: detail,
  });
}
