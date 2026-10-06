/**
 * Reel tile copy (specs/matches-tab section 11) and the C-B3 server-clock
 * countdown math. No long dashes, no exclamation marks.
 */
import {
  BUILDING_COPY,
  SOURCE_CHIP,
  buildingA11yLabel,
  buildingStepLine,
  ctaCopy,
  durationChip,
  readyA11yLabel,
  readyCaption,
  serverRemainingMs,
  sourceChip,
  stepCounter,
  waitingLine,
} from "@/components/reels/reel-tile-copy";
import { REEL_LANE_COPY } from "@/lib/highlight/reel-lane";
import { reelItem } from "../../support/reel-tile-fixtures";

const LONG_DASH = String.fromCharCode(0x2014);

describe("reel tile copy", () => {
  it("own tiles never chip; friend, local and elo chip FRIEND, NEARBY, ELO RATED", () => {
    expect(sourceChip({ source: "own" })).toBeNull();
    expect(sourceChip({ source: "friend" })?.label).toBe("FRIEND");
    expect(sourceChip({ source: "local" })?.label).toBe("NEARBY");
    expect(sourceChip({ source: "elo" })?.label).toBe("ELO RATED");
  });

  it("captions: vs {opp} when own, the subject's name otherwise, nothing when unknown", () => {
    expect(readyCaption({ isOwn: true, opponentName: " D. Okafor " })).toBe("vs D. Okafor");
    expect(readyCaption({ isOwn: false, opponentName: "K. Ito" })).toBe("K. Ito");
    expect(readyCaption({ isOwn: true, opponentName: null })).toBeNull();
    expect(readyCaption({ isOwn: true, opponentName: "  " })).toBeNull();
  });

  it("C-M12, with unwatched and the chip words", () => {
    expect(readyA11yLabel(reelItem("a"))).toBe("Watch your highlight vs D. Okafor");
    expect(readyA11yLabel(reelItem("a", { unseen: true }))).toBe("Watch your highlight vs D. Okafor, unwatched");
    expect(readyA11yLabel(reelItem("a", { opponentName: null }))).toBe("Watch your highlight");
    expect(readyA11yLabel(reelItem("a", { source: "local", isOwn: false, opponentName: "K. Ito", unseen: true }))).toBe(
      "Watch K. Ito's highlight, nearby, unwatched",
    );
  });

  it("building steps, counter, countdown line and C-B6", () => {
    expect(buildingStepLine({ reelState: "planning", step: 1 }, null)).toBe(BUILDING_COPY.step1);
    expect(buildingStepLine({ reelState: "waiting", step: 1 }, null)).toBe(BUILDING_COPY.step1);
    expect(buildingStepLine({ reelState: "rendering", step: 2 }, null)).toBe(BUILDING_COPY.step2);
    expect(buildingStepLine({ reelState: "waiting", step: 1 }, 492_000)).toBe("Waiting 8:12");
    expect(waitingLine(0)).toBe("Any second now");
    expect(waitingLine(-5)).toBe("Any second now");
    expect(waitingLine(500)).toBe("Waiting 0:01");
    expect(stepCounter(1)).toBe("Step 1 of 2");
    expect(stepCounter(2)).toBe("Step 2 of 2");
    expect(buildingA11yLabel("L. Tanaka", "Cutting your highlight")).toBe(
      "Your highlight vs L. Tanaka is being made. Cutting your highlight. Opens the match.",
    );
    expect(buildingA11yLabel(null, "Any second now")).toBe("Your highlight is being made. Any second now. Opens the match.");
  });

  it("CTA labels and the duration chip", () => {
    expect(ctaCopy("first_highlight")).toEqual({ label: "Get your first highlight", a11y: "Get your first highlight. Opens the Arena tab" });
    expect(ctaCopy("find_match").label).toBe("Find a match");
    expect(durationChip(28.4)).toBe("28s");
    expect(durationChip(-1)).toBe("0s");
  });

  it("no string uses a long dash or an exclamation mark, and the retired C-HM1 never appears", () => {
    const all = JSON.stringify([BUILDING_COPY, SOURCE_CHIP, REEL_LANE_COPY]);
    expect(all.includes(LONG_DASH)).toBe(false);
    expect(all).not.toMatch(/!/);
    expect(all).not.toMatch(/Your reels/i);
    expect(REEL_LANE_COPY.title.home).toBe("Highlights");
    expect(REEL_LANE_COPY.title.matches).toBe("Your highlights");
  });
});

describe("serverRemainingMs (C-B3)", () => {
  const deadline = "2026-10-06T10:08:12Z";
  it("measures on the server clock: the device being 10 minutes ahead changes nothing", () => {
    const received = Date.parse("2026-10-06T10:10:00Z");
    expect(serverRemainingMs(deadline, "2026-10-06T10:00:00Z", received, received)).toBe(492_000);
    expect(serverRemainingMs(deadline, "2026-10-06T10:00:00Z", received, received + 2000)).toBe(490_000);
  });

  it("falls back to the device clock without serverNow, and is null without a deadline", () => {
    const now = Date.parse("2026-10-06T10:08:00Z");
    expect(serverRemainingMs(deadline, null, now, now)).toBe(12_000);
    expect(serverRemainingMs(deadline, "garbage", now, now)).toBe(12_000);
    expect(serverRemainingMs(null, "2026-10-06T10:00:00Z", now, now)).toBeNull();
    expect(serverRemainingMs("not a date", null, now, now)).toBeNull();
  });
});
