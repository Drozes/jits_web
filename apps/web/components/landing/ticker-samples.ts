/**
 * The hero's sample ticker (addendum section 7, owner resolution of Q4):
 * a weight class and one athlete's outcome, never a name or a belt (the app
 * has no belt field). Labelled SAMPLE on screen; nothing here is live data.
 */
export type TickOutcome = "WIN" | "LOSS" | "DRAW";

/** delta is signed and never 0. */
export interface TickSample {
  lbs: number;
  outcome: TickOutcome;
  delta: number;
}

/**
 * The rating's no-gi weight classes (upper limits in lbs, Rooster to Super
 * Heavy), as in jr_be get_weight_division(); Ultra Heavy has no limit.
 */
export const TICKER_WEIGHTS = [122.5, 136, 149, 162, 175.5, 188.5, 202, 215] as const;

function intIn(random: () => number, min: number, max: number): number {
  return min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
}

/** WIN 40%, LOSS 40%, DRAW 20%; Glicko V9 ranges for established athletes (P11). */
export function sampleTick(random: () => number = Math.random): TickSample {
  const lbs = TICKER_WEIGHTS[intIn(random, 0, TICKER_WEIGHTS.length - 1)];
  const roll = random();
  if (roll < 0.4) return { lbs, outcome: "WIN", delta: intIn(random, 3, 20) };
  if (roll < 0.8) return { lbs, outcome: "LOSS", delta: -intIn(random, 3, 18) };
  const size = intIn(random, 1, 3);
  return { lbs, outcome: "DRAW", delta: random() < 0.5 ? size : -size };
}

export function formatTick(s: TickSample): string {
  return `${s.lbs} LBS · ${s.outcome} ${s.delta > 0 ? "▲" : "▼"}${Math.abs(s.delta)}`;
}

/** A new sample that never reads the same as the previous one. */
export function nextTick(prev: TickSample | null, random: () => number = Math.random): TickSample {
  let next = sampleTick(random);
  for (let i = 0; prev && i < 8 && formatTick(next) === formatTick(prev); i++) next = sampleTick(random);
  if (prev && formatTick(next) === formatTick(prev)) {
    const at = TICKER_WEIGHTS.indexOf(next.lbs as (typeof TICKER_WEIGHTS)[number]);
    next = { ...next, lbs: TICKER_WEIGHTS[(at + 1) % TICKER_WEIGHTS.length] };
  }
  return next;
}
