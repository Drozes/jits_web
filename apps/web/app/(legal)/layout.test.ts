// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./layout";

describe("(legal) layout generateMetadata", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("resolves canonical and hreflang links against the public origin, never VERCEL_URL", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "jitsweb-abc123-team.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://elorated.com");
    expect(generateMetadata().metadataBase?.toString()).toBe("https://elorated.com/");
  });

  it("falls back to the interim public host on a Vercel deploy without a site URL", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "jitsweb-abc123-team.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(generateMetadata().metadataBase?.toString()).toBe("https://jitsweb.vercel.app/");
  });
});
