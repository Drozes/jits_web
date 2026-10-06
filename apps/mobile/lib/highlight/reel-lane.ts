import type { InFlightReel, MyHighlights } from "@jits/shared/api/highlight-share";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import type { CardPhase } from "@/lib/film-room/card-status";
import type { ReelItem, ReelLaneKey } from "./reel-types";

/**
 * Pure rules behind the reel carousels (specs/matches-tab sections 5, 7.2,
 * 10.2 to 10.5, 12.3): page cursors, lane ordering, and the tile list a
 * `ReelCarousel` draws (building, ready, ghost, cta, see_all, skeleton).
 * `useReelLane` feeds it; the carousel and the viewer consume its output.
 */

/** First and later pages of `get_my_highlights` (spec 5: limit 10). */
export const REEL_LANE_PAGE_SIZE = 10;
/** Home shows at most this many ready tiles, then `see_all` (spec 7.2). */
export const HOME_LANE_MAX_READY = 10;
/** Skeleton tiles while the first read is in flight (spec 6.4, 10.4). */
export const LANE_SKELETON_COUNT: Record<ReelLaneKey, number> = { home: 3, matches: 4 };

/** A building tile: an in-flight reel with its signed poster. */
export interface BuildingReel extends InFlightReel {
  posterUrl: string | null;
  /**
   * Device time (ms) the read carrying `serverNow` resolved: the baseline of
   * the C-B3 server-clock countdown. Absent for the Matches fallback (whose
   * `serverNow` is the device clock already).
   */
  receivedAt?: number;
}

/**
 * Which ghost a tile is (copy ids from spec 11):
 * - `first_highlight`: C-Z2 "Your first highlight lands here" (zero matches).
 * - `next_highlight`: C-L5 "Record your next match to get a highlight" (matches but no reel, or a short shelf).
 * Faint ghosts are the two fading placeholders after the first on Matches.
 */
export type GhostVariant = "first_highlight" | "next_highlight";
/** Which CTA tile (Home only): C-HZ1 "Get your first highlight" or C-L2 "Find a match"; both switch to the Arena tab. */
export type CtaVariant = "first_highlight" | "find_match";

export type ReelTileModel =
  | { kind: "ready"; key: string; item: ReelItem }
  | { kind: "building"; key: string; reel: BuildingReel }
  | { kind: "ghost"; key: string; variant: GhostVariant; faint: boolean }
  | { kind: "cta"; key: string; variant: CtaVariant; action: "arena" }
  | { kind: "see_all"; key: string }
  | { kind: "skeleton"; key: string };

export type ReelTileKind = ReelTileModel["kind"];

/** Spec 11 strings for the ghost and CTA tiles (sentence case; no em dashes). */
export const REEL_LANE_COPY = {
  ghost: {
    first_highlight: "Your first highlight lands here",
    next_highlight: "Record your next match to get a highlight",
  } satisfies Record<GhostVariant, string>,
  /** C-L6, under the C-L5 ghost on the Matches carousel. */
  recordingHelper: "Turn on Record from my phone at face-off.",
  cta: {
    first_highlight: "Get your first highlight",
    find_match: "Find a match",
  } satisfies Record<CtaVariant, string>,
  seeAll: "See all",
  /** Carousel titles: Matches C-M2, Home C-HM3 (round 2). */
  title: { matches: "Your highlights", home: "Highlights" } satisfies Record<ReelLaneKey, string>,
} as const;

// ---- cursors ----------------------------------------------------------------

/** Where the next page starts. Both strings go back VERBATIM (microsecond precision; never round-trip through Date). */
export interface ReelCursor {
  before: string;
  beforeId: string | null;
}

/**
 * The cursor after `page`, or null when there is no further page. A B1
 * backend sends `next_before` / `next_before_id` (null on the last page). An
 * older backend sends neither: a full page then falls back to the last item's
 * `readyAt` alone (time-only, so reels sharing that instant may be skipped:
 * the degrade the backend change exists to fix).
 */
export function nextReelCursor(
  page: Pick<MyHighlights, "nextBefore" | "nextBeforeId"> & { items: readonly { readyAt: string }[] },
  limit: number,
): ReelCursor | null {
  if (page.nextBefore) return { before: page.nextBefore, beforeId: page.nextBeforeId };
  if (page.items.length < limit || page.items.length === 0) return null;
  // A full page with no cursor keys: an older backend.
  return { before: page.items[page.items.length - 1].readyAt, beforeId: null };
}

