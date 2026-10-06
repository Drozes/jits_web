import * as React from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { signPosterKeys } from "@jits/shared/api/poster-signing";
import type { DomainError } from "@jits/shared/api/errors";
import type { InFlightReel, MyHighlightItem } from "@jits/shared/api/highlight-share";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import {
  readMyHighlights,
  useForegroundEffect,
  useHighlightsChangedCount,
  useOnCountChange,
} from "./highlight-store";
import { ownReelItem, type ReelItem, type ReelLaneKey } from "./reel-types";
import {
  appendReelPage,
  mergeFirstPage,
  nextReelCursor,
  REEL_LANE_PAGE_SIZE,
  type BuildingReel,
  type ReelCursor,
} from "./reel-lane";

/** Poster URLs are signed for an hour... */
const POSTER_TTL_S = 3600;
/** ...and a kept one is signed again once older than this (the `use-new-highlight` rule). */
export const LANE_POSTER_RESIGN_AFTER_MS = 50 * 60_000;

// ---- module state: posters, local seen marks, warm lanes ------------------------

const posters = new Map<string, { url: string | null; at: number }>();
/** `highlightId:version` marked seen on this device this session; survives a read racing the server mark. */
const locallySeen = new Set<string>();

interface LaneState {
  items: ReelItem[];
  inFlight: BuildingReel[];
  /** True when the server sent `in_flight` (B2); false on an older backend. */
  inFlightSupported: boolean;
  clipsEnabled: boolean;
  cursor: ReelCursor | null;
  /** True once a read succeeded (the lane has real data). */
  loaded: boolean;
}

const EMPTY: LaneState = { items: [], inFlight: [], inFlightSupported: false, clipsEnabled: false, cursor: null, loaded: false };
const lanes = new Map<string, LaneState>();
const laneListeners = new Set<() => void>();

function seenKey(highlightId: string, version: number): string {
  return `${highlightId}:${version}`;
}

/**
 * Signs every key not already signed within the re-sign window, in ONE
 * storage call (spec 14: never one call per tile). Returns key -> URL.
 */
async function signAll(keys: (string | null)[], now = Date.now()): Promise<Map<string, string | null>> {
  const unique = [...new Set(keys.filter((k): k is string => !!k))];
  const stale = unique.filter((k) => {
    const hit = posters.get(k);
    return !hit || now - hit.at >= LANE_POSTER_RESIGN_AFTER_MS;
  });
  if (stale.length > 0) {
    const signed = await signPosterKeys(supabase, stale, POSTER_TTL_S);
    const at = Date.now();
    stale.forEach((k, i) => posters.set(k, { url: signed[i] ?? null, at }));
  }
  return new Map(unique.map((k) => [k, posters.get(k)?.url ?? null]));
}

function toItems(raw: MyHighlightItem[], urls: Map<string, string | null>): ReelItem[] {
  return raw.map((item) => {
    const reel = ownReelItem(item, item.posterPath ? (urls.get(item.posterPath) ?? null) : null);
    return locallySeen.has(seenKey(item.highlightId, item.version)) ? { ...reel, unseen: false } : reel;
  });
}

function toBuilding(raw: InFlightReel[], urls: Map<string, string | null>): BuildingReel[] {
  return raw.map((r) => ({ ...r, posterUrl: r.posterPath ? (urls.get(r.posterPath) ?? null) : null }));
}

export interface ReelPage {
  items: ReelItem[];
  cursor: ReelCursor | null;
}

/**
 * One later page of the athlete's own reels, posters signed (one batch).
 * Shared with the swipe viewer, which pages the same lane past what the
 * carousel loaded. Null on a failed read.
 */
export async function fetchReelPage(cursor: ReelCursor, limit = REEL_LANE_PAGE_SIZE): Promise<ReelPage | null> {
  const res = await readMyHighlights({ limit, before: cursor.before, beforeId: cursor.beforeId });
  if (!res.ok || !res.data.clipsEnabled) return null;
  const urls = await signAll(res.data.items.map((i) => i.posterPath));
  return { items: toItems(res.data.items, urls), cursor: nextReelCursor(res.data, limit) };
}

export interface UseReelLaneOptions {
  /**
   * Building tiles derived from library phases (`fallbackInFlight`), used
   * ONLY when the backend sends no `in_flight` (spec 12.3; Matches tab).
   */
  fallbackInFlight?: InFlightReel[];
}

