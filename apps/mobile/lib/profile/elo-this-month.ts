/** One rating change: when it happened and by how much (null: unknown). */
export interface RatingChange {
  at: string | null;
  delta: number | null;
}

/**
 * "ELO this month": the sum of the rating changes since the 1st of the
 * current month (local time). Profile reads it from the match history, the
 * header's Your numbers sheet from the rating history.
 */
export function sumEloThisMonth(changes: readonly RatingChange[], now: Date = new Date()): number {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return changes
    .filter((c) => c.at != null && new Date(c.at) >= startOfMonth)
    .reduce((sum, c) => sum + (c.delta ?? 0), 0);
}
