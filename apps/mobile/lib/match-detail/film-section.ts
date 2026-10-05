import type { MatchUploadEntry } from "@/lib/video/match-upload-store";

/**
 * What the match page's film section shows, from this phone's upload entry
 * and the server's video rows (jits-n2im.4 item 1).
 *
 *   upload  this phone's upload status card (uploading, paused, failed, or
 *           landed and waiting for the refetch): shown whenever a local job
 *           exists, alongside any server film
 *   films   the Watch rows, when the server has any video
 *   noVideo "No video was recorded", ONLY when neither exists. It used to
 *           show for the whole upload, under a hero saying UPLOADING.
 */
export interface FilmSection {
  upload: boolean;
  films: boolean;
  noVideo: boolean;
}

export function deriveFilmSection(local: MatchUploadEntry | null, serverVideoCount: number): FilmSection {
  const films = serverVideoCount > 0;
  // "uploaded" with no server row yet: the refetch is on its way, and the
  // card saying "Match video uploaded" is the truth until it lands. Once
  // the row is on screen the Watch row says it instead.
  const upload =
    local != null &&
    (local.status === "uploading" ||
      local.status === "pending" ||
      local.status === "paused" ||
      local.status === "error" ||
      (local.status === "uploaded" && !films));
  return { upload, films, noVideo: !films && !upload };
}
