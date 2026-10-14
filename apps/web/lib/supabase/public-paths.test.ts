import { describe, expect, it } from "vitest";
import { isLockedAllowedPath, isPublicPath, LOCKED_ALLOWED_PATHS } from "./public-paths";

describe("isPublicPath", () => {
  it.each(["/terms", "/privacy", "/terms/fr", "/privacy/fr", "/login", "/", "/auth/callback", "/auth/callback/x", "/c/abc", "/c/abc/opengraph-image", "/api/invite-events", "/.well-known/apple-app-site-association", "/support", "/robots.txt"])(
    "%s is public",
    (p) => {
      expect(isPublicPath(p)).toBe(true);
    },
  );

  it.each(["/profile", "/design", "/design/board", "/matches/1", "/termsx", "/privacy-old", "/arena", "/cx", "/api/version-x"])(
    "%s needs a session",
    (p) => {
      expect(isPublicPath(p)).toBe(false);
    },
  );
});

describe("isLockedAllowedPath", () => {
  it.each([
    "/",
    "/terms",
    "/terms/fr",
    "/privacy",
    "/privacy/fr",
    "/support",
    "/c/abc",
    "/c/abc/opengraph-image",
    "/.well-known/apple-app-site-association",
    "/api/invite-events",
    "/forgot-password",
    "/update-password",
    "/confirm",
    "/auth/callback",
    "/error",
    "/robots.txt",
    "/sw.js",
    "/manifest.webmanifest",
    "/_next/static/x.js",
    "/__nextjs_original-stack-frame",
  ])("%s is served while locked", (p) => {
    expect(isLockedAllowedPath(p)).toBe(true);
  });

  it.each([
    "/login",
    "/signup",
    "/eua",
    "/arena",
    "/athlete/1",
    "/matches/1",
    "/settings",
    "/profile",
    "/design",
    "/design/board",
    "/api/version",
    "/welcome",
    "/termsx",
    "/supportx",
    "/cx",
    "/auth",
    "/auth/other",
    "/robots.txt/x",
  ])("%s is blocked while locked", (p) => {
    expect(isLockedAllowedPath(p)).toBe(false);
  });

  it("only allows paths that are also public, so no signed-out bounce through /login", () => {
    for (const p of ["/", ...LOCKED_ALLOWED_PATHS]) expect(isPublicPath(p)).toBe(true);
  });
});
