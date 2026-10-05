import * as fs from "fs";
import * as path from "path";
import {
  ALL_STATIC_COPY,
  BEST_ANGLE,
  countdownA11y,
  formatCountdown,
  PHASE_COPY,
  ROW_HELPER,
  ROW_TAG,
  rowAnnouncement,
  TERM,
} from "@/lib/video/video-status-copy";

/**
 * Lint for the one copy module (COPY-DECK v2.2 contradiction rule 2 and
 * convention 4): no long dashes, no exclamation marks, no emoji; and the
 * status surfaces never hard-code a deck string of their own.
 */
const FORBIDDEN = new RegExp(`[${String.fromCharCode(0x2014, 0x2015)}!]`);
const EMOJI = /\p{Extended_Pictographic}/u;
const ROOT = path.resolve(__dirname, "../../..");

describe("video-status-copy", () => {
  it("has no long dash, exclamation mark or emoji in any string", () => {
    const dynamic = [
      PHASE_COPY.collectingManyLine(3),
      PHASE_COPY.waitOneLine("D. Okafor's angle"),
      PHASE_COPY.waitExtendedLine("your angle"),
      ROW_HELPER.addUntil("9:42 PM"),
      ROW_HELPER.quiet("D. Okafor"),
    ];
    for (const s of [...ALL_STATIC_COPY, ...dynamic]) {
      expect(s).not.toMatch(FORBIDDEN);
      expect(s).not.toMatch(EMOJI);
    }
  });

  it("uses the owner's in-app noun and the one retry wording", () => {
    expect(TERM).toBe("highlight");
    expect(ROW_TAG.didntUpload).toBe("Didn't upload");
    expect(BEST_ANGLE).toBe("Best angle");
  });

  it("capitalizes an angle reference at the start of a sentence", () => {
    expect(PHASE_COPY.waitExtendedLine("your angle")).toBe("Your angle is in. Giving it up to 10 more min.");
    expect(PHASE_COPY.readyLateAddedHelper("D. Okafor's angle")).toBe("D. Okafor's angle came in later. Your highlight was updated with it.");
  });

  it("speaks the countdown (deck 10.3) and formats it", () => {
    expect(countdownA11y(492)).toBe("8 minutes 12 seconds left");
    expect(countdownA11y(60)).toBe("1 minute left");
    expect(countdownA11y(1)).toBe("1 second left");
    expect(formatCountdown(492_000)).toBe("8:12");
    expect(formatCountdown(1)).toBe("0:01");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("announces a row's new state in words (deck 10.1)", () => {
    expect(rowAnnouncement("D. Okafor's angle", ROW_TAG.ready)).toBe("D. Okafor's angle is ready to watch.");
    expect(rowAnnouncement("Your angle", ROW_TAG.didntUpload)).toBe("Your angle didn't upload.");
  });

  it("the status surfaces read their strings from the copy module, never their own literals", () => {
    const surfaces = [
      "components/video-status/film-status-plate.tsx",
      "components/video-status/film-status-row.tsx",
      "components/video-status/film-row-info.tsx",
      "components/video-status/film-status-header.tsx",
      "components/video-status/upload-strip-slots.tsx",
      "components/video-status/upload-strip.tsx",
      "components/match-flow/match-upload-line.tsx",
      "lib/video/film-status.ts",
      "lib/video/upload-strip.ts",
    ];
    const deckStrings = ALL_STATIC_COPY.filter((s) => s.length > 6);
    for (const file of surfaces) {
      // Code only: comments may quote the deck.
      const text = fs
        .readFileSync(path.join(ROOT, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      const literals = deckStrings.filter((s) => text.includes(`"${s}"`) || text.includes(`\`${s}\``));
      expect({ file, literals }).toEqual({ file, literals: [] });
    }
  });
});
