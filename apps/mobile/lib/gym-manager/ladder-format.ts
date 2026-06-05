/**
 * Pure helpers for the gym-owner gym ladder (H9 inter-gym comparison). Kept free
 * of RN/Expo deps so they stay unit-testable in isolation, matching the
 * roster-format / stats-format pattern here.
 */
import type { GymLadderRow } from "@jits/shared/types/gym-portal";

/**
 * Mono-caps meta line under a gym name, e.g. "TORONTO · 28 ATHLETES · 142
 * MATCHES" (wireframe `.gym-meta`). The city is dropped when unknown so the line
 * never reads "· 28 ATHLETES". The screen uppercases via the Text style, so this
 * keeps the source casing.
 */
export function formatGymMeta(row: GymLadderRow): string {
  const parts: string[] = [];
  if (row.city && row.city.trim()) parts.push(row.city.trim());
  parts.push(`${row.athleteCount} ${row.athleteCount === 1 ? "Athlete" : "Athletes"}`);
  parts.push(`${row.matchCount} ${row.matchCount === 1 ? "Match" : "Matches"}`);
  return parts.join(" · ");
}

/**
 * Distinct, sorted city names present on the ladder, used to build the city
 * filter chips after the "All Cities" default. Null/blank cities are dropped and
 * duplicates collapsed; sort is case-insensitive alphabetical.
 */
export function deriveCities(rows: GymLadderRow[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const c = r.city?.trim();
    if (c) seen.add(c);
  }
  return Array.from(seen).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/**
 * Summary line shown above the ladder, e.g. "12 PARTNER GYMS · 90d". Count
 * reflects the currently-filtered rows; the suffix is the active range label.
 */
export function formatLadderSummary(count: number, rangeSuffix: string): string {
  const noun = count === 1 ? "Partner Gym" : "Partner Gyms";
  return `${count} ${noun} · ${rangeSuffix}`;
}

/** The signed-in manager's own gym standing on the (filtered) ladder. */
export interface OwnGymStanding {
  /** 1-based rank within the supplied (filtered) rows. */
  rank: number;
  row: GymLadderRow;
}

/**
 * Finds the manager's own gym in the (filtered) ladder rows, returning its
 * 1-based rank and the row, or null when the gym is absent from the current
 * view (e.g. a city filter excludes it). Rows are assumed already ordered by the
 * BE (avg ELO DESC), so the index is the rank.
 */
export function findOwnGym(
  rows: GymLadderRow[],
  ownGymId: string | undefined,
): OwnGymStanding | null {
  if (!ownGymId) return null;
  const idx = rows.findIndex((r) => r.gymId === ownGymId);
  if (idx === -1) return null;
  return { rank: idx + 1, row: rows[idx] };
}
