import * as React from "react";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { deriveCardStatus, type CardPhase } from "@/lib/film-room/card-status";
import { getMatchUpload, subscribeMatchUpload } from "@/lib/video/match-upload-store";
import { noFilmHelperMatchId } from "./feed-states";

/**
 * The match whose card teaches C-L6 (`noFilmHelperMatchId`), judged by each
 * card's own status: its server phase and this phone's upload. Subscribes to
 * the upload store through a snapshot of the upload STATUS of the cards with
 * no video rows only, so a progress tick never re-renders the screen.
 */
export function useNoFilmHelperId(
  items: readonly MatchLibraryItem[],
  phases: Record<string, CardPhase | undefined>,
  carouselShowsHelper: boolean,
): string | null {
  const snapshot = React.useCallback(
    () =>
      items
        .filter((i) => i.videos.length === 0)
        .map((i) => `${i.match_id}:${getMatchUpload(i.match_id)?.status ?? ""}`)
        .join(","),
    [items],
  );
  const uploadKey = React.useSyncExternalStore(subscribeMatchUpload, snapshot, snapshot);
  return React.useMemo(
    () =>
      noFilmHelperMatchId(items, carouselShowsHelper, (m) =>
        deriveCardStatus(m, getMatchUpload(m.match_id), true, Date.now(), phases[m.match_id] ?? null),
      ),
    // uploadKey is the re-pick trigger; getMatchUpload reads the store itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, phases, carouselShowsHelper, uploadKey],
  );
}
