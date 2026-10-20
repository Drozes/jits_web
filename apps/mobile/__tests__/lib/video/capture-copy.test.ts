/**
 * `CAPTURE_COPY` (lib/video/capture-copy.ts): the capture strings keyed by
 * copy deck id (COPY-DECK.md "Capture: portrait guidance, wide lens, capture
 * quality"; M-R4), pinned to the deck's words, and the hint each capture gets.
 */
import { CAPTURE_COPY, readyHintFor, type CaptureCopyId } from "@/lib/video/capture-copy";
import { CAPTURE_POLICY, PRACTICE_CAPTURE } from "@/lib/match-flow/capture-policy";

/** The deck's words, one entry per id. */
const DECK: Record<CaptureCopyId, unknown> = {
  "TK-REC1": "Hold your phone upright. The wide lens keeps the whole mat in frame.",
  "TK-REC1b": "Hold your phone upright. Step back so the whole mat fits.",
  "TK-REC2": "Hold your phone upright and keep both of you in frame.",
  "TK-REC3": { text: "WIDE LENS", a11y: "Recording with the wide lens" },
};

const EM_DASH = String.fromCharCode(0x2014);

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

describe("CAPTURE_COPY", () => {
  it("covers exactly the capture ids the app shows (TK-CAP1 is written by the backend)", () => {
    expect(Object.keys(CAPTURE_COPY).sort()).toEqual(Object.keys(DECK).sort());
  });

  it.each(Object.keys(DECK) as CaptureCopyId[])("%s reads as the deck", (id) => {
    expect(CAPTURE_COPY[id]).toEqual(DECK[id]);
  });

  it("no string has an em dash, an exclamation mark or an emoji, and none names a resolution", () => {
    for (const s of strings(CAPTURE_COPY)) {
      expect(s.includes(EM_DASH) || s.includes("!") || /\p{Extended_Pictographic}/u.test(s)).toBe(false);
      expect(s).not.toMatch(/720|1080|resolution|quality/i);
    }
  });
});

describe("readyHintFor", () => {
  const ATHLETE = CAPTURE_POLICY.self_run.challenger;
  const TIMEKEEPER = CAPTURE_POLICY.timekeeper.timekeeper;

  it("athletes in both modes and practice: TK-REC2, whatever the lens", () => {
    for (const policy of [ATHLETE, CAPTURE_POLICY.timekeeper.opponent, PRACTICE_CAPTURE]) {
      expect(readyHintFor(policy, "default")).toBe("TK-REC2");
    }
  });

  it("the timekeeper: TK-REC1 on the ultrawide, TK-REC1b without one (Android, older iPhones)", () => {
    expect(readyHintFor(TIMEKEEPER, "ultrawide")).toBe("TK-REC1");
    expect(readyHintFor(TIMEKEEPER, "default")).toBe("TK-REC1b");
  });

  it("no portrait instruction under a landscape capture (the spec 13.6 seam has no deck string yet)", () => {
    expect(readyHintFor({ ...TIMEKEEPER, recordingOrientation: "landscape_locked" }, "ultrawide")).toBeNull();
    expect(readyHintFor({ ...ATHLETE, recordingOrientation: "free" }, "default")).toBeNull();
  });
});
