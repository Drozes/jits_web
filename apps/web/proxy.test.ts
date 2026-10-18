// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/proxy", () => ({ updateSession: vi.fn() }));

const { config } = await import("./proxy");

/** Next anchors a matcher to the whole path. */
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe("proxy matcher", () => {
  it.each([
    "/landing/videos/sparring-01-v1-720.mp4",
    "/landing/videos/sparring-01-v1-1080.mp4",
    "/landing/videos/sparring-01-v1-poster.jpg",
    "/landing/hero.jpg",
    "/badges/app-store-badge-en-us.svg",
    // Any .mp4 path skips the proxy; outside the landing it is still kept
    // locked by redirectHomeWhenLocked() in the (app) and /design layouts.
    "/arena/x.mp4",
    "/c/x.mp4",
  ])("skips the static file %s (served while locked)", (p) => {
    expect(matcher.test(p)).toBe(false);
  });

  it.each([
    "/",
    "/welcome",
    "/arena",
    "/c/abc",
    "/api/invite-events",
    "/robots.txt",
    "/.well-known/apple-app-site-association",
    "/landing/videos",
    // The extension match is case-sensitive: an upper-case .MP4 still runs
    // the proxy (and so redirects to / while locked). Our files are lower-case.
    "/landing/videos/SPARRING.MP4",
  ])("runs on %s", (p) => {
    expect(matcher.test(p)).toBe(true);
  });
});
