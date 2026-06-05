/**
 * Pure formatters for the gym-owner stats screens (H8 gym stats + H10 per-ELO
 * bracket drill-down). Kept free of RN/Expo deps so they stay unit-testable in
 * isolation, matching the roster-format / format-countdown pattern here.
 */
import type { GymStatsRange } from "@jits/shared/api/queries";

/** Range filter chip label for the 30d / 90d / all toggle. */
export function formatRangeLabel(range: GymStatsRange): string {
  if (range === "30d") return "30 Days";
  if (range === "90d") return "90 Days";
  return "All Time";
}

/** Short range suffix for inline meta lines ("Matches · 90d"). */
export function formatRangeSuffix(range: GymStatsRange): string {
  if (range === "30d") return "30d";
  if (range === "90d") return "90d";
  return "All";
}

/**
 * 0..1 fraction -> whole-percent string ("78%"). Out-of-range / non-finite
 * inputs clamp to "0%". Used for submission rate, draw rate, and sub shares.
 */
export function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "0%";
  const clamped = Math.max(0, Math.min(1, fraction));
  return `${Math.round(clamped * 100)}%`;
}

/**
 * Finish time in seconds -> "m:ss" (wireframe style: no leading zero on the
 * minutes, e.g. "3:14"). Negative / non-finite inputs and a 0 (no data) render
 * as an em-dash so the stat tiles read cleanly when a window has no finishes.
 */
export function formatFinishTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Aggregate ELO -> whole-number string. The BE returns avg-ELO values as
 * round(x, 1) NUMERIC (one decimal), but individual-athlete ELO is an integer
 * everywhere else in the app, so display aggregate ELO rounded to match.
 * Non-finite -> "0".
 */
export function formatElo(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value));
}

/**
 * Signed momentum -> "+12" / "−7" / "0". Uses the U+2212 minus glyph to match
 * the brand mono numerals; rounds to a whole number. Non-finite -> "0".
 */
export function formatMomentum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `−${Math.abs(rounded)}`;
  return "0";
}

const TIER_LABELS: Record<string, string> = {
  "1900+": "Top Tier",
  "1700-1900": "Advanced",
  "1500-1700": "Intermediate",
  "1300-1500": "Developing · Provisional",
};

/** Human tier label for a fixed ELO bracket (wireframe H10 `.tier-label`). */
export function formatTierLabel(bracket: string): string {
  return TIER_LABELS[bracket] ?? "";
}

/**
 * BE bracket key uses a plain hyphen ("1700-1900"); the wireframe shows an en
 * dash range. Normalize for display, leaving the open-ended "1900+" untouched.
 */
export function formatBracketRange(bracket: string): string {
  return bracket.replace("-", "–");
}
