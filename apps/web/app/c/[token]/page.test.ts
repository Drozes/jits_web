// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/invites/preview", () => ({
  getInvitePreviewCached: async () => ({
    state: "open",
    kind: "challenge",
    inviter: { first_name: "Alex", last_initial: "R", avatar_url: null, current_elo: 1482, weight_lbs: 172 },
    short_code_display: null,
  }),
}));
vi.mock("@/lib/invites/viewer", () => ({ getInviteViewer: async () => ({ state: "signed_out" }) }));
vi.mock("@/components/invites/invite-landing", () => ({ InviteLanding: () => null }));

import { generateMetadata } from "./page";

const params = Promise.resolve({ token: "e2eChallengeTokenAAAAA" });

describe("/c/[token] generateMetadata", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("resolves the og:image against the public origin, never VERCEL_URL", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "jitsweb-abc123-team.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://elorated.com");
    const meta = await generateMetadata({ params });
    expect(meta.metadataBase?.toString()).toBe("https://elorated.com/");
  });

  it("uses the challenge title and keeps the page out of search and referrers", async () => {
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe("ALEX R. challenges you | ELO RATED");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.referrer).toBe("no-referrer");
  });
});
