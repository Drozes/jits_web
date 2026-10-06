import * as React from "react";
import { AccessibilityInfo, Platform, Pressable, Text } from "react-native";
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
 * the copy. A status: screen readers read its line once (iOS through
 * `announceForAccessibility` on mount, since the status role and live
 * regions carry nothing to VoiceOver; Android through the polite live
 * region). It fades out over
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

  // VoiceOver: announce once per banner (Android reads the live region).
  const copyRef = React.useRef(copy);
  React.useEffect(() => {
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(copyRef.current);
  }, []);

  // The 4 s hold. Re-armed if `leave` changes identity (a Reduce Motion
  // flip), but never once leaving: a fade already under way keeps its timer.
  React.useEffect(() => {
    if (leaving.current) return;
    const t = setTimeout(leave, MILESTONE_BANNER_MS);
    return () => clearTimeout(t);
  }, [leave]);

  // The fade's done timer is cleared on unmount only.
  React.useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

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
