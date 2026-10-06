import { router } from "expo-router";
import type { HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import type { ReelItem, ReelLaneKey } from "./reel-types";
import { clampIndex } from "./reel-pager-math";

/**
 * ENTRY API of the shorts-style swipe viewer (specs/matches-tab section 8,
 * jits-a4fw.5). Carousels open the viewer with the lane they showed:
 *
 *   openReelViewer({ items, startIndex, lane, loadMore? }): string | null
 *
 * - `items`: the lane's PLAYABLE reels in display order (`ReelItem`, from
 *   `reel-types.ts`). Building, ghost, CTA and "See all" tiles are not reels:
 *   leave them out, and pass `startIndex` as the tapped reel's index in
 *   `items` (not its tile position).
 * - `lane`: `"home"` or `"matches"`; it is also the telemetry `source`.
 * - `loadMore` (optional): resolves the lane's NEXT page (the B1 cursor lives
 *   in the caller's lane hook); `[]` means the lane is exhausted. Reels
 *   already in the pager are dropped, so overlap is harmless.
 *
 * It parks the list in an in-memory session and pushes
 * `/highlight/<id>?source=<lane>&lane=<lane>&session=<token>`; returns the
 * token (null for an empty list, nothing is pushed). A link WITHOUT a live
 * session (push, bell, match detail, summary, a cold start that restored the
 * route) opens the single-reel viewer, so no other entry point changes.
 */
export interface ReelViewerSession {
  token: string;
  lane: ReelLaneKey;
  items: ReelItem[];
  startIndex: number;
  loadMore?: () => Promise<ReelItem[]>;
}

export interface OpenReelViewerArgs {
  items: readonly ReelItem[];
  startIndex: number;
  lane: ReelLaneKey;
  loadMore?: () => Promise<ReelItem[]>;
}

/** Sessions kept for back-navigation; the oldest beyond this are forgotten. */
const MAX_SESSIONS = 5;
const sessions = new Map<string, ReelViewerSession>();
let seq = 0;

export function createReelSession({ items, startIndex, lane, loadMore }: OpenReelViewerArgs): ReelViewerSession | null {
  if (items.length === 0) return null;
  seq += 1;
  const token = `r${seq}${Date.now().toString(36)}`;
  const session: ReelViewerSession = { token, lane, items: [...items], startIndex: clampIndex(startIndex, items.length), loadMore };
  sessions.set(token, session);
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string);
  return session;
}

export function getReelSession(token: string | string[] | undefined): ReelViewerSession | null {
  const value = Array.isArray(token) ? token[0] : token;
  return value ? (sessions.get(value) ?? null) : null;
}

export function reelViewerHref(highlightId: string, lane: ReelLaneKey, token: string): string {
  return `/highlight/${encodeURIComponent(highlightId)}?source=${lane}&lane=${lane}&session=${encodeURIComponent(token)}`;
}

export function openReelViewer(args: OpenReelViewerArgs): string | null {
  const session = createReelSession(args);
  if (!session) return null;
  router.push(reelViewerHref(session.items[session.startIndex].highlightId, session.lane, session.token) as never);
  return session.token;
}

export function parseReelLane(raw: string | string[] | undefined): ReelLaneKey | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "home" || value === "matches" ? value : null;
}

/**
 * The funnel `source` of a lane. `matches` joins `HIGHLIGHT_SHARE_SOURCES`
 * with jits-a4fw.1; the server stores `detail` as free JSON either way.
 */
export function laneSource(lane: ReelLaneKey): HighlightShareSourceTag {
  return lane as HighlightShareSourceTag;
}

/** Tests only. */
export function __resetReelSessionsForTests(): void {
  sessions.clear();
}
