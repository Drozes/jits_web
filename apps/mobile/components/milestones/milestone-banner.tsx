import * as React from "react";
import { Pressable, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Sparkles, Trophy } from "lucide-react-native";
import type { MilestoneId } from "@/lib/milestones/milestone-store";
import { duration, easing, useReduceMotion } from "@/lib/motion";
import { usePalette } from "@/lib/theme/palette";
import { typeStep } from "@/lib/typography";

/** The banner stays this long, then fades (spec 10.6). */
export const MILESTONE_BANNER_MS = 4000;

/**
 * The one-line milestone banner (board P-MT-15, C-C1 to C-C3): a plate with
 * a 3 pt left rule (gain green for a first win, ink otherwise), an icon and
 * the copy. A status: VoiceOver reads its line once. It fades out over
 * `duration.fast` after 4 s or on tap, then calls `onDismiss`; under Reduce
 * Motion it appears and leaves in place.
 */
export function MilestoneBanner({ milestone, copy, onDismiss }: { milestone: MilestoneId; copy: string; onDismiss: () => void }) {
  const p = usePalette();
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(1);
  const done = React.useRef(onDismiss);
  done.current = onDismiss;
  const leaving = React.useRef(false);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const leave = React.useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (reduceMotion) {
      done.current();
      return;
    }
    opacity.value = withTiming(0, { duration: duration.fast, easing: easing.brandOut });
    // The JS timer ends it, never the animation callback (it may not run in background).
    timers.current.push(setTimeout(() => done.current(), duration.fast));
  }, [reduceMotion, opacity]);

  React.useEffect(() => {
    const t = setTimeout(leave, MILESTONE_BANNER_MS);
    const pending = timers.current;
    return () => {
      clearTimeout(t);
      pending.forEach(clearTimeout);
    };
  }, [leave]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const win = milestone === "first_win";
  const Icon = win ? Trophy : Sparkles;
  return (
    <Animated.View style={style}>
      <Pressable
        testID={`milestone-banner-${milestone}`}
        role="status"
        accessibilityLiveRegion="polite"
        accessibilityLabel={copy}
        accessibilityHint="Dismisses"
        onPress={leave}
        className="flex-row items-center bg-surface-3 border border-hairline-strong rounded-md"
        style={{ gap: 10, minHeight: 44, paddingVertical: 12, paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: win ? p.win : p.text }}
      >
        <Icon size={16} color={p.text} />
        <Text className="font-heading text-ink flex-1" style={typeStep("body")} numberOfLines={1}>
          {copy}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
