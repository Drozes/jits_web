import { afterEach, describe, expect, it, vi } from "vitest";
import { appStoreUrl, isAppStoreLive } from "./app-store";

const LISTING = "https://apps.apple.com/app/id6774629438";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appStoreUrl", () => {
  it("is null when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", undefined);
    expect(appStoreUrl()).toBeNull();
    expect(isAppStoreLive()).toBe(false);
  });

  it.each(["", "   ", "not a url", "http://apps.apple.com/app/id6774629438"])("is null for %j", (value) => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", value);
    expect(appStoreUrl()).toBeNull();
    expect(isAppStoreLive()).toBe(false);
  });

  it("returns the trimmed https listing", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", ` ${LISTING} `);
    expect(appStoreUrl()).toBe(LISTING);
    expect(isAppStoreLive()).toBe(true);
  });
});
