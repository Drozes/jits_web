/**
 * `PressableScale`: the Motion Rule's press scale (Reactive tier, DESIGN.md
 * "Motion", registry row "Press scale").
 *
 * Press-in dips the control to `PRESS_SCALE` (0.97) over `duration.instant`;
 * release springs it back on `spring.press`. Under Reduce Motion it does not
 * move: it dips to 0.85 opacity instead, so the touch still reads. A
 * disabled control neither moves nor buzzes.
 *
 * `haptic` opts a COMMIT action into feedback on `onPress` (not on press-in,
 * so a cancelled touch is silent): `true` or `"press"` fires `haptics.press`,
 * `"accept"` fires `haptics.accept` (the waiting-on-you Accept, which
 * replaces `press` there, never both). Haptics stay on under Reduce Motion.
 *
 * One box: the Pressable itself is the animated component, so its
 * `className` layout (`w-full`, `flex-1`, margins) still applies to the
 * outermost box and nothing changes for callers. `style` may be a function
 * of `{ pressed }`: like `StatePressable`, this tracks the pressed state
 * itself and hands the Pressable a resolved style, because NativeWind drops
 * a function `style` on device. Only `transform` is animated, so a caller's
 * opacity (a disabled `opacity-50`) is kept; the Reduce Motion dip is a
 * plain style applied only while pressed.
 */
import * as React from "react";
import {
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { PRESS_SCALE, duration, easing, haptics, spring, useReduceMotion } from "@/lib/motion";

/** The opacity a pressed control dips to under Reduce Motion (no scale). */
export const REDUCED_PRESS_OPACITY = 0.85;
const REDUCED_DIP_STYLE = { opacity: REDUCED_PRESS_OPACITY } as const;

export type PressHaptic = boolean | "press" | "accept";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  /**
   * Commit-action haptic on `onPress`: `true`/`"press"` (Light) or
   * `"accept"` (Medium). Omitted or false: silent.
   */
  haptic?: PressHaptic;
  /** NativeWind classes, applied to the Pressable as usual. */
  className?: string;
}

function fireHaptic(haptic: PressHaptic | undefined): void {
  if (!haptic) return;
  void (haptic === "accept" ? haptics.accept() : haptics.press());
}

export const PressableScale = React.forwardRef<View, PressableScaleProps>(function PressableScale(
  { haptic, style, disabled, onPress, onPressIn, onPressOut, ...rest },
  ref,
) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const [pressed, setPressed] = React.useState(false);
  const inert = !!disabled;

  // A control disabled mid-press never gets its press-out: put it back at rest.
  React.useEffect(() => {
    if (!inert) return;
    cancelAnimation(scale);
    scale.value = 1;
  }, [inert, scale]);

  const handlePressIn = React.useCallback(
    (e: GestureResponderEvent) => {
      setPressed(true);
      // Under Reduce Motion the dip is the pressed-only opacity below.
      if (!inert && !reduceMotion) {
        scale.value = withTiming(PRESS_SCALE, {
          duration: duration.instant,
          easing: easing.brandOut,
        });
      }
      onPressIn?.(e);
    },
    [inert, reduceMotion, scale, onPressIn],
  );

  const handlePressOut = React.useCallback(
    (e: GestureResponderEvent) => {
      setPressed(false);
      scale.value = withSpring(1, spring.press);
      onPressOut?.(e);
    },
    [scale, onPressOut],
  );

  const handlePress = React.useCallback(
    (e: GestureResponderEvent) => {
      if (inert) return;
      fireHaptic(haptic);
      onPress?.(e);
    },
    [inert, haptic, onPress],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const shownPressed = pressed && !inert;
  const resolved =
    typeof style === "function" ? style({ pressed: shownPressed }) : style;
  // No null/undefined entries: Reanimated's jest style reader cannot skip them.
  const composed: StyleProp<ViewStyle>[] = [];
  // Flattened: a function style may return a nested array with `false`
  // entries (FightButton), which the jest style reader cannot walk either.
  if (resolved) composed.push(StyleSheet.flatten(resolved));
  if (shownPressed && reduceMotion) composed.push(REDUCED_DIP_STYLE);

  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[...composed, animatedStyle]}
    />
  );
});