// ---- ordering -----------------------------------------------------------------

/** Unseen first, then seen, each keeping the server's newest-first order (stable). */
export function unseenFirst(items: readonly ReelItem[]): ReelItem[] {
  return [...items.filter((i) => i.unseen), ...items.filter((i) => !i.unseen)];
}

/**
 * Appends a later page: de-duplicated by `highlightId` (the first copy wins)
 * and ordered unseen-first WITHIN the new page only, so tiles already on
 * screen (and the viewer's page indices) never move when a page lands.
 */
export function appendReelPage(current: readonly ReelItem[], page: readonly ReelItem[]): ReelItem[] {
  const ids = new Set(current.map((i) => i.highlightId));
  const fresh: ReelItem[] = [];
  for (const item of page) {
    if (ids.has(item.highlightId)) continue;
    ids.add(item.highlightId);
    fresh.push(item);
  }
  return [...current, ...unseenFirst(fresh)];
}

/** Same reel, same content: the previous object is reused so memoised tiles skip a render. */
function sameReel(a: ReelItem, b: ReelItem): boolean {
  return (
    a.highlightId === b.highlightId &&
    a.version === b.version &&
    a.unseen === b.unseen &&
    a.posterUrl === b.posterUrl &&
    a.opponentName === b.opponentName &&
    a.durationS === b.durationS
  );
}

/** Returns `next` with every unchanged reel replaced by its previous object (stable identities). */
export function reuseReels(prev: readonly ReelItem[], next: readonly ReelItem[]): ReelItem[] {
  if (prev.length === 0) return [...next];
  const byId = new Map(prev.map((i) => [i.highlightId, i]));
  return next.map((i) => {
    const old = byId.get(i.highlightId);
    return old && sameReel(old, i) ? old : i;
  });
}

export interface FirstPageMerge {
  items: ReelItem[];
  /** True when the previously loaded tail (and so the previous cursor) was kept. */
  keptTail: boolean;
}

/**
 * A refetch of the first page (owner decision 2026-10-06: ordering is STABLE
 * across refetches).
 *
 * - Nothing on screen yet: the first page, unseen first (the only time
 *   unseen-first reorders existing reels).
 * - Otherwise reels already on screen keep their relative order (with the
 *   fresh data: a watched reel loses its ring but does not move), and newly
 *   arrived reels enter at the front, unseen first among themselves.
 * - On-screen reels missing from the new first page: when the page is full
 *   AND its last item (the anchor, server order) is already on screen, they
 *   stay in place (the on-screen list is not in server order, so position
 *   cannot tell older from newer), except one strictly newer than the anchor
 *   (both instants parse), which should have been in the page and is gone
 *   (deleted or superseded). `keptTail` is true only when at least one was
 *   kept; the caller then keeps the old cursor. Otherwise (a last page, or an
 *   anchor not on screen) they are dropped and the caller uses the new first
 *   cursor.
 */
export function mergeFirstPage(current: readonly ReelItem[], firstPage: readonly ReelItem[], firstPageHasMore: boolean): FirstPageMerge {
  const page = dedupe(firstPage);
  if (current.length === 0) return { items: unseenFirst(page), keptTail: false };
  const pageById = new Map(page.map((i) => [i.highlightId, i]));
  const currentIds = new Set(current.map((i) => i.highlightId));
  const fresh = unseenFirst(page.filter((i) => !currentIds.has(i.highlightId)));
  const anchor = page.length > 0 ? page[page.length - 1] : null;
  // The on-screen list is not in server order (an unseen-first first load,
  // new reels at the front), so "older than the anchor" cannot be read off
  // positions or (reliably) timestamps. When the new first page is full and
  // its last reel is already on screen, every on-screen reel missing from it
  // stays, in place: none can be lost past the old cursor. When the first
  // page is the last page, reels missing from it are gone (deletions clear).
  const anchorOnScreen = firstPageHasMore && anchor !== null && current.some((i) => i.highlightId === anchor.highlightId);
  const anchorAt = anchor ? Date.parse(anchor.readyAt) : NaN;
  /**
   * A missing on-screen reel is gone (dropped) only when it is strictly newer
   * than the anchor, so it should have been in the page (deleted, or
   * superseded by a re-render). Matching on the match id would be wrong: with
   * the multi-angle gate off one match legally has a reel per angle. Time
   * only ever drops, never keeps: unparseable or equal instants keep the
   * reel, so no gap can come back.
   */
  const isGone = (old: ReelItem): boolean => {
    const oldAt = Date.parse(old.readyAt);
    return Number.isFinite(oldAt) && Number.isFinite(anchorAt) && oldAt > anchorAt;
  };
  const kept: ReelItem[] = [];
  let tailKept = false;
  for (const old of current) {
    const updated = pageById.get(old.highlightId);
    if (updated) kept.push(updated);
    else if (anchorOnScreen && !isGone(old)) {
      kept.push(old);
      tailKept = true;
    }
  }
  // True only when tail reels were actually kept: the caller then keeps the old (deeper) cursor.
  return { items: [...fresh, ...kept], keptTail: tailKept };
}

