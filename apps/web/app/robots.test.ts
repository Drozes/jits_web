import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("disallows /api/, /auth/ and /design/ but never the invite pages", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    expect(disallow).toEqual(expect.arrayContaining(["/api/", "/auth/", "/design/"]));
    expect(disallow.some((p) => p.startsWith("/c"))).toBe(false);
    expect(rule.userAgent).toBe("*");
  });
});
