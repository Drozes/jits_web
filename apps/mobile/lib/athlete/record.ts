/** An athlete's win, loss and draw counts. */
export interface RecordCounts {
  wins: number;
  losses: number;
  draws: number;
}

/** The compact mono record line, for example "14W · 6L · 1D". */
export function formatRecord({ wins, losses, draws }: RecordCounts): string {
  return `${wins}W · ${losses}L · ${draws}D`;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The spoken form of the record line, so a screen reader never reads the
 * glyphs "14W dot 6L": "Record: 14 wins, 6 losses, 1 draw".
 */
export function recordA11yLabel({ wins, losses, draws }: RecordCounts): string {
  return `Record: ${count(wins, "win", "wins")}, ${count(losses, "loss", "losses")}, ${count(draws, "draw", "draws")}`;
}
