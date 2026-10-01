import { NextResponse, type NextRequest } from "next/server";
import { INVITE_TOKEN_RE } from "@/lib/invites/constants";
import { isLandingStep, logLandingEvent } from "@/lib/invites/landing-events";
import type { InAppBrowser, InviteKind } from "@/lib/invites/types";

const IN_APP_BROWSERS = new Set(["instagram", "facebook", "messenger", "other"]);
const KINDS = new Set(["join", "challenge"]);

/**
 * Landing tap telemetry (contract 6): `{ token, step, in_app_browser, kind }` ->
 * log_invite_landing_event with the service key, 204. landing_viewed is
 * logged server-side by the proxy on GET and is refused here. Rate limited
 * by the Vercel firewall rule on /api/invite-events.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!body || typeof body !== "object") return new NextResponse(null, { status: 400 });
  const { token, step, in_app_browser, kind } = body as Record<string, unknown>;

  if (typeof token !== "string" || !INVITE_TOKEN_RE.test(token)) {
    return new NextResponse(null, { status: 400 });
  }
  if (!isLandingStep(step) || step === "landing_viewed") {
    return new NextResponse(null, { status: 400 });
  }
  const iab: InAppBrowser =
    typeof in_app_browser === "string" && IN_APP_BROWSERS.has(in_app_browser)
      ? (in_app_browser as InAppBrowser)
      : null;

  // kind is client-reported and only labels the event (contract 4.14 detail);
  // anything other than join or challenge is stored as null.
  const inviteKind: InviteKind | null =
    typeof kind === "string" && KINDS.has(kind) ? (kind as InviteKind) : null;

  await logLandingEvent(token, step, { in_app_browser: iab, kind: inviteKind });
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
