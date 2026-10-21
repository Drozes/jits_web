import * as React from "react";
import { AccessibilityInfo, Platform, Text, View } from "react-native";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import { clockRunnerName } from "@/lib/match-flow/clock-runner-name";
import { TRACKING, typeStep } from "@/lib/typography";
import { BROADCAST, BROADCAST_RADIUS, TABULAR } from "./broadcast-tokens";

export interface TimekeeperOfflineBannerProps {
  /** The seated timekeeper's short name (`J. Cruz`); a blank one prints the role (`clockRunnerName`). */
  name: string;
  /**
   * The TK-D9 `NO CONTEST IN {m:ss}` countdown, at the banner's right: M3's
   * timeout chip (`faceoff/timeout-chip.tsx`), rendered read-only. Absent
   * before the start, where the face-off's own chip already counts down: the
   * athlete face-off mounts this banner from `stepSeams(...).faceoff`
   * (`timekeeperOfflineName`) without a chip (spec 4.3, slice M3).
   */
  chip?: React.ReactNode;
}

/**
 * The athletes' banner while their timekeeper is offline (TK-D7, spec 4.3):
 * the server has had no heartbeat for 60 s. The clock keeps running and
 * nothing else changes; the banner clears when the timekeeper is back.
 * Attention amber on the live screen's dark plate (board P-TK-B9 frame 6).
 * An alert: VoiceOver hears it once when it appears (iOS does not speak a
 * live region), Android reads the polite live region.
 */
export function TimekeeperOfflineBanner({ name, chip }: TimekeeperOfflineBannerProps) {
  const text = TIMEKEEPER_COPY["TK-D7"](clockRunnerName(name));
  React.useEffect(() => {
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
  return (
    <View
      testID="live-timekeeper-offline"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: BROADCAST_RADIUS.plate,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: BROADCAST.amber,
        backgroundColor: BROADCAST.slab,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BROADCAST.amber }} />
        <Text
          className="font-mono-bold"
          numberOfLines={1}
          style={[typeStep("caption"), { flexShrink: 1, letterSpacing: TRACKING["caps-l"], color: BROADCAST.amber }, TABULAR]}
        >
          {text}
        </Text>
      </View>
      {chip ?? null}
    </View>
  );
}
