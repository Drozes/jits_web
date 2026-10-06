import type { MatchLibraryItem } from "@jits/shared/api/film-room";

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
 * The one card that teaches the recording helper (C-L6): the first card in
 * the list whose match has no video rows at all (C-L7). None while the
 * carousel on the same screen already shows C-L6, so the tip never appears
 * twice on one screen.
 */
export function noFilmHelperMatchId(items: readonly MatchLibraryItem[], carouselShowsHelper: boolean): string | null {
  if (carouselShowsHelper) return null;
  return items.find((i) => i.videos.length === 0)?.match_id ?? null;
}

/** Zero: the first page loaded with no matches, no error and no filter. */
export function isZeroState(input: { loading: boolean; error: unknown; items: readonly unknown[]; filtered: boolean }): boolean {
  return !input.loading && !input.error && !input.filtered && input.items.length === 0;
}

/** Low data: 1 to 3 matches, nothing more to page, no filter (the "next match" ghost card shows). */
export function isLowData(input: { items: readonly unknown[]; hasMore: boolean; filtered: boolean }): boolean {
  return !input.hasMore && !input.filtered && input.items.length > 0 && input.items.length <= LOW_DATA_MAX;
}
