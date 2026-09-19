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

/** Tokens drawn as non-text marks (Plate accent rails, selected borders). */
const NON_TEXT_KEYS = ["accentCta", "statePositive", "stateNegative"] as const;

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

  it("the button label on the brand-red fill meets AA", () => {
    expect(contrast(tokens.textOnAccent, tokens.accentCta)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
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

  describe("non-text marks meet WCAG 1.4.11 (3:1) on the card surface", () => {
    it.each([...NON_TEXT_KEYS])("%s on bgElevated", (key) => {
      expect(contrast(tokens[key], tokens.bgElevated)).toBeGreaterThanOrEqual(
        NON_TEXT,
      );
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

  it("lightTokens and darkTokens declare the same keys", () => {
    expect(Object.keys(darkTokens).sort()).toEqual(Object.keys(lightTokens).sort());
  });
});
