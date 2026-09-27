import * as React from "react";
import { getMatchUpload, subscribeMatchUpload, type MatchUploadEntry } from "@/lib/video/match-upload-store";

/**
 * The upload store's entry for each match id, re-rendering on every store
 * write (progress included) so the "UPLOADING 64%" overlay moves.
 */
export function useMatchUploads(matchIds: readonly string[]): Map<string, MatchUploadEntry> {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribeMatchUpload(bump), []);
  const map = new Map<string, MatchUploadEntry>();
  for (const id of matchIds) {
    const entry = getMatchUpload(id);
    if (entry) map.set(id, entry);
  }
  return map;
}
