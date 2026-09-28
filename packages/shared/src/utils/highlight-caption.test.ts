import { describe, it, expect } from "vitest";
import { buildCollabTip, buildHighlightCaption, HIGHLIGHT_CAPTION_MAX } from "./highlight-caption";
import type { HighlightCaptionContext } from "../api/highlight-share";

const TAIL = "Tracked on ELO RATED.\n#bjj #jiujitsu #brazilianjiujitsu #elorated";

function ctx(over: Partial<HighlightCaptionContext> = {}): HighlightCaptionContext {
  return {
    athleteName: "Me",
    opponentName: "Ana Souza",
    matchType: "casual",
    outcome: "win",
    eloAfter: null,
    eloDelta: null,
    technique: null,
    playedAt: "2026-09-27T09:00:00Z",
    ...over,
  };
}

type Row = [
  HighlightCaptionContext["outcome"],
  string | null,
  string | null,
  string,
];

// outcome x technique x opponent -> first line (match type covered below).
const FIRST_LINES: Row[] = [
  ["win", "armbar", "Ana Souza", "Got the armbar against Ana Souza."],
  ["win", "armbar", null, "Got the armbar today."],
  ["win", null, "Ana Souza", "Took the win against Ana Souza."],
  ["win", null, null, "Took the win today."],
  ["draw", null, "Ana Souza", "Went the distance with Ana Souza."],
  ["draw", null, null, "Went the distance today."],
  ["loss", null, "Ana Souza", "Rolled with Ana Souza. Learning every round."],
  ["loss", null, null, "Rolled today. Learning every round."],
  [null, null, "Ana Souza", "On the mats with Ana Souza."],
  [null, null, null, "On the mats today."],
  // A technique is only ever used for a win.
  ["draw", "armbar", "Ana Souza", "Went the distance with Ana Souza."],
  ["loss", "armbar", null, "Rolled today. Learning every round."],
  [null, "armbar", "Ana Souza", "On the mats with Ana Souza."],
];

describe("buildHighlightCaption", () => {
  describe.each(["casual", "ranked"] as const)("%s", (matchType) => {
    const second = matchType === "casual" ? "Casual roll." : "Ranked match.";
    it.each(FIRST_LINES)("outcome %s, technique %s, opponent %s", (outcome, technique, opponentName, line1) => {
      expect(buildHighlightCaption(ctx({ matchType, outcome, technique, opponentName }))).toBe(
        `${line1}\n${second}\n${TAIL}`,
      );
    });
  });

  it.each([
    [1234, 12, "Ranked match. Now 1234 ELO (+12)."],
    [1234, -8, "Ranked match. Now 1234 ELO (-8)."],
    [1234, 0, "Ranked match. Now 1234 ELO."],
    [1234, null, "Ranked match. Now 1234 ELO."],
    [null, 12, "Ranked match."],
  ])("ranked, eloAfter %s, delta %s", (eloAfter, eloDelta, line2) => {
    expect(buildHighlightCaption(ctx({ matchType: "ranked", eloAfter, eloDelta })).split("\n")[1]).toBe(line2);
  });

  it("ignores ELO on a casual match", () => {
    expect(buildHighlightCaption(ctx({ matchType: "casual", eloAfter: 1200, eloDelta: 5 })).split("\n")[1]).toBe(
      "Casual roll.",
    );
  });

  it("normalises the technique: trimmed, collapsed, lower-cased after the first letter", () => {
    expect(buildHighlightCaption(ctx({ technique: "  Rear   NAKED\tChoke " })).split("\n")[0]).toBe(
      "Got the Rear naked choke against Ana Souza.",
    );
  });

  it("uses names verbatim but trimmed, and a blank name counts as none", () => {
    expect(buildHighlightCaption(ctx({ opponentName: "  João  " })).split("\n")[0]).toBe("Took the win against João.");
    expect(buildHighlightCaption(ctx({ opponentName: "   " })).split("\n")[0]).toBe("Took the win today.");
  });

  it("has four lines, no handles and no URLs", () => {
    const caption = buildHighlightCaption(ctx({ matchType: "ranked", eloAfter: 1500, eloDelta: 3, technique: "kimura" }));
    expect(caption.split("\n")).toHaveLength(4);
    expect(caption).not.toMatch(/@|https?:|www\./);
  });

  it(`never exceeds ${HIGHLIGHT_CAPTION_MAX} characters`, () => {
    const long = "X".repeat(500);
    const caption = buildHighlightCaption(
      ctx({ opponentName: long, technique: long, matchType: "ranked", eloAfter: 99999, eloDelta: -9999 }),
    );
    expect(caption.length).toBeLessThanOrEqual(HIGHLIGHT_CAPTION_MAX);
    expect(caption.endsWith(TAIL)).toBe(true);
    expect(caption.split("\n")[0].endsWith("…")).toBe(true);
    // Every realistic caption is well under the cap and untouched.
    expect(buildHighlightCaption(ctx()).length).toBeLessThan(200);
  });
});

describe("buildCollabTip", () => {
  it("names the opponent", () => {
    expect(buildCollabTip(" Ana ")).toBe(
      "Tag Ana as a collaborator: in Instagram tap Tag people, then Invite collaborator. One post shows on both profiles.",
    );
  });

  it("falls back to 'your opponent'", () => {
    expect(buildCollabTip(null)).toBe(
      "Tag your opponent as a collaborator: in Instagram tap Tag people, then Invite collaborator. One post shows on both profiles.",
    );
    expect(buildCollabTip("  ")).toMatch(/^Tag your opponent as a collaborator: /);
  });
});
