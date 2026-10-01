import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_ORIGIN, publicSiteOrigin } from "./site-origin";

describe("publicSiteOrigin", () => {
  it("prefers NEXT_PUBLIC_SITE_URL and strips any path", () => {
    expect(publicSiteOrigin({ NEXT_PUBLIC_SITE_URL: "https://elorated.com/", VERCEL_URL: "x.vercel.app" })).toBe(
      "https://elorated.com",
    );
  });

  it("falls back to the Vercel production domain, never VERCEL_URL", () => {
    expect(
      publicSiteOrigin({
        VERCEL: "1",
        VERCEL_URL: "jitsweb-abc123-team.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "jitsweb.vercel.app",
      }),
    ).toBe("https://jitsweb.vercel.app");
  });

  it("uses the interim public host on Vercel when nothing else is set", () => {
    expect(publicSiteOrigin({ VERCEL: "1", VERCEL_URL: "jitsweb-abc123-team.vercel.app" })).toBe(DEFAULT_PUBLIC_ORIGIN);
  });

  it("uses localhost off Vercel", () => {
    expect(publicSiteOrigin({})).toBe("http://localhost:4983");
  });

  it("ignores a malformed value", () => {
    expect(publicSiteOrigin({ NEXT_PUBLIC_SITE_URL: "http://", VERCEL: "1" })).toBe(DEFAULT_PUBLIC_ORIGIN);
  });
});
