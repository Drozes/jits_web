import * as React from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";

export interface StatePressableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
}

/**
 * A `Pressable` whose `style` may be a function of the pressed state.
 *
 * Use this instead of `<Pressable style={({ pressed }) => ...}>`. NativeWind
 * v4 (react-native-css-interop) wraps every RN `Pressable` on device and
 * treats `style` as inline rules to merge with the className styles; a
 * function there is spread into an empty object, so the WHOLE style (fill,
 * border, height, padding) is silently dropped and the button renders as
 * bare text. Jest does not register that wrapper (css-interop skips it when
 * NODE_ENV is "test"), so the loss is invisible to ordinary render tests.
 *
 * This tracks the pressed state itself and hands Pressable a resolved style
 * object/array, which the interop merges correctly.
 */
export const StatePressable = React.forwardRef<View, StatePressableProps>(function StatePressable(
  { style, onPressIn, onPressOut, disabled, ...rest },
  ref,
) {
  const [pressed, setPressed] = React.useState(false);
  // A button disabled mid-press never gets its onPressOut: do not keep
  // drawing it pressed.
  const shownPressed = pressed && !disabled;
  const resolved = typeof style === "function" ? style({ pressed: shownPressed }) : style;
  const handlePressIn = React.useCallback(
    (e: GestureResponderEvent) => {
      setPressed(true);
      onPressIn?.(e);
    },
    [onPressIn],
  );
  const handlePressOut = React.useCallback(
    (e: GestureResponderEvent) => {
      setPressed(false);
      onPressOut?.(e);
    },
    [onPressOut],
  );
  return (
    <Pressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={resolved}
    />
  );
});
