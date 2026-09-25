/**
 * WCAG contrast regression gate for the ELO design-system tokens.
 *
 * This suite does NOT snapshot hex strings. It parses the exported
 * `lightTokens` / `darkTokens` objects at run time, computes WCAG 2.1 relative
 * luminance and contrast ratios from them, and asserts the thresholds. Any
 * future token edit that drops a text/surface pair below AA fails here.
 *
 * It also enforces that `tailwind.config.js` (the authoring surface, which
 * holds the light defaults for the `addBase` plugin) stays byte-identical to
 * `lib/tokens.ts` (the runtime surface consumed by theme-provider.tsx). The two
 * files are hand-mirrored, so drift between them is the failure mode this
 * project keeps hitting.
 *
 * Scope: the ELO design-system tokens (the surface, ink, accent, state and
 * hairline families). The legacy shadcn-style tokens in the same objects are
 * pre-redesign compatibility shims and are intentionally not gated here.
 */
import { darkTokens, lightTokens, type ColorTokens } from "@/lib/tokens";

declare const require: (id: string) => any;
declare const __dirname: string;

// The WCAG math and the AA threshold table live in a shared support module so
// that tokens-mirror-drift.test.ts can hold itself to the same thresholds
// before it certifies a mirror. Defined once there, restated nowhere.
import {
  AA_NORMAL_TEXT,
  ACCENT_FILL_KEYS,
  BOUNDARY_FLOOR,
  NON_TEXT,
  NON_TEXT_KEYS,
  SURFACE_KEYS,
  TEXT_KEYS,
  composite,
  contrast,
  parseColor,
  relativeLuminance,
  round,
} from "../support/token-contrast";

/**
 * Non-text pairs that cannot reach 3:1 without moving a locked brand color.
 * Recorded at their measured value so the number cannot drift further unnoticed.
 * Keyed `theme:mark:surface`.
 */
const NON_TEXT_EXCEPTIONS: Record<string, number> = {
  // Brand red on the darkest light surface. Passing would require moving
  // #E63946, which is locked. First measured on the gym-manager sparkline and
  // trend bars (a highlighted `bg-cta` bar directly against `bg-surface-4`
  // bars); those screens were removed from mobile (jits-gewv) but the token
  // pair is still valid anywhere, so the recorded value stays pinned.
  "light:accentCta:bgElevatedHover": 2.89,

  // The light pressed CTA fill. These are PERMANENT, not a todo: no pressed-fill
  // color exists that satisfies both constraints at once, so do not burn an
  // afternoon re-tuning the red.
  //
  //   Holding the #0D0F14 label at 4.5:1 requires fill luminance >= 0.1965.
  //   Holding 3:1 against bgElevatedHover #D2D7E0 requires fill luminance
  //   <= 0.1923. That window is EMPTY.
  //
  // Against bgElevated a window does exist but is only 0.023 wide in luminance,
  // which is not a tolerance worth balancing a brand color on. The label is the
  // accessibility-critical half of the pair (it carries the words), so it wins
  // and the fill boundary is recorded here. Actual fill #F0556B is L=0.2608.
  "light:accentCtaHover:bgSecondary": 2.83,
  "light:accentCtaHover:bgElevated": 2.6,
  "light:accentCtaHover:bgElevatedHover": 2.34,
};

