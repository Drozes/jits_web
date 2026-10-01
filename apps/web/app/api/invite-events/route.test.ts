// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const logLandingEvent = vi.fn();
vi.mock("@/lib/invites/landing-events", async (orig) => ({
  ...(await orig<typeof import("@/lib/invites/landing-events")>()),
  logLandingEvent: (...a: unknown[]) => logLandingEvent(...a),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const TOKEN = "e2eChallengeTokenAAAAA";
const post = (body: unknown) =>
  POST(new NextRequest("https://elorated.test/api/invite-events", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/invite-events", () => {
  beforeEach(() => logLandingEvent.mockReset().mockResolvedValue(undefined));

  it("passes a valid kind through", async () => {
    const res = await post({ token: TOKEN, step: "app_store_tapped", in_app_browser: "instagram", kind: "challenge" });
    expect(res.status).toBe(204);
    expect(logLandingEvent).toHaveBeenCalledWith(TOKEN, "app_store_tapped", { in_app_browser: "instagram", kind: "challenge" });
  });

  it("stores an unknown kind as null", async () => {
    await post({ token: TOKEN, step: "link_copied", in_app_browser: null, kind: "bogus" });
    expect(logLandingEvent).toHaveBeenCalledWith(TOKEN, "link_copied", { in_app_browser: null, kind: null });
  });

  it("refuses landing_viewed and malformed tokens", async () => {
    expect((await post({ token: TOKEN, step: "landing_viewed" })).status).toBe(400);
    expect((await post({ token: "short", step: "link_copied" })).status).toBe(400);
    expect(logLandingEvent).not.toHaveBeenCalled();
  });
});
