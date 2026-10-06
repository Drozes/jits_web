import type { HighlightDetail } from "@jits/shared/api/highlight-share";
import { shortDate } from "@/lib/film-room/format";
import { matchDetailHref } from "@/lib/match-detail/href";
import { reelSecondaryAction, type ReelItem } from "./reel-types";

/** The bottom-left meta of a full-screen reel page (spec 8.2, 8.6). */
export interface ReelMetaInfo {
  /** `vs {opp}` for an own reel, the subject's name otherwise; null when unknown. */
  title: string | null;
  dateIso: string | null;
  matchId: string;
  secondary: "open_match" | "view_profile" | null;
  subjectAthleteId: string | null;
}

/** "0:28": whole seconds, minutes unpadded. */
export function reelDuration(seconds: number | null | undefined): string {
  const total = seconds != null && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The mono line: `OCT 04 · 0:28` (the date drops out when unknown). */
export function reelMetaLine(dateIso: string | null, durationS: number | null | undefined): string {
  const date = shortDate(dateIso);
  return date ? `${date} · ${reelDuration(durationS)}` : reelDuration(durationS);
}

function vs(name: string | null | undefined): string | null {
  const n = name?.trim();
  return n ? `vs ${n}` : null;
}

/** A lane item (pager). A non-own item's `opponentName` carries the caption name of its subject. */
export function metaFromItem(item: ReelItem): ReelMetaInfo {
  return {
    title: item.isOwn ? vs(item.opponentName) : item.opponentName?.trim() || null,
    dateIso: item.readyAt,
    matchId: item.matchId,
    secondary: reelSecondaryAction(item),
    subjectAthleteId: item.subjectAthleteId ?? null,
  };
}

/** The single-reel viewer: always the athlete's own reel, so always Open match. */
export function metaFromDetail(detail: HighlightDetail): ReelMetaInfo {
  return {
    title: vs(detail.caption?.opponentName),
    dateIso: detail.caption?.playedAt ?? null,
    matchId: detail.matchId,
    secondary: "open_match",
    subjectAthleteId: null,
  };
}

export function secondaryHref(meta: ReelMetaInfo): string | null {
  if (meta.secondary === "open_match") return matchDetailHref(meta.matchId);
  if (meta.secondary === "view_profile" && meta.subjectAthleteId) return `/(app)/athlete/${encodeURIComponent(meta.subjectAthleteId)}`;
  return null;
}

/**
 * A page's meta: the detail read (match date, opponent) plus, in the pager,
 * the lane item's ownership-driven parts (title rule, secondary action).
 */
export function pageMeta(detail: HighlightDetail, item?: ReelItem | null): ReelMetaInfo {
  const fromDetail = metaFromDetail(detail);
  if (!item) return fromDetail;
  const fromItem = metaFromItem(item);
  return {
    ...fromDetail,
    title: item.isOwn ? (fromDetail.title ?? fromItem.title) : fromItem.title,
    secondary: fromItem.secondary,
    subjectAthleteId: fromItem.subjectAthleteId,
  };
}
