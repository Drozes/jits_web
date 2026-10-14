import { afterEach, describe, expect, it, vi } from "vitest";
import { isWebAppEnabled } from "./web-app-lock";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isWebAppEnabled", () => {
  it('is true only for the exact string "true"', () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "true");
    expect(isWebAppEnabled()).toBe(true);
  });

  it("is false when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", undefined);
    expect(isWebAppEnabled()).toBe(false);
  });

  it.each(["", "false", "1", "TRUE", " true"])("is false for %j", (value) => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", value);
    expect(isWebAppEnabled()).toBe(false);
  });
});
