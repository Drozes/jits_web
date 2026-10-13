import type { HighlightDetail } from "@jits/shared/api/highlight-share";
import { shortDate } from "@/lib/film-room/format";
import { matchDetailHref } from "@/lib/match-detail/href";
import { reelSecondaryAction, type ReelItem } from "./reel-types";

/** The bottom-left meta of a full-screen reel page (spec 8.2, 8.6). */
export interface ReelMetaInfo {
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

/** A lane item (pager). */
export function metaFromItem(item: ReelItem): ReelMetaInfo {
  return {
    dateIso: item.readyAt,
    matchId: item.matchId,
    secondary: reelSecondaryAction(item),
    subjectAthleteId: item.subjectAthleteId ?? null,
  };
}

/** The single-reel viewer: always the athlete's own reel, so always Open match. */
export function metaFromDetail(detail: HighlightDetail): ReelMetaInfo {
  return {
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
 * A page's meta: the detail read (match date) plus, in the pager, the lane
 * item's ownership-driven secondary action.
 */
export function pageMeta(detail: HighlightDetail, item?: ReelItem | null): ReelMetaInfo {
  const fromDetail = metaFromDetail(detail);
  if (!item) return fromDetail;
  const fromItem = metaFromItem(item);
  return {
    ...fromDetail,
    secondary: fromItem.secondary,
    subjectAthleteId: fromItem.subjectAthleteId,
  };
}
