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
    expect(meta.description).toBe("A jiu-jitsu challenge. Tap to accept.");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.referrer).toBe("no-referrer");
  });
});

describe("/c/[token] Smart App Banner", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function metaWith(appStoreUrl: string | undefined, token = "e2eChallengeTokenAAAAA") {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", appStoreUrl);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://elorated.com");
    const page = await import("./page");
    return page.generateMetadata({ params: Promise.resolve({ token }) });
  }

  it("is absent while the App Store listing is unset", async () => {
    expect((await metaWith(undefined)).itunes).toBeUndefined();
  });

  it("opens this invite in the app once the listing is live", async () => {
    expect((await metaWith("https://apps.apple.com/app/id6774629438")).itunes).toEqual({
      appId: "6774629438",
      appArgument: "https://elorated.com/c/e2eChallengeTokenAAAAA",
    });
  });

  it("drops the app argument for a malformed token", async () => {
    expect((await metaWith("https://apps.apple.com/app/id6774629438", "not-a-token")).itunes).toEqual({
      appId: "6774629438",
    });
  });
});
