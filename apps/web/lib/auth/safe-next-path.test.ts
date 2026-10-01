import { describe, it, expect } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/arena")).toBe("/arena");
    expect(safeNextPath("/reset-password?x=1#y")).toBe("/reset-password?x=1#y");
  });

  it("falls back to / when missing", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("rejects protocol-relative and backslash forms", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });

  it("rejects values without a leading slash (userinfo / absolute URLs)", () => {
    expect(safeNextPath("@evil.com")).toBe("/");
    expect(safeNextPath("evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("\\\\evil.com")).toBe("/");
  });

  it("rejects control characters that URL parsing strips", () => {
    expect(safeNextPath("/\t/evil.com")).toBe("/");
    expect(safeNextPath("/\n/evil.com")).toBe("/");
  });
});

describe("safeNextPath invite limits (016)", () => {
  it("refuses values over 512 characters", async () => {
    const { safeNextPath: safe } = await import("./safe-next-path");
    expect(safe("/" + "a".repeat(511))).toBe("/" + "a".repeat(511));
    expect(safe("/" + "a".repeat(512))).toBe("/");
  });

  it("withNext appends only a safe next", async () => {
    const { withNext } = await import("./safe-next-path");
    expect(withNext("/signup", "/c/abc")).toBe("/signup?next=%2Fc%2Fabc");
    expect(withNext("/a?x=1", "/c/abc")).toBe("/a?x=1&next=%2Fc%2Fabc");
    expect(withNext("/signup", "//evil.com")).toBe("/signup");
    expect(withNext("/signup", null)).toBe("/signup");
  });
});
