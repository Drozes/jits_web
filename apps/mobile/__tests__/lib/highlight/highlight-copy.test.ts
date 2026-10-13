/** The full-screen viewer's play / pause VoiceOver label (spec 020 D). */
import { playerLabel, reelPlayerLabel } from "@/lib/highlight/highlight-copy";

describe("reelPlayerLabel", () => {
  it("own reel, or no subject: the match-detail label", () => {
    expect(reelPlayerLabel(28, null)).toBe("Your highlight reel, 28 seconds");
    expect(reelPlayerLabel(28, undefined)).toBe(playerLabel(28));
    expect(reelPlayerLabel(28, { isOwn: true, name: "Bea" })).toBe("Your highlight reel, 28 seconds");
  });

  it("not yours: the subject's trimmed name", () => {
    expect(reelPlayerLabel(28, { isOwn: false, name: " C. Ruiz " })).toBe("C. Ruiz's highlight reel, 28 seconds");
  });

  it("not yours with a blank or missing name: a neutral label, seconds rounded", () => {
    expect(reelPlayerLabel(28.4, { isOwn: false, name: "  " })).toBe("Highlight reel, 28 seconds");
    expect(reelPlayerLabel(28, { isOwn: false, name: null })).toBe("Highlight reel, 28 seconds");
  });
});