const THEMES: Array<[string, ColorTokens]> = [
  ["light", lightTokens],
  ["dark", darkTokens],
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.each(THEMES)("%s theme contrast", (themeName, tokens) => {
  describe("text on surfaces meets WCAG AA (4.5:1)", () => {
    const pairs: Array<[(typeof TEXT_KEYS)[number], (typeof SURFACE_KEYS)[number]]> =
      TEXT_KEYS.flatMap((textKey) =>
        SURFACE_KEYS.map(
          (surfaceKey) =>
            [textKey, surfaceKey] as [
              (typeof TEXT_KEYS)[number],
              (typeof SURFACE_KEYS)[number],
            ],
        ),
      );

    it.each(pairs)("%s on %s", (textKey, surfaceKey) => {
      const ratio = contrast(tokens[textKey], tokens[surfaceKey]);
      const label = `${textKey} ${tokens[textKey]} on ${surfaceKey} ${tokens[surfaceKey]}`;
      // Compared as an object so a failure prints the offending pair and its
      // measured ratio rather than a bare number.
      expect({ label, ratio: round(ratio), meetsAA: ratio >= AA_NORMAL_TEXT }).toEqual({
        label,
        ratio: round(ratio),
        meetsAA: true,
      });
    });
  });

  describe("the CTA label meets AA on every accent fill", () => {
    // Covers the resting fill AND the pressed fill. The pressed pair is the one
    // that regressed once already: darkening the label to #0D0F14 fixed the dark
    // press (2.87 -> 5.67) but broke the light press (4.79 -> 3.40) until
    // accentCtaHover was lifted instead of darkened.
    it.each([...ACCENT_FILL_KEYS])("textOnAccent on %s", (fillKey) => {
      const ratio = contrast(tokens.textOnAccent, tokens[fillKey]);
      const label = `textOnAccent ${tokens.textOnAccent} on ${fillKey} ${tokens[fillKey]}`;
      expect({ label, ratio: round(ratio), meetsAA: ratio >= AA_NORMAL_TEXT }).toEqual({
        label,
        ratio: round(ratio),
        meetsAA: true,
      });
    });
  });

  it("keeps the brand red exactly #E63946", () => {
    // The push accent in app.json is this value. Moving it would force a native
    // rebuild and break the OTA-only guarantee of this change.
    expect(tokens.accentCta).toBe("#E63946");
  });

  it("the brand red is never reachable as a text token", () => {
    for (const key of TEXT_KEYS) {
      expect(tokens[key]).not.toBe(tokens.accentCta);
    }
  });

  it("keeps stateNeutral pinned to textTertiary", () => {
    // They are documented as the same hex. Without this they can silently
    // diverge: fixing textTertiary alone leaves every stateNeutral pair
    // measuring the old, failing value while the suite stays green.
    expect(tokens.stateNeutral).toBe(tokens.textTertiary);
  });


  describe("non-text marks meet WCAG 1.4.11 (3:1) on every surface", () => {
    const markPairs: Array<
      [(typeof NON_TEXT_KEYS)[number], (typeof SURFACE_KEYS)[number]]
    > = NON_TEXT_KEYS.flatMap((markKey) =>
      SURFACE_KEYS.map(
        (surfaceKey) =>
          [markKey, surfaceKey] as [
            (typeof NON_TEXT_KEYS)[number],
            (typeof SURFACE_KEYS)[number],
          ],
      ),
    );

    it.each(markPairs)("%s on %s", (markKey, surfaceKey) => {
      const ratio = contrast(tokens[markKey], tokens[surfaceKey]);
      const exceptionKey = `${themeName}:${markKey}:${surfaceKey}`;
      const accepted = NON_TEXT_EXCEPTIONS[exceptionKey];

      if (accepted === undefined) {
        const label = `${markKey} ${tokens[markKey]} on ${surfaceKey} ${tokens[surfaceKey]}`;
        expect({ label, ratio: round(ratio), meets: ratio >= NON_TEXT }).toEqual({
          label,
          ratio: round(ratio),
          meets: true,
        });
        return;
      }

      // Known exception: must not get worse...
      expect(round(ratio)).toBeGreaterThanOrEqual(accepted);
      // ...and once it clears 3:1 the exception is stale, so say so loudly
      // rather than letting a dead entry mask a future regression.
      expect({
        exceptionKey,
        ratio: round(ratio),
        stillNeeded: ratio < NON_TEXT,
      }).toEqual({ exceptionKey, ratio: round(ratio), stillNeeded: true });
    });
  });

  it("keeps the documented elevation direction", () => {
    const luminances = SURFACE_KEYS.map((key) =>
      relativeLuminance(parseColor(tokens[key]).rgb),
    );
    // Dark surfaces shift LIGHTER as they elevate; light surfaces shift DARKER.
    const expectAscending = themeName === "dark";
    for (let i = 1; i < luminances.length; i++) {
      if (expectAscending) {
        expect(luminances[i]).toBeGreaterThan(luminances[i - 1]);
      } else {
        expect(luminances[i]).toBeLessThan(luminances[i - 1]);
      }
    }
  });

  it("the composited card boundary does not regress", () => {
    const edge = composite(tokens.borderHairline, tokens.bgElevated);
    expect(contrast(edge, tokens.bgPrimary)).toBeGreaterThanOrEqual(
      BOUNDARY_FLOOR,
    );
  });

  it("orders the hairline ramp faint < hairline < strong", () => {
    const strength = (token: string) =>
      contrast(composite(token, tokens.bgElevated), tokens.bgElevated);
    expect(strength(tokens.borderHairlineFaint)).toBeLessThan(
      strength(tokens.borderHairline),
    );
    expect(strength(tokens.borderHairline)).toBeLessThan(
      strength(tokens.borderHairlineStrong),
    );
  });
});

describe("token mirrors stay in lockstep", () => {
  /** Pull the `:root` light defaults back out of the tailwind addBase plugin. */
  function readTailwindLightVars(): Record<string, string> {
    const config = require("../../tailwind.config.js");
    let captured: Record<string, Record<string, string>> | undefined;
    for (const plugin of config.plugins) {
      plugin({ addBase: (base: Record<string, Record<string, string>>) => (captured = base) });
    }
    if (!captured || !captured[":root"]) {
      throw new Error("tailwind.config.js addBase plugin did not emit :root vars");
    }
    return captured[":root"];
  }

  const toCssVar = (key: string) =>
    `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;

  it("tailwind.config.js light defaults match lightTokens exactly", () => {
    const vars = readTailwindLightVars();
    const mismatches: string[] = [];
    for (const [key, value] of Object.entries(lightTokens)) {
      const cssVar = toCssVar(key);
      if (vars[cssVar] !== value) {
        mismatches.push(`${cssVar}: tailwind "${vars[cssVar]}" vs tokens "${value}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("neither mirror declares a token the other is missing", () => {
    const vars = readTailwindLightVars();
    const fromTokens = Object.keys(lightTokens).map(toCssVar).sort();
    expect(Object.keys(vars).sort()).toEqual(fromTokens);
  });

  it("keeps the text/fill split on the brand red wired up", () => {
    // Highest-risk mechanism in this change and the easiest to lose silently:
    // `text-cta` resolves through theme.extend.textColor, while `bg-cta` and
    // `border-cta` resolve through theme.extend.colors. A refactor that flattens
    // theme.extend would revert all 18 `text-cta` call sites to the brand red
    // (3.21:1 on a light plate) with every contrast assertion above still green,
    // because those compare token VALUES, not the utility mapping.
    const config = require("../../tailwind.config.js");
    expect(config.theme.extend.textColor.cta).toBe("var(--accent-cta-text)");
    expect(config.theme.extend.colors.cta).toBe("var(--accent-cta)");
  });

  it("lightTokens and darkTokens declare the same keys", () => {
    expect(Object.keys(darkTokens).sort()).toEqual(Object.keys(lightTokens).sort());
  });
});

