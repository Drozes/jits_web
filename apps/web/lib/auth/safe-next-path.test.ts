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
