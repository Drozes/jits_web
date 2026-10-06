import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { darkTokens } from "@/lib/tokens";
import type { HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { canManageReel, type ReelItem } from "@/lib/highlight/reel-types";
import type { ReelPoolController } from "@/lib/highlight/reel-player-pool";
import { ViewerPage } from "./viewer-page";
import type { ReelBinding } from "./reel-binding";

export interface ReelPagerPageProps {
  item: ReelItem;
  index: number;
  height: number;
  active: boolean;
  swiped: boolean;
  showHint: boolean;
  caughtUp: boolean;
  source: HighlightShareSourceTag;
  pool: ReelPoolController;
  firstOpen: (highlightId: string) => boolean;
  onModalChange: (open: boolean) => void;
  onClose: () => void;
}

/**
 * One full-screen page of the pager: today's viewer body for that reel
 * (`ViewerPage`) on its pooled player, with the not-yours rule from the
 * lane item (`canManageReel`). Memoised: a landing re-renders only the pages
 * whose `active` / `swiped` / `showHint` changed.
 */
export const ReelPagerPage = React.memo(function ReelPagerPage(props: ReelPagerPageProps) {
  const { item, index, height, active, swiped, showHint, caughtUp, pool, firstOpen, onModalChange } = props;
  const canManage = canManageReel(item);
  const binding = React.useMemo<ReelBinding>(
    () => ({
      pool,
      index,
      active,
      canManage,
      swiped,
      prefetched: true,
      firstOpen,
      onModalChange,
      showHint,
      caughtUp,
      item,
      poster: { url: item.posterUrl, path: item.posterPath },
    }),
    [pool, index, active, canManage, swiped, firstOpen, onModalChange, showHint, caughtUp, item],
  );
  return (
    <View testID={`reel-page-${index}`} style={{ height, overflow: "hidden" }}>
      <ViewerPage id={item.highlightId} source={props.source} binding={binding} onClose={props.onClose} />
    </View>
  );
});

/** The full-height page after the last reel while the lane's next page loads (spec 8.3). */
export function ReelLoadingPage({ height }: { height: number }) {
  return (
    <View testID="reel-pager-loading" style={{ height, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={darkTokens.textTertiary} />
    </View>
  );
}
