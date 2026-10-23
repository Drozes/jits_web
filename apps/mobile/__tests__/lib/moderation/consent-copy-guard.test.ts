/**
 * Consent and AI copy guard (jits-o47s.46). No user-facing string may name
 * an AI vendor or product (owner directive): vendors are disclosed in the
 * Privacy Policy (sections 4.2 and 9.1), never in the app. Both "Before you
 * film" bodies keep the third-party AI disclosure App Review 5.1.2(i) asks
 * for, and the timekeeper's states the filming duty first.
 */
import { AI_CONSENT_COPY, MODERATION_COPY } from "@/lib/moderation/moderation-copy";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";

const VENDORS = /gemini|openai|chat ?gpt|\bgpt|anthropic|claude|google|vertex|dall.?e|midjourney/i;
/** Em dash and en dash, built from char codes so this file holds neither. */
const DASHES = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];

/** Every string a copy object yields (functions called with a sample argument). */
function strings(copy: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (typeof v === "function") walk((v as (a: unknown) => unknown)("Sample"));
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(copy);
  return out;
}

describe("consent and AI copy", () => {
  const all = [...strings(AI_CONSENT_COPY), ...strings(MODERATION_COPY), ...strings(TIMEKEEPER_COPY)];

  it("covers every string of the consent, moderation and timekeeper copy", () => {
    expect(strings(AI_CONSENT_COPY)).toEqual(expect.arrayContaining([AI_CONSENT_COPY.body, AI_CONSENT_COPY.timekeeperBody]));
    expect(all.length).toBeGreaterThan(20);
  });

  it("names no AI vendor or product anywhere", () => {
    for (const s of all) expect(s).not.toMatch(VENDORS);
  });

  it("both bodies disclose third-party AI services", () => {
    expect(AI_CONSENT_COPY.body).toContain("third-party AI services");
    expect(AI_CONSENT_COPY.timekeeperBody).toContain("third-party AI services");
  });

  it("the timekeeper body states the duty first, and differs from the athlete body", () => {
    expect(AI_CONSENT_COPY.timekeeperBody.startsWith("As timekeeper, you film this match.")).toBe(true);
    expect(AI_CONSENT_COPY.timekeeperBody).not.toBe(AI_CONSENT_COPY.body);
  });

  it("keeps the brand rules in both bodies: no em or en dashes, no exclamation marks", () => {
    for (const b of [AI_CONSENT_COPY.body, AI_CONSENT_COPY.timekeeperBody]) {
      for (const d of DASHES) expect(b.includes(d)).toBe(false);
      expect(b).not.toContain("!");
    }
  });
});
