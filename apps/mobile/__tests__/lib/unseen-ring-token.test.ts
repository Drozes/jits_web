/**
 * The `unseen-ring` semantic alias (specs/matches-tab, design review ruling
 * 2026-10-06): the unwatched-reel ring is `ink` in both themes, reachable as
 * `border-unseen-ring`, and never the Signal Red family.
 */
import { darkTokens, lightTokens } from "@/lib/tokens";

declare const require: (id: string) => any;

describe("unseen-ring alias", () => {
  it.each([
    ["dark", darkTokens],
    ["light", lightTokens],
  ] as const)("equals ink (textPrimary) in %s", (_theme, t) => {
    expect(t.unseenRing).toBe(t.textPrimary);
  });

  it.each([
    ["dark", darkTokens],
    ["light", lightTokens],
  ] as const)("is never a Signal Red token in %s", (_theme, t) => {
    const reds = [t.accentCta, t.accentCtaText, t.accentCtaHover, t.stateNegative].map((c) => c.toLowerCase());
    expect(reds).not.toContain(t.unseenRing.toLowerCase());
  });

  it("is a Tailwind colour backed by its own CSS var", () => {
    const config = require("../../tailwind.config.js");
    expect(config.theme.extend.colors["unseen-ring"]).toBe("var(--unseen-ring)");
  });
});
