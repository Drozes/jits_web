/**
 * The rating change a match actually recorded for an athlete, or null when it
 * recorded none.
 *
 * `match_participants.elo_delta` is `INTEGER NOT NULL DEFAULT 0`, so a legacy
 * row that never moved a rating (the retired casual type) still carries
 * `elo_delta = 0`, with `elo_after` NULL. The backend decides whether a delta
 * exists from `elo_after` (get_my_match_library, the highlight caption), and
 * every client surface uses the same rule through this helper so a legacy
 * row never shows a fake flat "0" change.
 */
export function recordedEloDelta(row: {
  elo_delta?: number | null;
  elo_after?: number | null;
}): number | null {
  if (row.elo_after == null) return null;
  const delta = row.elo_delta;
  return typeof delta === "number" && Number.isFinite(delta) ? delta : null;
}
