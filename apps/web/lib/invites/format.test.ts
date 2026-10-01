import { describe, expect, it } from "vitest";
import { challengeStatLine, inviterShortName, invitePageTitle, joinStatLine } from "./format";
import { inviteTokenFromNextPath } from "./next-path";

const INVITER = { first_name: "Alex", last_initial: "R", avatar_url: null, current_elo: 1482, weight_lbs: 172 };

describe("invite formatting", () => {
  it("builds the ALEX R. name", () => {
    expect(inviterShortName(INVITER)).toBe("ALEX R.");
    expect(inviterShortName({ first_name: "Sam", last_initial: null })).toBe("SAM");
    expect(inviterShortName({ first_name: null, last_initial: "R" })).toBe("A TRAINING PARTNER");
  });

  it("builds the card stat lines, omitting LBS when weight is null", () => {
    expect(challengeStatLine(INVITER)).toBe("1,482 ELO · 172 LBS · Ranked jiu-jitsu match");
    expect(challengeStatLine({ ...INVITER, weight_lbs: null })).toBe("1,482 ELO · Ranked jiu-jitsu match");
    expect(joinStatLine(INVITER)).toBe("1,482 ELO · Ranked jiu-jitsu");
  });

  it("builds the contract titles", () => {
    expect(invitePageTitle({ state: "open", kind: "challenge", inviter: INVITER })).toBe(
      "ALEX R. challenges you | ELO RATED",
    );
    expect(invitePageTitle({ state: "open", kind: "join", inviter: INVITER })).toBe("Join ALEX R. on ELO RATED");
    expect(invitePageTitle({ state: "unavailable" })).toBe("ELO RATED | Ranked jiu-jitsu");
  });

  it("reads the invite token only from an exact /c/<token> next", () => {
    expect(inviteTokenFromNextPath("/c/e2eChallengeTokenAAAAA")).toBe("e2eChallengeTokenAAAAA");
    expect(inviteTokenFromNextPath("/c/short")).toBeNull();
    expect(inviteTokenFromNextPath("/arena")).toBeNull();
    expect(inviteTokenFromNextPath(null)).toBeNull();
  });
});
