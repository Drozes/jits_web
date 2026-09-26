/**
 * Accessible name for a match history row link:
 * "Open match vs Demo Red, win, +12" (ranked) / "Open match vs Demo Red, draw" (casual).
 * The "Open match vs " prefix is a contract with the harness; keep it.
 */
export function matchRowLabel(
  opponentName: string,
  outcome: string | null | undefined,
  matchType: string | null | undefined,
  delta: number | null | undefined,
): string {
  const parts = [`Open match vs ${opponentName}`];
  if (outcome === "win" || outcome === "loss" || outcome === "draw") parts.push(outcome);
  if (matchType === "ranked" && delta != null) {
    parts.push(delta > 0 ? `+${delta}` : `${delta}`);
  }
  return parts.join(", ");
}
