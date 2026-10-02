import * as React from "react";
import { Text, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { easing } from "@/lib/motion";
import { AUTO_END_DELAY_MS } from "@/lib/video/recording-limits";
import { FINAL_SECONDS, type StripVariant } from "@/lib/match-flow/live-view-state";
import { BROADCAST, BROADCAST_RADIUS, BROADCAST_SIZE, TABULAR } from "./broadcast-tokens";
import { TRACKING, typeStep } from "@/lib/typography";

interface StripCopy {
  left: string;
  right: string | null;
  background: string;
  leftColor: string;
  /** Unset when `right` is null (final 10 shows segments instead). */
  rightColor?: string;
}

/** The strip's words per variant; also what screen readers hear on a change. */
export const STRIP_COPY: Record<StripVariant, StripCopy> = {
  paused: {
    left: "PAUSED",
    right: "CAMERA STILL RECORDING",
    background: BROADCAST.amber,
    leftColor: BROADCAST.ink,
    rightColor: BROADCAST.ink,
  },
  final10: {
    left: "FINAL 10 SECONDS",
    right: null,
    background: BROADCAST.slab,
    leftColor: BROADCAST.amber,
  },
  timeup: {
    left: "TIME",
    right: "ENDING MATCH",
    background: BROADCAST.amber,
    leftColor: BROADCAST.ink,
    rightColor: BROADCAST.ink,
  },
  hold: {
    left: "RELEASE TO CANCEL",
    right: "ENDING MATCH",
    background: BROADCAST.slab,
    leftColor: BROADCAST.white,
    rightColor: BROADCAST.dim62,
  },
  starting: {
    left: "CAMERA STARTING",
    right: "CLOCK IS RUNNING",
    background: BROADCAST.slab,
    leftColor: BROADCAST.white,
    rightColor: BROADCAST.dim62,
  },
};

/** Ten segments, one per final second; `lit` of them are on. Steps, never tweens. */
function Segments({ lit }: { lit: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {Array.from({ length: FINAL_SECONDS }).map((_, i) => (
        <View
          key={i}
          testID={i < lit ? "final10-segment-lit" : "final10-segment"}
          style={{
            width: 10,
            height: 8,
            borderRadius: 1,
            backgroundColor: i < lit ? BROADCAST.amber : BROADCAST.amberSpent,
          }}
        />
      ))}
    </View>
  );
}

/**
 * Time-up drain bar (Motion Rule registry): a 2 px bar that empties over the
 * auto-end delay, linear, on the UI thread (a shared value drives `scaleX`
 * from the left edge; no width animation). Restarts when it mounts. It is a
 * timer readout, so it is unchanged under Reduce Motion; the auto-end itself
 * is timed by the parent, never by this bar.
 */
function DrainBar() {
  const progress = useSharedValue(1);
  React.useEffect(() => {
    progress.value = withTiming(0, { duration: AUTO_END_DELAY_MS, easing: easing.linear });
    return () => cancelAnimation(progress);
  }, [progress]);
  const drainStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  return (
    <View
      testID="timeup-drain"
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, backgroundColor: BROADCAST.track }}
    >
      <Animated.View
        testID="timeup-drain-fill"
        style={[{ height: 2, width: "100%", backgroundColor: BROADCAST.ink, transformOrigin: "left" }, drainStyle]}
      />
    </View>
  );
}

/**
 * The one place the live state is spelled out, attached to the top of the
 * athlete bar. Screen reader announcements are made by the parent, once per
 * variant change; this is also an Android polite live region.
 */
export function StateStrip({ variant, remaining }: { variant: StripVariant; remaining: number }) {
  const copy = STRIP_COPY[variant];
  return (
    <View
      testID={`live-strip-${variant}`}
      accessibilityLiveRegion="polite"
      style={{
        height: BROADCAST_SIZE.strip,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderTopLeftRadius: BROADCAST_RADIUS.plate,
        borderTopRightRadius: BROADCAST_RADIUS.plate,
        overflow: "hidden",
        backgroundColor: copy.background,
        borderBottomWidth: variant === "final10" ? 1 : 0,
        borderBottomColor: BROADCAST.amberRule,
      }}
    >
      <Text
        className="font-mono-bold"
        numberOfLines={1}
        style={[typeStep("small"), { flexShrink: 1, lineHeight: 14, letterSpacing: TRACKING["caps-xl"], color: copy.leftColor }, TABULAR]}
      >
        {copy.left}
      </Text>
      {variant === "final10" ? (
        <Segments lit={Math.max(0, Math.min(FINAL_SECONDS, remaining))} />
      ) : copy.right ? (
        <Text
          className="font-mono-medium"
          numberOfLines={1}
          style={[typeStep("micro"), { lineHeight: 12, letterSpacing: TRACKING["caps-l"], color: copy.rightColor }, TABULAR]}
        >
          {copy.right}
        </Text>
      ) : null}
      {variant === "timeup" ? <DrainBar /> : null}
    </View>
  );
}

/** What a screen reader hears when the strip changes to `variant`. */
export function stripAnnouncement(variant: StripVariant): string {
  const copy = STRIP_COPY[variant];
  const words = copy.right ? `${copy.left}. ${copy.right}` : copy.left;
  return words.charAt(0) + words.slice(1).toLowerCase();
}
