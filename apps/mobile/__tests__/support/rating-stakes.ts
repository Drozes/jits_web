import type { RatingStakes } from "@jits/shared/types/composites";

/**
 * A `get_rating_stakes` response (jr_be spec 019 section 5.2), from the
 * viewer's side. The `challenger_*` aliases deliberately DIFFER from
 * win/draw/loss here, so a consumer still reading the aliases fails a test
 * instead of passing by coincidence (the server always sends them equal).
 */
export function ratingStakes(overrides: Partial<RatingStakes> = {}): RatingStakes {
  return {
    model: "thomas-v9",
    viewer: { athlete_id: "me-1", rating: 1512, rd: 80 },
    opponent: { athlete_id: "opp-1", rating: 1498, rd: 90 },
    win: 14,
    draw: -2,
    loss: -9,
    opponent_win: 9,
    opponent_draw: 2,
    opponent_loss: -14,
    win_probability: 0.52,
    expected: 0.52,
    rematch_weight: 1,
    prior_meetings: 0,
    weight_division_gap: 0,
    weight_offset: 3,
    weight_ratio_pct: 1.8,
    challenger_win: 99,
    challenger_draw: 99,
    challenger_loss: -99,
    challenger_expected: 0.52,
    ...overrides,
  };
}