export interface UseReelLaneResult {
  /** Ready reels in lane order: unseen first, then seen, newest first within each. */
  items: ReelItem[];
  /** Building tiles with signed posters (B2, or the Matches fallback). */
  inFlight: BuildingReel[];
  /** `highlight_clips_enabled`; false (fail-closed) until a read succeeds. When false the carousel is hidden. */
  clipsEnabled: boolean;
  /** True only while the first read is in flight with nothing cached. */
  loading: boolean;
  /** The last read's error; content already on screen is kept. Null after a good read. */
  error: DomainError | null;
  /** More ready reels exist past `items`. */
  hasMore: boolean;
  loadingMore: boolean;
  /** The B1 cursor of the next page (for the viewer's session store); null on the last page. */
  cursor: ReelCursor | null;
  /** Next page (no-op while one is loading or on the last page). */
  loadMore: () => void;
  /** Re-read the first page (`force` skips the shared read throttle; pull to refresh passes true). */
  refetch: (force?: boolean) => void;
  /** Clears a reel's ring at once (the viewer marks it seen server side). Does not reorder. */
  markSeenLocally: (highlightId: string) => void;
}

/**
 * The athlete's own reels for one carousel (specs/matches-tab section 5).
 *
 * Reads the first page (limit 10) through the shared, deduped
 * `readMyHighlights`, later pages with the B1 cursor (strings passed back
 * verbatim). Posters are batch-signed and re-signed past 50 minutes.
 * Re-reads on focus, on a real foreground, on match exit, on
 * `notifyHighlightsChanged` (forced) and on `refetch()`, the refresh rules
 * `useNewHighlight` had. State is kept per `laneKey` + athlete at module
 * level, so a remount paints warm. Only the newest read writes; none after
 * unmount. A failed read keeps what is on screen and reports `error`.
 */
