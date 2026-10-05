import * as React from "react";
import { Pressable, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { formatClock } from "@jits/shared/utils";
import { ON_MEDIA } from "@/lib/theme/palette";
import { FRAME_S } from "@/lib/video/multi-angle/sync-controller";
import { MULTI_ANGLE_COPY } from "@/lib/video/multi-angle/copy";

/** "01:14.23": the clock with hundredths, for a frame step's spoken label. */
export function frameClock(s: number): string {
  const whole = Math.floor(Math.max(0, s));
  const cs = Math.floor((Math.max(0, s) - whole) * 100);
  return `${formatClock(whole)}.${String(cs).padStart(2, "0")}`;
}

/**
 * Back and forward one frame (about 33 ms), only while paused: the study
 * move when hunting the exact instant of a grip or a sweep. 44 pt targets;
 * each label says where it lands (research 03, 4.9).
 */
export function FrameStep({ positionS, onStep }: { positionS: number; onStep: (dir: -1 | 1) => void }) {
  const btn = (dir: -1 | 1) => {
    const Icon = dir < 0 ? ChevronLeft : ChevronRight;
    const label = `${dir < 0 ? MULTI_ANGLE_COPY.frameBack : MULTI_ANGLE_COPY.frameForward}, ${frameClock(positionS + dir * FRAME_S)}`;
    return (
      <Pressable
        testID={`frame-step-${dir < 0 ? "back" : "forward"}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onStep(dir)}
        className="items-center justify-center active:opacity-70"
        style={{ width: 44, height: 44, borderRadius: 3, borderWidth: 1, borderColor: ON_MEDIA.strong, backgroundColor: ON_MEDIA.glass }}
      >
        <Icon size={22} color={ON_MEDIA.white} />
      </Pressable>
    );
  };
  return (
    <View testID="frame-step" className="flex-row justify-center" style={{ gap: 16 }}>
      {btn(-1)}
      {btn(1)}
    </View>
  );
}
