/**
 * WCAG 2.1 contrast math and the AA threshold table for the ELO design tokens.
 *
 * This lives outside any *.test.ts file so that BOTH suites that depend on it
 * can import it without one registering the other's tests:
 *
 *   - tokens-contrast.test.ts  asserts the mobile palette clears these
 *     thresholds (the AA gate proper).
 *   - tokens-mirror-drift.test.ts  re-asserts the same thresholds before it
 *     certifies any mirror against the palette, so the drift guard can never
 *     report "the brand file agrees with mobile" in green while the palette it
 *     agreed with has quietly stopped passing AA.
 *
 * The thresholds are defined ONCE, here. Neither suite restates them.
 *
 * `__tests__/support/` is excluded from jest's testMatch via
 * testPathIgnorePatterns in jest.config.js, because jest's default testMatch
 * treats every .ts file under __tests__ as a suite.
 */

// ---------------------------------------------------------------------------
// WCAG 2.1 math
// ---------------------------------------------------------------------------

export interface ParsedColor {
  rgb: [number, number, number];
  alpha: number;
}

export function parseColor(value: string): ParsedColor {
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

export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two opaque colors. */
export function contrast(a: string, b: string): number {
  const la = relativeLuminance(parseColor(a).rgb);
  const lb = relativeLuminance(parseColor(b).rgb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Flatten a translucent color over an opaque background, returning "#rrggbb". */
export function composite(overlay: string, background: string): string {
  const fg = parseColor(overlay);
  const bg = parseColor(background);
  const out = fg.rgb.map((channel, i) =>
    Math.round(channel * fg.alpha + bg.rgb[i] * (1 - fg.alpha)),
  );
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export const round = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** WCAG 1.4.3 AA, normal-size text. */
export const AA_NORMAL_TEXT = 4.5;
/** WCAG 1.4.11, non-text contrast (accent rails, focus rings, meaningful fills). */
export const NON_TEXT = 3.0;
/**
 * Interim floor for the composited card boundary (hairline over plate, measured
 * against the page). The 1.4.11 target is 3:1, which is NOT reachable with a
 * hairline in either theme: dark needs alpha ~0.77 (#59606C) and light ~0.41
 * (#888B92), both of which read as a drawn outline rather than a hairline and
 * would break the design language. This floor locks in the improvement that was
 * made (dark 1.49 -> 2.03, light 1.58 -> 1.99) and prevents silent regression.
 * Raising it to 3.0 is a separate, user-facing design decision.
 */
export const BOUNDARY_FLOOR = 1.9;

/** Surfaces text can legitimately sit on. */
export const SURFACE_KEYS = [
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
export const TEXT_KEYS = [
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
export const ACCENT_FILL_KEYS = ["accentCta", "accentCtaHover"] as const;

/**
 * Tokens drawn as non-text marks (Plate accent rails, selected borders, bars).
 * `accentCtaHover` is here as well as in ACCENT_FILL_KEYS: the pressed button is
 * a fill with its own boundary against the page, so it owes 1.4.11 on top of the
 * 4.5:1 it owes its label.
 */
export const NON_TEXT_KEYS = [
  "accentCta",
  "accentCtaHover",
  "statePositive",
  "stateNegative",
] as const;
