import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import type { CardStatus } from "@/lib/film-room/card-status";

/**
 * Pure rules for the Matches feed's low-data and empty states
 * (specs/matches-tab sections 10.1 to 10.3). The library lists matches
 * newest first, so the oldest loaded match is the last item.
 */

/** C-L3 / C-L4: permanent meta tags on the oldest match and the first win. */
export const FIRST_MATCH_TAG = "FIRST MATCH";
export const FIRST_WIN_TAG = "FIRST WIN";

/** Low data is 1 to 3 matches with the whole history loaded. */
export const LOW_DATA_MAX = 3;

const NO_TAGS: readonly string[] = [];

/**
 * Per match id, the FIRST MATCH / FIRST WIN tags. Only once the full history
 * is loaded (`!hasMore`): before that the last loaded item is not the oldest.
 * One match can carry both (a first match that was a win).
 */
export function firstTags(items: readonly MatchLibraryItem[], hasMore: boolean): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  if (hasMore || items.length === 0) return out;
  out.set(items[items.length - 1].match_id, [FIRST_MATCH_TAG]);
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].outcome !== "win") continue;
    const id = items[i].match_id;
    out.set(id, [...(out.get(id) ?? []), FIRST_WIN_TAG]);
    break;
  }
  return out;
}

export function tagsFor(tags: ReadonlyMap<string, readonly string[]>, matchId: string): readonly string[] {
  return tags.get(matchId) ?? NO_TAGS;
}

/**
 * The card draws C-L7 "No film for this one" (spec 10.3): its match has no
 * video rows at all and nothing is on its way. That is a card with no status
 * to show (`none`: nothing recorded, or the phase says no video yet) or the
 * server's final `no_film` (nobody recorded, after the grace period). A card
 * whose film is still coming (collecting, waiting for an angle, building, a
 * local upload, processing) is not one. The ONE predicate the caption, the
 * badge and the helper card all use, so they never disagree.
 */
export function drawsNoFilmCaption(item: Pick<MatchLibraryItem, "videos">, status: CardStatus): boolean {
  return item.videos.length === 0 && (status.kind === "none" || status.kind === "no_film");
}

/**
 * The one card that teaches the recording helper (C-L6): the first card in
 * the list that draws C-L7 (`drawsNoFilmCaption`). None while the carousel
 * on the same screen already shows C-L6, so the tip never appears twice.
 */
export function noFilmHelperMatchId(
  items: readonly MatchLibraryItem[],
  carouselShowsHelper: boolean,
  statusOf: (item: MatchLibraryItem) => CardStatus,
): string | null {
  if (carouselShowsHelper) return null;
  return items.find((i) => drawsNoFilmCaption(i, statusOf(i)))?.match_id ?? null;
}

/** Zero: the first page loaded with no matches, no error and no filter. */
export function isZeroState(input: { loading: boolean; error: unknown; items: readonly unknown[]; filtered: boolean }): boolean {
  return !input.loading && !input.error && !input.filtered && input.items.length === 0;
}

/** Low data: 1 to 3 matches, nothing more to page, no filter (the "next match" ghost card shows). */
export function isLowData(input: { items: readonly unknown[]; hasMore: boolean; filtered: boolean }): boolean {
  return !input.hasMore && !input.filtered && input.items.length > 0 && input.items.length <= LOW_DATA_MAX;
}
