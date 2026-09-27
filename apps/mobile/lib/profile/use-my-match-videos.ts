import * as React from "react";
import { getMatchUpload, subscribeMatchUpload } from "@/lib/video/match-upload-store";

/**
 * Refetch the videos list when a match's upload lands. After a match the
 * `match_videos` row is written when the upload settles, which is usually
 * AFTER the athlete is already back on Profile and the refocus refetch has
 * run, so the new video would otherwise stay missing until a manual pull.
 *
 * The upload store is keyed by match with no way to list entries, so this
 * watches the matches the screen knows about (`matchIds`, the profile
 * history, which the refocus refetch already extended with the new match).
 * Bounded: each uploaded clip (match + video id) triggers at most one
 * refetch, and one check that finds several new uploads refetches once.
 * Progress writes to the store re-run the check but never refetch again.
 */
export function useRefetchOnUploadSettled(matchIds: readonly string[], refetch: () => void): void {
  const handledRef = React.useRef(new Set<string>());
  const idsRef = React.useRef(matchIds);
  idsRef.current = matchIds;
  const refetchRef = React.useRef(refetch);
  refetchRef.current = refetch;

  const check = React.useCallback(() => {
    let fresh = false;
    for (const matchId of idsRef.current) {
      const entry = getMatchUpload(matchId);
      if (entry?.status !== "uploaded") continue;
      const key = `${matchId}:${entry.videoId ?? ""}`;
      if (handledRef.current.has(key)) continue;
      handledRef.current.add(key);
      fresh = true;
    }
    if (fresh) refetchRef.current();
  }, []);

  React.useEffect(() => subscribeMatchUpload(check), [check]);
  const idsKey = matchIds.join(",");
  React.useEffect(() => {
    check();
  }, [idsKey, check]);
}
