import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isAtLeast16 } from "./signup-form-validation";

describe("isAtLeast16 (the UTC calendar date, like mobile and the server)", () => {
  const originalTz = process.env.TZ;
  // A zone behind UTC, so the local and UTC calendar dates differ at both
  // boundaries below (21:00 and 19:30 on Oct 1 in Toronto).
  beforeAll(() => {
    process.env.TZ = "America/Toronto";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("01:00 UTC on Oct 2 (still Oct 1 locally) counts as Oct 2: the 16th birthday has arrived", () => {
    const now = new Date("2026-10-02T01:00:00Z");
    expect(now.getDate()).toBe(1); // the pin is in effect: local date is behind
    expect(isAtLeast16("2010-10-02", now)).toBe(true);
  });

  it("23:30 UTC on Oct 1 counts as Oct 1: still 15", () => {
    const now = new Date("2026-10-01T23:30:00Z");
    expect(isAtLeast16("2010-10-02", now)).toBe(false);
    expect(isAtLeast16("2010-10-01", now)).toBe(true);
  });

  it("rejects an empty, invalid or future date", () => {
    const now = new Date("2026-10-02T01:00:00Z");
    expect(isAtLeast16("", now)).toBe(false);
    expect(isAtLeast16("2010-02-30", now)).toBe(false);
    expect(isAtLeast16("2027-01-01", now)).toBe(false);
  });
});