function dedupe(items: readonly ReelItem[]): ReelItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.highlightId) ? false : (seen.add(i.highlightId), true)));
}

/** A building tile is dropped when a ready reel of the same match is already in the lane. */
export function visibleBuilding<T extends Pick<InFlightReel, "matchId">>(inFlight: readonly T[], items: readonly ReelItem[]): T[] {
  const ready = new Set(items.map((i) => i.matchId));
  const seen = new Set<string>();
  return inFlight.filter((r) => {
    if (ready.has(r.matchId) || seen.has(r.matchId)) return false;
    seen.add(r.matchId);
    return true;
  });
}

/**
 * Reels that just landed: a match that showed a building tile last time
 * (`visibleBuilding(prevBuilding, prevItems)`) and now has a ready reel that
 * was not already ready. A building tile that was hidden because its reel
 * was already ready (a lagging phase read) never "lands" again. The host
 * plays the reveal for these (cross-fade, one ring pulse, a success haptic;
 * spec 10.5).
 */
export function landedReels(
  prevBuilding: readonly Pick<InFlightReel, "matchId">[],
  prevItems: readonly ReelItem[],
  items: readonly ReelItem[],
): ReelItem[] {
  const shown = new Set(visibleBuilding(prevBuilding, prevItems).map((r) => r.matchId));
  const wasReady = new Set(prevItems.map((i) => i.highlightId));
  return items.filter((i) => shown.has(i.matchId) && !wasReady.has(i.highlightId));
}

// ---- Matches fallback without B2 (spec 12.3) -----------------------------------

/** How many of the newest library items the fallback inspects (the phases cache covers six). */
export const FALLBACK_BUILDING_MAX_MATCHES = 6;
const FINAL_OWN_REEL: ReadonlySet<string> = new Set(["ready", "none", "failed", "none_dominant_fallback"]);

/**
 * Building tiles from library phases when the backend has no `in_flight`
 * (Matches tab only). For each of the newest six items whose phase is
 * `building` or `waiting_for_angle` and whose own reel is not final:
 * `waiting_for_angle` maps to `waiting` (with a device-clock deadline),
 * `building` to `rendering`. The poster key is the first video's
 * `thumbnail_key` (the library's own order).
 */
export function fallbackInFlight(
  items: readonly MatchLibraryItem[],
  phases: Readonly<Record<string, CardPhase | undefined>>,
  now: number,
): InFlightReel[] {
  const out: InFlightReel[] = [];
  for (const item of items.slice(0, FALLBACK_BUILDING_MAX_MATCHES)) {
    const p = phases[item.match_id];
    if (!p || (p.phase !== "building" && p.phase !== "waiting_for_angle")) continue;
    if (p.ownReel && FINAL_OWN_REEL.has(p.ownReel)) continue;
    const waiting = p.phase === "waiting_for_angle";
    const video = item.videos.find((v) => !!v.thumbnail_key) ?? item.videos[0] ?? null;
    out.push({
      matchId: item.match_id,
      matchVideoId: item.videos[0]?.video_id ?? null,
      highlightId: null,
      reelState: waiting ? "waiting" : "rendering",
      step: waiting ? 1 : 2,
      waitDeadlineAt:
        waiting && p.waitRemainingMs != null ? new Date(now + Math.max(0, p.waitRemainingMs)).toISOString() : null,
      serverNow: new Date(now).toISOString(),
      opponentName: item.opponent?.display_name ?? null,
      playedAt: item.completed_at,
      posterPath: video?.thumbnail_key ?? null,
    });
  }
  return out;
}

