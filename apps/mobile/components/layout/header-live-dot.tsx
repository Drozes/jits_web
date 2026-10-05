import * as React from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { useIsArenaDisplayLive } from "@/lib/arena/arena-store";
import { useLivePulseStyle } from "@/lib/arena/arena-tempo";

export const HEADER_LIVE_DOT_TEST_ID = "header-live-dot";
/** The dot itself: a small green mark that breathes on the shared clock. */
export const HEADER_LIVE_DOT_MARK_TEST_ID = "header-live-dot-mark";

/**
 * Pushed screens' live indicator (decision Q1): a small green dot, only
 * while the athlete is live, and nothing to tap. The tab roots carry the
 * interactive `HeaderStatusChip` instead.
 *
 * Motion Rule (Adding Flare): it breathes on the ONE shared Arena tempo clock
 * (`lib/arena/arena-tempo.ts`), in phase with the chip's dot and every other
 * live dot, so there is still one pulse rhythm in the app (the reason the
 * dot used to be static). Static under Reduce Motion, paused in background.
 *
 * Reads the app-wide store, so it works in any header without a Provider and
 * reads "not live" outside the signed-in app (auth screens, profile setup).
 */
export function HeaderLiveDot() {
  const isLive = useIsArenaDisplayLive();
  if (!isLive) return null;
  return <LiveMark />;
}

/** Mounted only while live, so the clock is held only then. */
function LiveMark() {
  const pulse = useLivePulseStyle();
  return (
    <View
      testID={HEADER_LIVE_DOT_TEST_ID}
      accessible
      accessibilityLabel="You are live in the Arena"
      className="h-8 w-4 items-center justify-center"
    >
      <Animated.View
        testID={HEADER_LIVE_DOT_MARK_TEST_ID}
        className="rounded-full bg-positive"
        style={[{ width: 7, height: 7 }, pulse]}
      />
    </View>
  );
}
