import * as React from "react";
import { View } from "react-native";
import { useIsArenaLive } from "@/lib/arena/arena-store";

export const HEADER_LIVE_DOT_TEST_ID = "header-live-dot";
/** The dot itself: a plain View, never the animated `LiveDot`. */
export const HEADER_LIVE_DOT_MARK_TEST_ID = "header-live-dot-mark";

/**
 * Pushed screens' live indicator (decision Q1): a small STATIC green dot,
 * only while the athlete is live, and nothing to tap. The tab roots carry the
 * interactive `HeaderStatusChip` instead. It does not pulse: spec 3 keeps the
 * chip's dot as the only pulse in the app (the same reason Home's Arena card
 * dropped its LIVE pill).
 *
 * Reads the app-wide store, so it works in any header without a Provider and
 * reads "not live" outside the signed-in app (auth screens, profile setup).
 */
export function HeaderLiveDot() {
  const isLive = useIsArenaLive();
  if (!isLive) return null;
  return (
    <View
      testID={HEADER_LIVE_DOT_TEST_ID}
      accessible
      accessibilityLabel="You are live in the Arena"
      className="h-8 w-4 items-center justify-center"
    >
      <View
        testID={HEADER_LIVE_DOT_MARK_TEST_ID}
        className="rounded-full bg-positive"
        style={{ width: 7, height: 7 }}
      />
    </View>
  );
}
