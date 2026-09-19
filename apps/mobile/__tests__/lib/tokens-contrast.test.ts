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

// ---------------------------------------------------------------------------
// WCAG 2.1 math
// ---------------------------------------------------------------------------

interface ParsedColor {
  rgb: [number, number, number];
  alpha: number;
}

function parseColor(value: string): ParsedColor {
  const rgba = value.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  const hexMatch = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hexMatch) throw new Error(`Unsupported color format: "${value}"`);
  let hex = hexMatch[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return {
    rgb: [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ],
    alpha: 1,
  };
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two opaque colors. */
function contrast(a: string, b: string): number {
  const la = relativeLuminance(parseColor(a).rgb);
  const lb = relativeLuminance(parseColor(b).rgb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Flatten a translucent color over an opaque background, returning "#rrggbb". */
function composite(overlay: string, background: string): string {
  const fg = parseColor(overlay);
  const bg = parseColor(background);
  const out = fg.rgb.map((channel, i) =>
    Math.round(channel * fg.alpha + bg.rgb[i] * (1 - fg.alpha)),
  );
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const round = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** WCAG 1.4.3 AA, normal-size text. */
const AA_NORMAL_TEXT = 4.5;
/** WCAG 1.4.11, non-text contrast (accent rails, focus rings, meaningful fills). */
const NON_TEXT = 3.0;
/**
 * Interim floor for the composited card boundary (hairline over plate, measured
 * against the page). The 1.4.11 target is 3:1, which is NOT reachable with a
 * hairline in either theme: dark needs alpha ~0.77 (#59606C) and light ~0.41
 * (#888B92), both of which read as a drawn outline rather than a hairline and
 * would break the design language. This floor locks in the improvement that was
 * made (dark 1.49 -> 2.03, light 1.58 -> 1.99) and prevents silent regression.
 * Raising it to 3.0 is a separate, user-facing design decision.
 */
const BOUNDARY_FLOOR = 1.9;

/** Surfaces text can legitimately sit on. */
const SURFACE_KEYS = [
  "bgPrimary",
  "bgSecondary",
  "bgElevated",
  "bgElevatedHover",
] as const;

/**
 * Every token that renders as text. `accentCta` is deliberately absent: it is
 * the brand red, reserved for fills and rules, and `text-cta` is remapped to
 * `accentCtaText` in tailwind.config.js precisely because the brand red cannot
 * reach 4.5:1 as text on any surface in either theme.
 */
const TEXT_KEYS = [
  "textPrimary",
  "textSecondary",
  "textTertiary",
  "accentCtaText",
  "statePositive",
  "stateNegative",
  "stateNeutral",
] as const;

/**
 * Accent FILLS that carry a `textOnAccent` label. `accentCtaHover` belongs here:
 * 30 call sites put `active:bg-cta-hover` on a `bg-cta` button whose label is
 * `text-ink-on-cta`, so the pressed state is a real text-on-surface pair. These
 * are deliberately NOT in SURFACE_KEYS, because the neutral ink tokens never sit
 * on a red fill.
 */
const ACCENT_FILL_KEYS = ["accentCta", "accentCtaHover"] as const;

/** Tokens drawn as non-text marks (Plate accent rails, selected borders, bars). */
const NON_TEXT_KEYS = ["accentCta", "statePositive", "stateNegative"] as const;

/**
 * Non-text pairs that cannot reach 3:1 without moving a locked brand color.
 * Recorded at their measured value so the number cannot drift further unnoticed.
 * Keyed `theme:mark:surface`.
 */
const NON_TEXT_EXCEPTIONS: Record<string, number> = {
  // Brand red on the darkest light surface. Passing would require moving
  // #E63946, which is locked. Live at components/gym-manager/elo-sparkline.tsx:42
  // and gym-stats-trend.tsx:44, where the highlighted `bg-cta` bar sits directly
  // against `bg-surface-4` bars. Pre-existing and accepted, not introduced here.
  "light:accentCta:bgElevatedHover": 2.89,
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
  // This is a co-location check at file granularity: any file that uses the
  // label class must also paint a `bg-cta` fill. It cannot prove the two are on
  // the same element, but it does catch the class escaping into a component
  // that has no CTA at all, which is the failure mode that matters.
  const fs = require("fs");
  const path = require("path");
  const MOBILE_ROOT = path.resolve(__dirname, "..", "..");
  const SCAN_DIRS = ["app", "components"];
  const LABEL_CLASS = "text-ink-on-cta";
  const FILL_CLASS = "bg-cta";

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

  it("every file using the label class also paints a CTA fill", () => {
    const files = SCAN_DIRS.flatMap((dir) => walk(path.join(MOBILE_ROOT, dir)));
    const offenders = files
      .filter((file: string) => {
        const source: string = fs.readFileSync(file, "utf8");
        return source.includes(LABEL_CLASS) && !source.includes(FILL_CLASS);
      })
      .map((file: string) => path.relative(MOBILE_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("actually finds the label class, so the scan cannot pass vacuously", () => {
    const files = SCAN_DIRS.flatMap((dir) => walk(path.join(MOBILE_ROOT, dir)));
    const users = files.filter((file: string) =>
      fs.readFileSync(file, "utf8").includes(LABEL_CLASS),
    );
    expect(users.length).toBeGreaterThan(0);
  });
});