export function useReelLane(
  athleteId: string | undefined,
  laneKey: ReelLaneKey,
  options: UseReelLaneOptions = {},
): UseReelLaneResult {
  const cacheKey = athleteId ? `${laneKey}:${athleteId}` : null;
  const [state, setState] = React.useState<LaneState>(() => (cacheKey ? lanes.get(cacheKey) : undefined) ?? EMPTY);
  const [error, setError] = React.useState<DomainError | null>(null);
  const [pending, setPending] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const stateRef = React.useRef(state);
  const seq = React.useRef(0);
  const moreSeq = React.useRef(0);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      seq.current += 1;
      moreSeq.current += 1;
    };
  }, []);

  const commit = React.useCallback(
    (next: LaneState) => {
      stateRef.current = next;
      if (cacheKey) lanes.set(cacheKey, next);
      setState(next);
    },
    [cacheKey],
  );

  // A different athlete (or lane) starts from its own cache.
  React.useEffect(() => {
    const warm = (cacheKey ? lanes.get(cacheKey) : undefined) ?? EMPTY;
    stateRef.current = warm;
    setState(warm);
    setError(null);
  }, [cacheKey]);

  // Another instance marked a reel seen: reflect it here without a read.
  React.useEffect(() => {
    const onChange = () => {
      if (!cacheKey) return;
      const shared = lanes.get(cacheKey);
      if (shared && shared !== stateRef.current) {
        stateRef.current = shared;
        setState(shared);
      }
    };
    laneListeners.add(onChange);
    return () => {
      laneListeners.delete(onChange);
    };
  }, [cacheKey]);

  const refetch = React.useCallback(
    (force = false) => {
      const id = ++seq.current;
      if (!athleteId) return;
      setPending(true);
      void (async () => {
        const res = await readMyHighlights({ limit: REEL_LANE_PAGE_SIZE }, { force });
        if (id !== seq.current) return;
        if (!res.ok) {
          setError(res.error);
          setPending(false);
          return;
        }
        const page = res.data;
        if (!page.clipsEnabled) {
          commit({ ...EMPTY, loaded: true });
          setError(null);
          setPending(false);
          return;
        }
        const urls = await signAll([...page.items.map((i) => i.posterPath), ...page.inFlight.map((r) => r.posterPath)]);
        if (id !== seq.current) return;
        const prev = stateRef.current;
        const firstCursor = nextReelCursor(page, REEL_LANE_PAGE_SIZE);
        const items = mergeFirstPage(prev.items, toItems(page.items, urls), firstCursor !== null);
        // Keep the deeper cursor when the old tail survived the merge.
        const keptTail = firstCursor !== null && items.length > page.items.length && prev.cursor !== null;
        commit({
          items,
          inFlight: toBuilding(page.inFlight, urls),
          inFlightSupported: page.inFlightSupported,
          clipsEnabled: true,
          cursor: keptTail ? prev.cursor : firstCursor,
          loaded: true,
        });
        setError(null);
        setPending(false);
      })().catch(() => {
        if (id === seq.current && alive.current) setPending(false);
      });
    },
    [athleteId, commit],
  );

  const loadMore = React.useCallback(() => {
    const cursor = stateRef.current.cursor;
    if (!athleteId || !cursor || loadingMore) return;
    const id = ++moreSeq.current;
    setLoadingMore(true);
    void fetchReelPage(cursor)
      .then((page) => {
        if (id !== moreSeq.current) return;
        setLoadingMore(false);
        if (!page) {
          setError({ code: "UNKNOWN", message: "Couldn't load more highlights." });
          return;
        }
        const prev = stateRef.current;
        // A refetch that moved the cursor meanwhile wins.
        if (prev.cursor !== cursor) return;
        commit({ ...prev, items: appendReelPage(prev.items, page.items), cursor: page.cursor });
      })
      .catch(() => {
        if (id === moreSeq.current && alive.current) setLoadingMore(false);
      });
  }, [athleteId, commit, loadingMore]);

  const markSeenLocally = React.useCallback(
    (highlightId: string) => {
      let changed = false;
      for (const [key, lane] of lanes) {
        if (!lane.items.some((i) => i.highlightId === highlightId && i.unseen)) continue;
        lane.items.forEach((i) => {
          if (i.highlightId === highlightId) locallySeen.add(seenKey(i.highlightId, i.version));
        });
        lanes.set(key, {
          ...lane,
          items: lane.items.map((i) => (i.highlightId === highlightId ? { ...i, unseen: false } : i)),
        });
        changed = true;
      }
      if (!changed) {
        const current = stateRef.current;
        current.items
          .filter((i) => i.highlightId === highlightId)
          .forEach((i) => locallySeen.add(seenKey(i.highlightId, i.version)));
        return;
      }
      if (cacheKey) {
        const mine = lanes.get(cacheKey);
        if (mine) {
          stateRef.current = mine;
          setState(mine);
        }
      }
      for (const l of laneListeners) l();
    },
    [cacheKey],
  );

  useFocusEffect(React.useCallback(() => refetch(), [refetch]));
  useForegroundEffect(() => refetch());
  useOnCountChange(useHighlightsChangedCount(), () => refetch(true));
  const exits = useMatchExitCount();
  useOnCountChange(exits, () => refetch());

  // Matches fallback: building tiles from library phases, only without B2.
  const fallback = options.fallbackInFlight;
  const [fallbackPosters, setFallbackPosters] = React.useState<Map<string, string | null>>(() => new Map());
  const fallbackKeys = state.inFlightSupported || !fallback ? "" : fallback.map((r) => r.posterPath ?? "").join("|");
  React.useEffect(() => {
    if (!fallbackKeys) return;
    let cancelled = false;
    void signAll(fallbackKeys.split("|"))
      .then((urls) => {
        if (!cancelled) setFallbackPosters(urls);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fallbackKeys]);

  const inFlight = React.useMemo(() => {
    if (!state.clipsEnabled) return [];
    if (state.inFlightSupported || !fallback) return state.inFlight;
    return toBuilding(fallback, fallbackPosters);
  }, [state.clipsEnabled, state.inFlightSupported, state.inFlight, fallback, fallbackPosters]);

  return {
    items: state.items,
    inFlight,
    clipsEnabled: state.clipsEnabled,
    loading: !state.loaded && (pending || (!!athleteId && error === null)),
    error,
    hasMore: state.cursor !== null,
    loadingMore,
    cursor: state.cursor,
    loadMore,
    refetch,
    markSeenLocally,
  };
}

/** Sign-out, and tests: forget every lane, poster and local seen mark. */
export function resetReelLanes(): void {
  lanes.clear();
  posters.clear();
  locallySeen.clear();
}
