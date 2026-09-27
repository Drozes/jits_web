import * as React from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BROADCAST_LANDSCAPE as L, BROADCAST_SIZE } from "./broadcast-tokens";

interface LiveLandscapeLayoutProps {
  /** The HUD row items, left to right: tally, kind tag, extra. */
  hud: React.ReactNode;
  /** Opponent-ended plate (if any) above the strip, athlete bar and slab. */
  lowerThird: React.ReactNode;
  /** Pause and Hold tiles; null hides the rail (opponent ended). */
  rail: React.ReactNode | null;
  /** The no-video plate sized to the free region's width, or null. */
  renderNoVideo: (regionWidth: number) => React.ReactNode | null;
}

/**
 * Widescreen Sideline: the portrait broadcast pieces reflowed for a
 * landscape window. HUD top-left, lower-third docked bottom-left at a fixed
 * 320, controls in a right rail, the middle of the frame clear for the wide
 * shot. Positions follow the safe area (71 from each side on a notched
 * iPhone, as in the artboards).
 */
export function LiveLandscapeLayout({ hud, lowerThird, rail, renderNoVideo }: LiveLandscapeLayoutProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const left = Math.max(insets.left, 16) + L.edge;
  const right = Math.max(insets.right, 16) + L.edge;
  const bottom = Math.max(insets.bottom, L.bottom);
  // The free region between the lower-third and the rail, 16 clear of each.
  const regionLeft = left + L.lowerThird + 16;
  const regionRight = right + L.rail + 16;
  const noVideo = renderNoVideo(Math.max(0, width - regionLeft - regionRight));

  return (
    <>
      <View
        testID="live-hud"
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left,
          top: L.top,
          height: BROADCAST_SIZE.tally,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        {hud}
      </View>
      {noVideo ? (
        <View
          testID="live-no-video-region"
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: regionLeft,
            right: regionRight,
            top: L.top + BROADCAST_SIZE.tally + 12,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {noVideo}
        </View>
      ) : null}
      <View
        testID="live-lower-third"
        pointerEvents="box-none"
        style={{ position: "absolute", left, bottom, width: L.lowerThird, gap: 12 }}
      >
        {lowerThird}
      </View>
      {rail ? (
        <View
          testID="live-rail"
          pointerEvents="box-none"
          style={{ position: "absolute", right, bottom, width: L.rail, gap: 12 }}
        >
          {rail}
        </View>
      ) : null}
    </>
  );
}
