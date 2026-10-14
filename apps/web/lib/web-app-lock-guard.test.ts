import { afterEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

import { redirectHomeWhenLocked } from "./web-app-lock-guard";

afterEach(() => {
  vi.unstubAllEnvs();
  redirect.mockClear();
});

describe("redirectHomeWhenLocked", () => {
  it("redirects to / while the web app is locked", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "");
    expect(() => redirectHomeWhenLocked()).toThrow("NEXT_REDIRECT /");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("does nothing when the web app is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "true");
    expect(() => redirectHomeWhenLocked()).not.toThrow();
    expect(redirect).not.toHaveBeenCalled();
  });
});
