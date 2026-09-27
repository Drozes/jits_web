import * as React from "react";
import { getMatchUpload, subscribeMatchUpload, type MatchUploadEntry } from "@/lib/video/match-upload-store";

/**
 * The upload store's entry for each match id. The returned Map is STABLE: it
 * only changes identity when one of these matches' entries is replaced, so a
 * progress tick for some other match (or any unrelated store write) does not
 * re-render the caller. Posters subscribe to their own match instead
 * (`useMatchUpload`), so ticks re-render only the uploading card.
 */
export function useMatchUploads(matchIds: readonly string[]): Map<string, MatchUploadEntry> {
  const key = matchIds.join(",");
  const cache = React.useRef<{ key: string; entries: (MatchUploadEntry | null)[]; map: Map<string, MatchUploadEntry> } | null>(null);
  const getSnapshot = React.useCallback(() => {
    const ids = key ? key.split(",") : [];
    const entries = ids.map((id) => getMatchUpload(id));
    const prev = cache.current;
    if (prev && prev.key === key && prev.entries.every((e, i) => e === entries[i])) return prev.map;
    const map = new Map<string, MatchUploadEntry>();
    entries.forEach((e, i) => {
      if (e) map.set(ids[i], e);
    });
    cache.current = { key, entries, map };
    return map;
  }, [key]);
  return React.useSyncExternalStore(subscribeMatchUpload, getSnapshot, getSnapshot);
}
