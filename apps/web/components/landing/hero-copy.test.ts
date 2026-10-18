import { afterEach, describe, expect, it, vi } from "vitest";
import { HERO_LINE_LIVE, HERO_LINE_SOON, heroLine } from "./hero-copy";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("heroLine", () => {
  it("reads Coming Soon without a listing and Get the app with one", () => {
    expect(HERO_LINE_SOON).toBe("Coming Soon");
    expect(HERO_LINE_LIVE).toBe("Get the app");
    expect(heroLine(null)).toBe("Coming Soon");
    expect(heroLine("https://apps.apple.com/app/id6774629438")).toBe("Get the app");
  });

  it("follows the parsed App Store URL, not the raw env value", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "https://example.com/app");
    vi.resetModules();
    const invalid = await import("./hero-copy");
    expect(invalid.heroLine()).toBe("Coming Soon");

    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "https://apps.apple.com/app/id6774629438");
    vi.resetModules();
    const live = await import("./hero-copy");
    expect(live.heroLine()).toBe("Get the app");
  });
});