// ---- the tile list ------------------------------------------------------------

export interface LaneTileInputs {
  laneKey: ReelLaneKey;
  /** Ordered ready items (the hook's `items`). */
  items: readonly ReelItem[];
  building: readonly BuildingReel[];
  clipsEnabled: boolean;
  /** True while the first read is in flight with nothing to show. */
  loading: boolean;
  /** True when the read failed with nothing to show. */
  failed?: boolean;
  /** More ready reels exist past `items` (Home's `see_all`). */
  hasMore: boolean;
  /**
   * The athlete's completed match count, when known (zero picks the
   * first-highlight copy). Null or undefined reads as "has matches".
   */
  matchCount?: number | null;
}

function ghost(variant: GhostVariant, i: number, faint: boolean): ReelTileModel {
  return { kind: "ghost", key: `ghost:${variant}:${i}`, variant, faint };
}

/**
 * The carousel's tiles (spec 5, 7.2, 10.2 to 10.5, 10.7):
 * - clips off, or a failed read with nothing cached: no tiles (the carousel is hidden).
 * - first read in flight: skeletons (3 on Home, 4 on Matches).
 * - building tiles first, then the ready reels in lane order.
 * - Home: at most 10 ready tiles, then `see_all` when more exist.
 * - no reels and nothing building: Home shows a CTA tile then one ghost; Matches one ghost then two faint ghosts.
 * - 1 to 2 ready reels: one C-L5 ghost appended (owner Q7). 3 or more: none.
 */
export function buildLaneTiles(input: LaneTileInputs): ReelTileModel[] {
  const { laneKey, items, building, clipsEnabled, loading, failed, hasMore } = input;
  if (!clipsEnabled && !loading) return [];
  if (loading && items.length === 0 && building.length === 0) {
    return Array.from({ length: LANE_SKELETON_COUNT[laneKey] }, (_, i) => ({ kind: "skeleton" as const, key: `skeleton:${i}` }));
  }
  if (!clipsEnabled) return [];
  if (failed && items.length === 0 && building.length === 0) return [];

  const tiles: ReelTileModel[] = visibleBuilding(building, items).map((reel) => ({
    kind: "building" as const,
    key: `building:${reel.matchId}`,
    reel,
  }));
  const ready = laneKey === "home" ? items.slice(0, HOME_LANE_MAX_READY) : items;
  for (const item of ready) tiles.push({ kind: "ready", key: `ready:${item.highlightId}`, item });

  const noMatches = input.matchCount === 0;
  if (items.length === 0 && tiles.length === 0) {
    if (laneKey === "home") {
      return noMatches
        ? [{ kind: "cta", key: "cta:first_highlight", variant: "first_highlight", action: "arena" }, ghost("first_highlight", 0, false)]
        : [{ kind: "cta", key: "cta:find_match", variant: "find_match", action: "arena" }, ghost("next_highlight", 0, false)];
    }
    const v: GhostVariant = noMatches ? "first_highlight" : "next_highlight";
    return [ghost(v, 0, false), ghost(v, 1, true), ghost(v, 2, true)];
  }

  if (laneKey === "home" && (hasMore || items.length > HOME_LANE_MAX_READY)) {
    tiles.push({ kind: "see_all", key: "see_all" });
  } else if (items.length >= 1 && items.length <= 2 && !hasMore) {
    tiles.push(ghost("next_highlight", 0, false));
  }
  return tiles;
}

/** The pages a viewer opened from this lane can swipe through: ready items only, in tile order. */
export function pagerItems(tiles: readonly ReelTileModel[]): ReelItem[] {
  return tiles.flatMap((t) => (t.kind === "ready" ? [t.item] : []));
}

// ---- once-per-session pulse (spec 7.2) ---------------------------------------------

const pulsed = new Set<string>();

/**
 * True the first time a reel asks in this JS session, false after: the first
 * unseen tile pulses once per session (`moment.reelRingPulse`), never on a
 * refetch. Reduce Motion is the caller's check.
 */
export function claimSessionPulse(highlightId: string): boolean {
  if (pulsed.has(highlightId)) return false;
  pulsed.add(highlightId);
  return true;
}

/** Test-only. */
export function __resetSessionPulses(): void {
  pulsed.clear();
}
