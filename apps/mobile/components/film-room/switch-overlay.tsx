import * as React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { Image } from "expo-image";
import type { SwitchState } from "@/lib/match-detail/use-video-playback";
import { duration, easing, moment } from "@/lib/motion";
import { ON_MEDIA } from "@/lib/theme/palette";

export interface SwitchOverlayProps {
  /** `mode` is optional for older callers: only an in_place switch (or none given) holds a still. */
  switchState: Pick<SwitchState, "phase" | "seq" | "heldFrame" | "approximate" | "restoring"> & Partial<Pick<SwitchState, "mode">>;
  /** From useReduceMotion() at the screen (a prop for testability). */
  reduceMotion: boolean;
  testID?: string;
}

/** How the held still leaves at landing (Motion registry: Angle crossfade, Angle dip). */
export type SwitchOverlayMode = "hold" | "crossfade" | "dip";

/**
 * The held still of the outgoing frame while the player loads the next angle
 * (jits-xfvd.16, contract 4.1), drawn between the `VideoView` and the scrims
 * so the athlete never sees black or the new angle's frame 0.
 *
 * - No still (none captured, or the 4 s cap dropped it): nothing, at once.
 * - Pending: the still at full opacity (no animation).
 * - Landing on an exact-synced angle (or a restore): the still fades out over
 *   the landed video, `duration.fast` on the brand ease-out.
 * - Landing on an approximate angle: the reel-contract dip. Black fades in
 *   over `moment.angleDip`, the still goes, black fades out over the same.
 * - Reduce Motion: a cut, the still is removed at landing.
 *
 * Every transition ends inside `SWITCH_SETTLE_MS` (300 ms), after which the
 * hook returns to idle and clears the still. Not touchable, hidden from
 * screen readers (the switcher's busy state and the landing announcement
 * carry the meaning).
 *
 * In_place switches only (jits-xfvd.19): a keep-watching switch never holds
 * a still, the outgoing angle stays live on screen and `AngleViewStack`
 * crossfades it, so this draws nothing for `mode` "keep_watching".
 */
export function SwitchOverlay({ switchState, reduceMotion, testID = "switch-overlay" }: SwitchOverlayProps) {
  const { phase, seq, heldFrame, approximate, restoring } = switchState;
  if (heldFrame == null || phase === "idle" || switchState.mode === "keep_watching") return null;
  if (phase === "landing" && reduceMotion) return null;
  const mode: SwitchOverlayMode = phase === "pending" ? "hold" : approximate && !restoring ? "dip" : "crossfade";
  return <HeldStill key={seq} still={heldFrame} mode={mode} testID={testID} />;
}

function HeldStill({ still, mode, testID }: { still: NonNullable<SwitchState["heldFrame"]>; mode: SwitchOverlayMode; testID: string }) {
  const stillOpacity = useSharedValue(1);
  const blackOpacity = useSharedValue(0);

  React.useEffect(() => {
    if (mode === "crossfade") {
      stillOpacity.value = withTiming(0, { duration: duration.fast, easing: easing.brandOut });
    } else if (mode === "dip") {
      blackOpacity.value = withSequence(
        withTiming(1, { duration: moment.angleDip, easing: easing.linear }),
        withTiming(0, { duration: moment.angleDip, easing: easing.linear }),
      );
      // The still goes while the frame is black.
      stillOpacity.value = withDelay(moment.angleDip, withTiming(0, { duration: 0 }));
    }
  }, [mode, stillOpacity, blackOpacity]);

  const stillStyle = useAnimatedStyle(() => ({ opacity: stillOpacity.value }));
  const blackStyle = useAnimatedStyle(() => ({ opacity: blackOpacity.value }));

  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Animated.View testID={`${testID}-${mode}`} style={[StyleSheet.absoluteFill, stillStyle]}>
        <Image testID={`${testID}-still`} source={still} contentFit="contain" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
      </Animated.View>
      {mode === "dip" ? (
        <Animated.View testID={`${testID}-black`} style={[StyleSheet.absoluteFill, { backgroundColor: ON_MEDIA.black }, blackStyle]} />
      ) : null}
    </View>
  );
}
