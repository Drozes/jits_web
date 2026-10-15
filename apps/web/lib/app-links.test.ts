// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_STORE_ID, parseAppStoreUrl, parseStoreUrl } from "./app-links";

const APPLE = "https://apps.apple.com/app/id6774629438";
const PLAY = "https://play.google.com/store/apps/details?id=com.elorated.mobile";

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./app-links");
}

describe("parseStoreUrl", () => {
  it("accepts an https URL on the store's host", () => {
    expect(parseStoreUrl(APPLE, "apps.apple.com")).toBe(APPLE);
    expect(parseStoreUrl(` ${PLAY} `, "play.google.com")).toBe(PLAY);
  });

  it.each([
    ["unset", undefined],
    ["blank", "   "],
    ["not a URL", "apps.apple.com/app/id6774629438"],
    ["http", "http://apps.apple.com/app/id6774629438"],
    ["another host", "https://evil.example/app/id6774629438"],
    ["a lookalike host", "https://apps.apple.com.evil.example/app"],
    ["a subdomain", "https://www.apps.apple.com/app"],
    ["javascript:", "javascript:alert(1)"],
    ["credentials", "https://user:pass@apps.apple.com/app/id6774629438"],
    ["a username only", "https://evil@apps.apple.com/app/id6774629438"],
    ["a non-default port", "https://apps.apple.com:8443/app/id6774629438"],
  ])("rejects %s", (_label, raw) => {
    expect(parseStoreUrl(raw, "apps.apple.com")).toBeNull();
  });

  it("accepts an explicit default port, normalised away", () => {
    expect(parseStoreUrl("https://apps.apple.com:443/app/id6774629438", "apps.apple.com")).toBe(APPLE);
  });
});

describe("parseAppStoreUrl", () => {
  it.each([
    ["the bare id URL", APPLE],
    ["a slug and country", "https://apps.apple.com/us/app/elo-rated-ranked-jiu-jitsu/id6774629438"],
    ["a trailing query", "https://apps.apple.com/app/id6774629438?mt=8"],
    ["no id segment", "https://apps.apple.com/developer/elo-rated/id"],
  ])("accepts %s", (_label, raw) => {
    expect(parseAppStoreUrl(raw)).toBe(new URL(raw).href);
  });

  it.each([
    ["another app's id", "https://apps.apple.com/app/id1234567890"],
    ["another app with a slug", "https://apps.apple.com/us/app/other/id1234567890"],
    ["the right id with an extra digit", "https://apps.apple.com/app/id67746294380"],
    ["the Play host", PLAY],
  ])("rejects %s", (_label, raw) => {
    expect(parseAppStoreUrl(raw)).toBeNull();
  });
});

describe("store URLs from the environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("are null when unset (no search fallback)", async () => {
    const m = await load({ NEXT_PUBLIC_APP_STORE_URL: undefined, NEXT_PUBLIC_PLAY_STORE_URL: undefined });
    expect(m.APP_STORE_URL).toBeNull();
    expect(m.PLAY_STORE_URL).toBeNull();
  });

  it("are null when blank", async () => {
    const m = await load({ NEXT_PUBLIC_APP_STORE_URL: "", NEXT_PUBLIC_PLAY_STORE_URL: " " });
    expect(m.APP_STORE_URL).toBeNull();
    expect(m.PLAY_STORE_URL).toBeNull();
  });

  it("read each listing when set", async () => {
    const m = await load({ NEXT_PUBLIC_APP_STORE_URL: APPLE, NEXT_PUBLIC_PLAY_STORE_URL: PLAY });
    expect(m.APP_STORE_URL).toBe(APPLE);
    expect(m.PLAY_STORE_URL).toBe(PLAY);
  });

  it("App Store URL is null, and no Smart App Banner, when it names another app", async () => {
    const m = await load({ NEXT_PUBLIC_APP_STORE_URL: "https://apps.apple.com/app/id1234567890" });
    expect(m.APP_STORE_URL).toBeNull();
    expect(m.smartAppBanner()).toBeUndefined();
  });

  it("are null for the wrong store's host", async () => {
    const m = await load({ NEXT_PUBLIC_APP_STORE_URL: PLAY, NEXT_PUBLIC_PLAY_STORE_URL: APPLE });
    expect(m.APP_STORE_URL).toBeNull();
    expect(m.PLAY_STORE_URL).toBeNull();
  });
});

describe("smartAppBanner", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is undefined until the App Store listing is set", async () => {
    const m = await load({ NEXT_PUBLIC_APP_STORE_URL: undefined, NEXT_PUBLIC_PLAY_STORE_URL: PLAY });
    expect(m.smartAppBanner()).toBeUndefined();
    expect(m.smartAppBanner("https://elorated.com/c/x")).toBeUndefined();
  });

  it("carries the app id, plus the app argument when given", async () => {
    const m = await load({ NEXT_PUBLIC_APP_STORE_URL: APPLE });
    expect(m.smartAppBanner()).toEqual({ appId: APP_STORE_ID });
    expect(m.smartAppBanner("https://elorated.com/c/x")).toEqual({
      appId: "6774629438",
      appArgument: "https://elorated.com/c/x",
    });
  });
});
