/**
 * The timekeeper's "Before you film" copy (jits-o47s.46): plain language,
 * no vendor names (they live in the Privacy Policy, sections 4.2 and 9.1),
 * the third-party AI disclosure App Review 5.1.2(i) asks for, and the
 * promotional opt-out. The athlete's body is deliberately left as it was.
 */
import { AI_CONSENT_COPY } from "@/lib/moderation/moderation-copy";

const VENDORS = /gemini|openai|google/i;
/** Em dash and en dash, built from char codes so this file holds neither. */
const DASHES = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];

describe("timekeeper consent copy", () => {
  it("names no AI vendor in any string the timekeeper sheet shows", () => {
    for (const s of [AI_CONSENT_COPY.title, AI_CONSENT_COPY.timekeeperBody, AI_CONSENT_COPY.privacyLink, AI_CONSENT_COPY.allow, AI_CONSENT_COPY.notNow]) {
      expect(s).not.toMatch(VENDORS);
    }
  });

  it("states the duty, the third-party AI disclosure and the promotional opt-out", () => {
    const b = AI_CONSENT_COPY.timekeeperBody;
    expect(b.startsWith("As timekeeper, you film this match.")).toBe(true);
    expect(b).toContain("third-party AI services");
    expect(b).toContain("You can opt out of promotional use.");
  });

  it("keeps the brand rules: no em or en dashes, no exclamation marks", () => {
    for (const d of DASHES) expect(AI_CONSENT_COPY.timekeeperBody.includes(d)).toBe(false);
    expect(AI_CONSENT_COPY.timekeeperBody).not.toContain("!");
  });

  it("is a separate text from the athlete's body", () => {
    expect(AI_CONSENT_COPY.timekeeperBody).not.toBe(AI_CONSENT_COPY.body);
  });
});