describe("text-ink-on-cta is only ever used on an accent fill", () => {
  // `textOnAccent` is now near-black in both themes, so it is valid ONLY on the
  // red fill. In dark it measures 1.00:1 against bgPrimary, meaning a component
  // that reuses `text-ink-on-cta` off a CTA renders literally invisible text
  // rather than merely low-contrast text. Before the label was darkened that
  // mistake was survivable; now it is not, so it gets a guard.
  //
  // This is a WEAK guard, not an invariant: a co-location check at file
  // granularity. Any file that applies the label must also paint a CTA fill. It
  // cannot prove the two are on the same element, but it does catch the label
  // escaping into a file that has no CTA at all, which is the failure mode that
  // matters.
  //
  // Both spellings count, because the label reaches components two ways: the
  // NativeWind class `text-ink-on-cta`, and the runtime accessor
  // `tokens.textOnAccent` for RN props that take no className. lib/ is scanned
  // for the same reason: lib/error-tracking/sentry.ts pairs
  // `backgroundColor: t.accentCta` with `color: t.textOnAccent`, and an earlier
  // version of this scan could not see it.
  const fs = require("fs");
  const path = require("path");
  const MOBILE_ROOT = path.resolve(__dirname, "..", "..");
  const SCAN_DIRS = ["app", "components", "lib"];
  // \b stops `accentCta` from matching `accentCtaText`, which implies no fill.
  const LABEL_PATTERN = /text-ink-on-cta|\btextOnAccent\b/;
  const FILL_PATTERN = /bg-cta|\baccentCta\b|\baccentCtaHover\b/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full, out);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  const labelUsers = () =>
    SCAN_DIRS.flatMap((dir) => walk(path.join(MOBILE_ROOT, dir))).filter(
      (file: string) => LABEL_PATTERN.test(fs.readFileSync(file, "utf8")),
    );

  it("every file applying the CTA label also paints a CTA fill", () => {
    const offenders = labelUsers()
      .filter((file: string) => !FILL_PATTERN.test(fs.readFileSync(file, "utf8")))
      .map((file: string) => path.relative(MOBILE_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("actually finds the label, so the scan cannot pass vacuously", () => {
    // Guards against a rename or a bad SCAN_DIRS silently emptying the scan.
    expect(labelUsers().length).toBeGreaterThan(0);
  });

  it("reaches the runtime accessor form in lib/, not just the class form", () => {
    const seen = labelUsers().map((file: string) =>
      path.relative(MOBILE_ROOT, file),
    );
    expect(seen).toContain("lib/error-tracking/sentry.ts");
  });
});
