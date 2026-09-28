import * as React from "react";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { useMatchUpload } from "@/lib/video/match-upload-store";
import { deriveCardStatus } from "@/lib/film-room/card-status";
import { PosterCard } from "./poster-card";
import type { StillAthlete } from "./opening-still";

interface LibraryPosterProps {
  item: MatchLibraryItem;
  viewer: StillAthlete;
  /** Opened on this device (or the seen set is not read yet). */
  seen: boolean;
  onOpen: (matchId: string) => void;
  variant?: "grid" | "compact";
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * A poster wired to its own match's upload entry. Each card subscribes for
 * itself, so an upload progress tick re-renders only the uploading card, and
 * memo keeps every other card still (pass a memoized `viewer` and a stable
 * `onOpen`).
 */
export const LibraryPoster = React.memo(function LibraryPoster({ item, viewer, seen, onOpen, variant, testID, accessibilityLabel }: LibraryPosterProps) {
  const upload = useMatchUpload(item.match_id);
  const status = React.useMemo(() => deriveCardStatus(item, upload, seen), [item, upload, seen]);
  const onPress = React.useCallback(() => onOpen(item.match_id), [onOpen, item.match_id]);
  return (
    <PosterCard
      item={item}
      status={status}
      viewer={viewer}
      onPress={onPress}
      variant={variant}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    />
  );
});
