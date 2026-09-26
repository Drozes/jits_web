import * as React from "react";
import { Animated, Easing, Text, View } from "react-native";
import { AUTO_END_DELAY_MS } from "@/lib/video/recording-limits";
import { FINAL_SECONDS, type StripVariant } from "@/lib/match-flow/live-view-state";
import { BROADCAST, BROADCAST_RADIUS, BROADCAST_SIZE, TABULAR } from "./broadcast-tokens";

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

/** 2 px bar that empties over the auto-end delay. Restarts when it mounts. */
function DrainBar() {
  const progress = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: AUTO_END_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [progress]);
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View
      testID="timeup-drain"
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, backgroundColor: BROADCAST.track }}
    >
      <Animated.View style={{ height: 2, width, backgroundColor: BROADCAST.ink }} />
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
        style={[{ flexShrink: 1, fontSize: 12, lineHeight: 14, letterSpacing: 2.52, color: copy.leftColor }, TABULAR]}
      >
        {copy.left}
      </Text>
      {variant === "final10" ? (
        <Segments lit={Math.max(0, Math.min(FINAL_SECONDS, remaining))} />
      ) : copy.right ? (
        <Text
          className="font-mono-medium"
          numberOfLines={1}
          style={{ fontSize: 10, lineHeight: 12, letterSpacing: 1.68, color: copy.rightColor }}
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
