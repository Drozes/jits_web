import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { useCachedResource } from "@/lib/cache/use-cached-resource";
import {
  getMyMatchLibrary,
  type MatchLibraryItem,
  type MatchLibraryPage,
} from "@jits/shared/api/film-room";

export const LIBRARY_PAGE_SIZE = 20;

export function libraryCacheKey(athleteId: string | undefined): string {
  return `match-library:${athleteId ?? "anon"}`;
}

/**
 * The first library page through the stale-while-revalidate cache, shared by
 * the Profile preview row and the Film Room so either paints warm after the
 * other. The fetcher throws on `ok: false` so the cache surfaces `error`.
 */
export function useMatchLibraryFirstPage(athleteId: string | undefined) {
  return useCachedResource<MatchLibraryPage>(
    libraryCacheKey(athleteId),
    async () => {
      if (!athleteId) return { items: [], next_before: null, source: "rpc" };
      const result = await getMyMatchLibrary(supabase, athleteId, { limit: LIBRARY_PAGE_SIZE });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    [athleteId],
  );
}

export interface MatchLibrary {
  items: MatchLibraryItem[];
  /** Cold load of the first page. */
  isLoading: boolean;
  /** Any first-page fetch in flight (drives pull-to-refresh). */
  isValidating: boolean;
  /** First-page error with nothing on screen yet. */
  error: Error | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** The last "load more" failed; the footer offers a retry. */
  moreError: boolean;
  loadMore: () => void;
  /** Drop later pages and re-read the first. */
  refresh: () => void;
  /** Re-read the first page, keeping later pages (focus / upload landed). */
  revalidate: () => void;
}

function dedupe(items: MatchLibraryItem[]): MatchLibraryItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.match_id) ? false : (seen.add(i.match_id), true)));
}

/**
 * The whole Film Room list: the cached first page plus every page loaded
 * since through `next_before`. A "load more" that lands after the athlete
 * changed or the list was refreshed is dropped (epoch guard).
 */
export function useMatchLibrary(athleteId: string | undefined): MatchLibrary {
  const first = useMatchLibraryFirstPage(athleteId);
  const [more, setMore] = React.useState<{ items: MatchLibraryItem[]; next_before: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const epoch = React.useRef(0);
  const busy = React.useRef(false);

  React.useEffect(() => {
    epoch.current += 1;
    busy.current = false;
    setMore(null);
    setLoadingMore(false);
    setMoreError(false);
  }, [athleteId]);

  const nextBefore = more ? more.next_before : first.data?.next_before ?? null;

  const loadMore = React.useCallback(() => {
    if (!athleteId || !nextBefore || busy.current) return;
    busy.current = true;
    const mine = epoch.current;
    setLoadingMore(true);
    setMoreError(false);
    void (async () => {
      const result = await getMyMatchLibrary(supabase, athleteId, {
        limit: LIBRARY_PAGE_SIZE,
        before: nextBefore,
      });
      if (mine !== epoch.current) return;
      busy.current = false;
      setLoadingMore(false);
      if (!result.ok) {
        setMoreError(true);
        return;
      }
      setMore((prev) => ({
        items: [...(prev?.items ?? []), ...result.data.items],
        next_before: result.data.next_before,
      }));
    })();
  }, [athleteId, nextBefore]);

  const refetchFirst = first.refetch;
  const refresh = React.useCallback(() => {
    epoch.current += 1;
    busy.current = false;
    setMore(null);
    setLoadingMore(false);
    setMoreError(false);
    refetchFirst();
  }, [refetchFirst]);

  const items = React.useMemo(
    () => dedupe([...(first.data?.items ?? []), ...(more?.items ?? [])]),
    [first.data, more],
  );

  return {
    items,
    isLoading: first.isLoading && first.data === undefined,
    isValidating: first.isValidating,
    error: first.data === undefined ? first.error : null,
    hasMore: !!nextBefore,
    loadingMore,
    moreError,
    loadMore,
    refresh,
    revalidate: refetchFirst,
  };
}
