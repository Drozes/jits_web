import * as React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ReelPoolController } from "@/lib/highlight/reel-player-pool";
import { ReelProgressBar } from "./reel-progress-bar";

interface ReelOverlayProps {
  pool: ReelPoolController;
  index: number;
  /** Above the meta (the swipe hint, the end-of-list caption). */
  top?: React.ReactNode;
  meta: React.ReactNode;
  rail: React.ReactNode;
}

/**
 * The bottom of a full-bleed reel page, on the bottom scrim (spec 8.2): the
 * meta bottom-left with the right rail beside it (12 pt from the edge), then
 * the 2 pt progress bar right above the home indicator safe area. Every
 * wrapper passes touches through (`box-none`): only the controls take taps,
 * anything else reaches the video (tap to pause).
 */
export function ReelOverlay({ pool, index, top, meta, rail }: ReelOverlayProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="reel-overlay"
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom }}
    >
      {/* Kept clear of the rail column (its labels included): 12 pt edge + 64 pt rail + 8 pt. */}
      {top ? <View pointerEvents="box-none" className="pb-2" style={{ paddingLeft: 16, paddingRight: 84 }}>{top}</View> : null}
      <View pointerEvents="box-none" className="flex-row items-end gap-3 pb-3" style={{ paddingLeft: 16, paddingRight: 12 }}>
        <View pointerEvents="box-none" className="flex-1">{meta}</View>
        {rail}
      </View>
      <ReelProgressBar pool={pool} index={index} />
    </View>
  );
}
