import type { HighlightDetail } from "@jits/shared/api/highlight-share";
import { shortDate } from "@/lib/film-room/format";
import type { ReelItem } from "./reel-types";

/**
 * The bottom-left meta of a full-screen reel page (spec 8.2): the date and the
 * reel subject's Instagram handle. Owner decision 2026-10-14: the viewer has
 * no Open match / View profile action; the `@handle` line replaced it.
 */
export interface ReelMetaInfo {
  dateIso: string | null;
  /** The subject's stored handle (no @), or null when unset or unknown. */
  instagramHandle: string | null;
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

function cleanHandle(handle: string | null | undefined): string | null {
  const h = handle?.trim();
  return h ? h : null;
}

/**
 * A page's meta: the detail read (match date) plus the subject's handle. The
 * single-reel viewer (no lane item) and an own lane item are the signed-in
 * athlete's reel, so they take `viewerHandle` (their live profile); a non-own
 * lane item carries its own `subjectInstagramHandle`.
 */
export function pageMeta(detail: HighlightDetail, item?: ReelItem | null, viewerHandle?: string | null): ReelMetaInfo {
  const own = !item || item.isOwn;
  return {
    dateIso: detail.caption?.playedAt ?? null,
    instagramHandle: cleanHandle(own ? viewerHandle : item.subjectInstagramHandle),
  };
}
