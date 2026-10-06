import * as React from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { ON_MEDIA } from "@/lib/theme/palette";
import { ForceDarkTheme } from "@/lib/theme/force-dark-theme";
import { useReelPlayerPool } from "@/lib/highlight/use-reel-player-pool";
import { ViewerHeader } from "./viewer-header";
import { ViewerPage } from "./viewer-page";
import type { ReelBinding } from "./reel-binding";
import { useViewerClose } from "./use-viewer-close";

/** The swipe pager, reached through the viewer screen module (the share guard allows the route only this import). */
export { ReelPager } from "./reel-pager";

/**
 * The single-reel viewer (push, bell, match detail, summary, Profile, a cold
 * start: any link without a pager session). Full screen, edge to edge like
 * the pager's pages, no swipe. A video surface: the dark "void" tokens in
 * both themes (`ForceDarkTheme`, like the match video player) and a light
 * status bar. Always the athlete's own reel (`get_highlight_detail` reads
 * only the caller's), so every owner action is offered.
 */
export function ViewerScreen({ id, source }: { id: string | undefined; source: HighlightShareSourceTag }) {
  const close = useViewerClose();
  const pool = useReelPlayerPool();
  React.useEffect(() => pool.setActive(0, 1), [pool]);
  const binding = React.useMemo<ReelBinding>(
    () => ({ pool, index: 0, active: true, canManage: true, swiped: false, prefetched: false }),
    [pool],
  );
  return (
    <ForceDarkTheme style={{ backgroundColor: ON_MEDIA.black }}>
      <StatusBar style="light" />
      <View testID="highlight-viewer" className="flex-1">
        <ViewerPage id={id} source={source} binding={binding} onClose={close} />
        <ViewerHeader onClose={close} />
      </View>
    </ForceDarkTheme>
  );
}
