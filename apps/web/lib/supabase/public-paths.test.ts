import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it.each(["/terms", "/privacy", "/login", "/", "/auth/callback", "/auth/callback/x"])(
    "%s is public",
    (p) => {
      expect(isPublicPath(p)).toBe(true);
    },
  );

  it.each(["/profile", "/design", "/design/board", "/matches/1", "/termsx", "/privacy-old", "/arena"])(
    "%s needs a session",
    (p) => {
      expect(isPublicPath(p)).toBe(false);
    },
  );
});
