import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { monthOf, shortName } from "./format";

export type OutcomeFilter = "all" | "win" | "loss" | "draw";

export interface LibraryFilter {
  outcome: OutcomeFilter;
  /** Only matches against this opponent; null = everyone. */
  opponentId: string | null;
}

export const NO_FILTER: LibraryFilter = { outcome: "all", opponentId: null };

export function applyFilter(items: MatchLibraryItem[], f: LibraryFilter): MatchLibraryItem[] {
  return items.filter(
    (i) =>
      (f.outcome === "all" || i.outcome === f.outcome) &&
      (!f.opponentId || i.opponent?.id === f.opponentId),
  );
}

/** Distinct opponents in the loaded items, most matches first, then by name. */
export function opponentsOf(items: MatchLibraryItem[]): { id: string; name: string; count: number }[] {
  const byId = new Map<string, { id: string; name: string; count: number }>();
  for (const i of items) {
    if (!i.opponent) continue;
    const entry = byId.get(i.opponent.id) ?? {
      id: i.opponent.id,
      name: shortName(i.opponent.display_name),
      count: 0,
    };
    entry.count += 1;
    byId.set(i.opponent.id, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export type LibraryRow =
  | { type: "month"; key: string; label: string; count: number; last: boolean }
  | { type: "pair"; key: string; items: [MatchLibraryItem] | [MatchLibraryItem, MatchLibraryItem] };

/**
 * Flatten newest-first items into FlatList rows: a month heading, then the
 * month's posters two per row. Input order is kept (it is already newest
 * first), so a month split across pages still reads as one group.
 */
export function buildRows(items: MatchLibraryItem[]): LibraryRow[] {
  const rows: LibraryRow[] = [];
  let i = 0;
  while (i < items.length) {
    const month = monthOf(items[i].completed_at);
    let j = i;
    while (j < items.length && monthOf(items[j].completed_at).key === month.key) j += 1;
    rows.push({ type: "month", key: `m:${month.key}:${i}`, label: month.label, count: j - i, last: j >= items.length });
    for (let k = i; k < j; k += 2) {
      const pair = (k + 1 < j ? [items[k], items[k + 1]] : [items[k]]) as
        | [MatchLibraryItem]
        | [MatchLibraryItem, MatchLibraryItem];
      rows.push({ type: "pair", key: `p:${items[k].match_id}`, items: pair });
    }
    i = j;
  }
  return rows;
}

/** W / L / D totals over match history rows (`athlete_outcome`). */
export function recordOf(
  history: ReadonlyArray<{ athlete_outcome: string | null }>,
): { wins: number; losses: number; draws: number } {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const h of history) {
    if (h.athlete_outcome === "win") wins += 1;
    else if (h.athlete_outcome === "loss") losses += 1;
    else if (h.athlete_outcome === "draw") draws += 1;
  }
  return { wins, losses, draws };
}
