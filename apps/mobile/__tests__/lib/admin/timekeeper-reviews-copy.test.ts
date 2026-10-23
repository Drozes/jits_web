/**
 * `TIMEKEEPER_REVIEWS_COPY` (lib/admin/timekeeper-reviews-copy.ts): the Admin >
 * Timekeeper reviews strings (A27; COPY-DECK.md Round 5 "Admin review (A27)",
 * TK-AD1 to TK-AD6; M-R4). Each is pinned to the deck's exact words with the
 * deck's sample names, the reused strings to their shipped source, and no
 * string has an em dash, an exclamation mark or an emoji (spec 14.9 X1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REVIEWS_REUSED_COPY as R,
  TIMEKEEPER_REVIEWS_COPY as C,
  type TimekeeperReviewsCopyId,
} from "@/lib/admin/timekeeper-reviews-copy";

const APP = join(__dirname, "..", "..", "..");
const EM_DASH = String.fromCharCode(0x2014);
const H_BAR = String.fromCharCode(0x2015);

/** Every id, rendered with the deck's sample values. */
const RENDERED: Record<TimekeeperReviewsCopyId, unknown> = {
  "TK-AD1": C["TK-AD1"],
  "TK-AD2": C["TK-AD2"],
  "TK-AD3": C["TK-AD3"]({ name: "J. Cruz", time: "4:35 PM", clock: "04:12" }),
  "TK-AD4": C["TK-AD4"],
  "TK-AD5": C["TK-AD5"],
  "TK-AD6": C["TK-AD6"],
};

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

describe("TIMEKEEPER_REVIEWS_COPY", () => {
  it("says exactly what the deck says", () => {
    expect(RENDERED).toEqual({
      "TK-AD1": "Timekeeper reviews",
      "TK-AD2": "No matches waiting for review.",
      "TK-AD3": "Timekeeper J. Cruz · clock ended 4:35 PM · 04:12 on the clock",
      "TK-AD4": { record: "Record result", void: "Void" },
      "TK-AD5": {
        title: "Void this match?",
        body: "It becomes a no contest and won't count for either athlete.",
        cancel: "Keep",
        confirm: "Void",
      },
      "TK-AD6": { recorded: "Result recorded", voided: "Match voided", failed: "Couldn't update the match" },
    });
  });

  it("has every TK-AD id and nothing else", () => {
    expect(Object.keys(C).sort()).toEqual(["TK-AD1", "TK-AD2", "TK-AD3", "TK-AD4", "TK-AD5", "TK-AD6"]);
  });

  it("no em dash, exclamation mark or emoji (X1)", () => {
    const all = [...strings(RENDERED), ...strings({ ...R, matchup: R.matchup({ a: "M. Reyes", b: "D. Okafor" }) })];
    expect(all.length).toBeGreaterThan(10);
    for (const s of all) {
      const bad = s.includes(EM_DASH) || s.includes(H_BAR) || s.includes("!") || /\p{Extended_Pictographic}/u.test(s);
      expect([s, bad]).toEqual([s, false]);
    }
  });
});

describe("REVIEWS_REUSED_COPY", () => {
  it("reuses the deck's matchup (TK-H2) and the shipped words", () => {
    expect(R.matchup({ a: "M. Reyes", b: "D. Okafor" })).toBe("M. Reyes vs D. Okafor");
    expect(R.back).toBe("Back");
    expect(R.noValue).toBe("--");
    expect(R.noClock).toBe("--:--");
  });

  it("Retry and Refresh are the shipped admin list screens' buttons", () => {
    const noMatch = readFileSync(join(APP, "app/(app)/settings/admin/no-match.tsx"), "utf8");
    expect(noMatch).toContain(`label="${R.retry}"`);
    expect(noMatch).toContain(`label="${R.refresh}"`);
  });
});
