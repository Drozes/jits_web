import type { MatchLibraryItem, MatchLibraryVideo } from "@jits/shared/api/film-room";

/**
 * Media selection and crop rule for the Matches feed card (specs/matches-tab
 * 6.3). Pure and deterministic: the same item always yields the same choice,
 * so a card never flickers between angles across refetches.
 */

export interface CardMedia {
  /** The video a media tap plays, or null when nothing is playable (the tap opens match detail). */
  playVideo: MatchLibraryVideo | null;
  /** The video whose poster the card shows, or null (fallback art). */
  posterVideo: MatchLibraryVideo | null;
  /** Signed poster URL of `posterVideo`, or null. */
  posterUrl: string | null;
  /** Poster dimensions when the server knows them (feed `cropFor`). */
  posterWidth: number | null;
  posterHeight: number | null;
  /** Length of the play target, only when it is playable (never a duration for an angle that is not ready). */
  durationSeconds: number | null;
}

/**
 * Candidate order: the elected primary (B3 `is_primary`; absent means false),
 * then the viewer's own videos, then the rest in list order. The library
 * already lists the viewer's own first and keeps the server order
 * (`created_at, id`) for everyone else, so "first in list order" is the
 * server order for the third tier.
 */
function candidates(videos: readonly MatchLibraryVideo[], viewerId: string | null): MatchLibraryVideo[] {
  const primary = videos.filter((v) => v.is_primary === true);
  const own = viewerId ? videos.filter((v) => v.uploaded_by === viewerId) : [];
  return [...new Set([...primary, ...own, ...videos])];
}

/**
 * Play target: the primary when playable, else the viewer's own playable
 * video, else the first playable one. Poster: the play target's poster when
 * it has one, else the first video (same order, ignoring playability) with a
 * poster, else none.
 */
export function pickCardMedia(item: Pick<MatchLibraryItem, "videos">, viewerId: string | null): CardMedia {
  const ordered = candidates(item.videos ?? [], viewerId);
  const playVideo = ordered.find((v) => v.playability === "playable") ?? null;
  const posterVideo = playVideo?.poster_url ? playVideo : (ordered.find((v) => !!v.poster_url) ?? null);
  return {
    playVideo,
    posterVideo,
    posterUrl: posterVideo?.poster_url ?? null,
    posterWidth: posterVideo?.thumbnail_width ?? null,
    posterHeight: posterVideo?.thumbnail_height ?? null,
    durationSeconds: playVideo?.duration_seconds ?? null,
  };
}

/** How the 16:9 media area draws a poster. */
export type CropFit = "cover" | "pillarbox";

export interface CropRule {
  /**
   * `cover`: centred cover (landscape or square). `pillarbox`: the image with
   * `contentFit="contain"` in front of the same image as a blurred cover
   * (`PILLARBOX_BLUR_RADIUS`) under a `void` scrim (`PILLARBOX_SCRIM_OPACITY`).
   */
  fit: CropFit;
  /**
   * False when the size is unknown: draw `cover` until expo-image's `onLoad`
   * reports the intrinsic size, then call `cropFor` again with it.
   */
  known: boolean;
}

export const PILLARBOX_BLUR_RADIUS = 24;
export const PILLARBOX_SCRIM_OPACITY = 0.4;

function dimension(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Portrait (`width / height < 1`) pillarboxes; landscape and square cover; unknown covers until loaded. */
export function cropFor(width: number | null | undefined, height: number | null | undefined): CropRule {
  const w = dimension(width);
  const h = dimension(height);
  if (w == null || h == null) return { fit: "cover", known: false };
  return { fit: w / h < 1 ? "pillarbox" : "cover", known: true };
}
