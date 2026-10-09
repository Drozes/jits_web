import * as React from "react";
import { View } from "react-native";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { useMatchUpload } from "@/lib/video/match-upload-store";
import { useUploadActions } from "@/lib/video/use-upload-actions";
import { cardOffersRetry, deriveCardStatus, type CardPhase } from "@/lib/film-room/card-status";
import { pickCardMedia } from "@/lib/film-room/card-media";
import { shortName } from "@/lib/film-room/format";
import type { StillAthlete } from "@/components/film-room/opening-still";
import { feedBadgeLabel, MatchFeedMedia } from "./match-feed-media";
import { MatchFeedMeta } from "./match-feed-meta";

export interface MatchFeedCardProps {
  item: MatchLibraryItem;
  /** Memoised per screen (memo skips unrelated re-renders). */
  viewer: StillAthlete;
  viewerId: string | null;
  /** Opened on this device, or the seen set is not read yet (no NEW flash). */
  seen: boolean;
  /** The server's Film status phase for a recent match (`useFilmRoomPhases`). */
  phase: CardPhase | null;
  /** FIRST MATCH / FIRST WIN; pass a stable array. */
  tags: readonly string[];
  /** This card teaches the recording helper (C-L6) under its C-L7 caption. */
  noFilmHelper: boolean;
  /** Stable. Opens match detail (the screen marks the match seen). */
  onOpen: (matchId: string) => void;
}

/**
 * One match of the Matches feed (specs/matches-tab 6.2): a full-width 16:9
 * media area over a meta row. The media shows the selected angle
 * (`pickCardMedia`: elected primary, else the viewer's own, else the first
 * playable); both the media and the meta row open match detail, never the
 * player directly (owner decision 2026-10-09). Each card subscribes to its own match's upload,
 * so a progress tick re-renders only that card.
 */
export const MatchFeedCard = React.memo(function MatchFeedCard({ item, viewer, viewerId, seen, phase, tags, noFilmHelper, onOpen }: MatchFeedCardProps) {
  const upload = useMatchUpload(item.match_id);
  const status = React.useMemo(() => deriveCardStatus(item, upload, seen, Date.now(), phase), [item, upload, seen, phase]);
  const media = React.useMemo(() => pickCardMedia(item, viewerId), [item, viewerId]);
  const { retry } = useUploadActions(item.match_id);
  const opp = shortName(item.opponent?.display_name);
  const open = React.useCallback(() => onOpen(item.match_id), [onOpen, item.match_id]);

  return (
    <View testID={`match-feed-card-${item.match_id}`} style={{ flex: 1 }}>
      <MatchFeedMedia
        item={item}
        status={status}
        media={media}
        viewer={viewer}
        opp={opp}
        helper={noFilmHelper}
        onPress={open}
        onRetry={cardOffersRetry(status) ? retry : undefined}
      />
      <MatchFeedMeta item={item} opp={opp} tags={tags} badge={feedBadgeLabel(item, status)} onPress={open} />
    </View>
  );
});
