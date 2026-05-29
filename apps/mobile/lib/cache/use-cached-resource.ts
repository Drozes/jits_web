import * as React from "react";

/**
 * Lightweight stale-while-revalidate cache for ELO RATED mobile.
 *
 * No external data-fetching library. The four tab payloads are cheap RPCs that
 * revalidate in well under a second, so the cache is **in-memory only**: a
 * module-level `Map` keyed by string. It already survives every in-session
 * navigation (tabs stay mounted), so cross-launch persistence would buy only a
 * sub-second head start on the very first cold paint after a kill — not worth
 * the AsyncStorage serialization, staleness-on-launch, and cache-busting cost
 * in v1. The `key` string IS the documented seam: a future AsyncStorage/MMKV
 * read-through can hydrate the Map keyed by the same strings with zero caller
 * changes.
 *
 * Mechanics (all four required):
 *   1. WARM FIRST PAINT — on mount, if a cached value exists for the key it is
 *      returned synchronously on first render and the skeleton is skipped, then
 *      a background revalidate is kicked.
 *   2. BACKGROUND REVALIDATE — on success the value is swapped in place via
 *      setState + `store.set`; on error the stale value is kept (never cleared)
 *      and the error is surfaced to the caller for its per-tab toast.
 *   3. DEDUP PER KEY — if a fetch for the key is already in-flight, concurrent
 *      callers/mount cycles await that same promise instead of firing a second
 *      fetch; `.promise` is cleared in a finally.
 *   4. CANCELLATION VIA cancelled REF — each effect run creates a fresh
 *      `{ cancelled: false }` token passed into `fetcher(token)`; cleanup sets
 *      `token.cancelled = true`; resolutions check the token before setState so
 *      unmount or a superseding deps change drops the stale write (canonical
 *      mobile pattern, matches `use-match-details.ts`).
 */

export interface CancelToken {
  cancelled: boolean;
}

interface CacheEntry<T> {
  data?: T;
  /** In-flight fetch for this key, used to dedupe concurrent callers. */
  promise?: Promise<T>;
  /** Last successful write timestamp (Date.now()). */
  ts: number;
}

/**
 * Module-level in-memory store. Persists for the life of the JS context, i.e.
 * across every in-session navigation. Typed loosely here because entries are
 * heterogeneous across keys; each `useCachedResource<T>` call narrows reads.
 */
const store = new Map<string, CacheEntry<unknown>>();

function getEntry<T>(key: string): CacheEntry<T> | undefined {
  return store.get(key) as CacheEntry<T> | undefined;
}

/**
 * Write-through helper for callers to seed/replace a cached value after a
 * mutation, so the next mount of a screen reading the same key paints warm.
 * Passive seam — not required in v1, but the documented escape hatch.
 */
export function mutateCache<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
}

export interface CachedResource<T> {
  /** Last-known value for the key, returned synchronously when warm. */
  data: T | undefined;
  /** True ONLY on cold start (no cached value yet). Warm mounts skip it. */
  isLoading: boolean;
  /** True while a warm value is on screen during a background revalidate. */
  isStale: boolean;
  /** Tracks any in-flight fetch (cold or background). */
  isValidating: boolean;
  /** Trigger a revalidation WITHOUT clearing the current data. */
  refetch: () => void;
  // --- aliases for the requirements-list naming, same underlying state ---
  /** Alias of `isValidating` minus the cold-start case (background only). */
  isRevalidating: boolean;
  /** Last fetch error while a stale value remains on screen; null otherwise. */
  error: Error | null;
  /** Alias of `refetch`. */
  refresh: () => void;
}

export function useCachedResource<T>(
  key: string,
  fetcher: (signal: CancelToken) => Promise<T>,
  deps: React.DependencyList = [key],
): CachedResource<T> {
  // WARM FIRST PAINT: read the Map synchronously on first render. If an entry
  // exists, `data` is populated immediately and `isLoading` starts false.
  const [data, setData] = React.useState<T | undefined>(
    () => getEntry<T>(key)?.data,
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(
    () => getEntry<T>(key)?.data === undefined,
  );
  const [isValidating, setIsValidating] = React.useState<boolean>(false);
  const [error, setError] = React.useState<Error | null>(null);
  // Manual revalidation trigger; bumping re-runs the effect without changing key.
  const [tick, setTick] = React.useState(0);

  // Keep the latest fetcher in a ref so it is not part of the effect deps:
  // callers commonly pass an inline closure, and we re-run on `deps`/`tick`.
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  React.useEffect(() => {
    const token: CancelToken = { cancelled: false };

    // Sync local state to whatever the Map holds for this (possibly changed)
    // key. The Map persists across deps changes, so an unchanged key stays a
    // warm hit; a changed key paints warm if it too was cached, else cold.
    const existing = getEntry<T>(key);
    setData(existing?.data);
    setIsLoading(existing?.data === undefined);
    setError(null);
    setIsValidating(true);

    void (async () => {
      try {
        // DEDUP PER KEY: reuse an in-flight promise if one exists; otherwise
        // start one and stash it on the entry so concurrent callers await it.
        let entry = getEntry<T>(key);
        let promise = entry?.promise;
        if (!promise) {
          promise = fetcherRef.current(token);
          entry = { ...(entry ?? { ts: 0 }), promise };
          store.set(key, entry);
        }

        const result = await promise;

        // CANCELLATION: a superseding deps change or unmount drops this write.
        if (token.cancelled) return;

        // BACKGROUND REVALIDATE: swap value in place; never clears on success.
        store.set(key, { data: result, ts: Date.now() });
        setData(result);
        setError(null);
      } catch (err) {
        if (token.cancelled) return;
        // Keep the stale value on screen; surface the error for the caller's
        // per-tab toast. Do NOT clear `data`.
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        // Clear the in-flight promise so the next mount/refetch can re-fire.
        const entry = getEntry<T>(key);
        if (entry?.promise) {
          const { promise: _drop, ...rest } = entry;
          store.set(key, rest);
        }
        if (!token.cancelled) {
          setIsValidating(false);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      token.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = React.useCallback(() => setTick((n) => n + 1), []);

  // `isStale`/`isRevalidating`: a warm value is on screen AND a fetch is running.
  const isStale = isValidating && data !== undefined;

  return {
    data,
    isLoading,
    isStale,
    isValidating,
    refetch,
    isRevalidating: isStale,
    error,
    refresh: refetch,
  };
}
