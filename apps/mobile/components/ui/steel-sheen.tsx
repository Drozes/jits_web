/**
 * `SteelSheen`: the Motion Rule's steel sheen (Ambient tier, DESIGN.md
 * "Motion", registry row "Steel sheen").
 *
 * While an action is waiting on THIS user, a narrow skewed highlight
 * (transparent, white 55%, transparent) crosses the button: an 800ms sweep,
 * then about 2s of rest. Use it only on the one waiting-on-you button of a
 * screen (Accept on the incoming-challenge prompt, Confirm result in the
 * match-flow confirm step); at most one sheened button per screen.
 *
 * Render it as the LAST child of a button that clips (`overflow: hidden`):
 * it fills the button absolutely and takes no touches. It mounts only while
 * `active` is true, pauses (cancels the loop) while the app is in the
 * background and restarts on foreground, and draws nothing under Reduce
 * Motion. Silent: never a haptic for ambient motion.
 */
import * as React from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { easing, useAppActive, useReduceMotion } from "@/lib/motion";
import { onMediaTokens } from "@/lib/tokens";

/** One sweep across the button. */
export const SHEEN_SWEEP_MS = 800;
/** The rest between sweeps (and before the first one). */
export const SHEEN_REST_MS = 2000;
/** The band's width before the skew. */
const BAND_WIDTH = 22;
/** Where the band parks, fully off the left edge (skew included). */
const PARKED_X = -BAND_WIDTH * 2;
/** Gradient ids are scoped to their own Svg, so one constant id is safe. */
const GRADIENT_ID = "steel-sheen-gradient";

interface SteelSheenProps {
  /** True while the action waits on this user. False: nothing is drawn. */
  active: boolean;
  testID?: string;
}

export function SteelSheen({ active, testID = "steel-sheen" }: SteelSheenProps) {
  const reduceMotion = useReduceMotion();
  if (!active || reduceMotion) return null;
  return <SheenBand testID={testID} />;
}

function SheenBand({ testID }: { testID: string }) {
  const appActive = useAppActive();
  const [width, setWidth] = React.useState(0);
  const x = useSharedValue(PARKED_X);

  React.useEffect(() => {
    if (!appActive || width <= 0) return;
    x.value = PARKED_X;
    x.value = withRepeat(
      withSequence(
        withDelay(
          SHEEN_REST_MS,
          withTiming(width + BAND_WIDTH, { duration: SHEEN_SWEEP_MS, easing: easing.brandOut }),
        ),
        withTiming(PARKED_X, { duration: 0 }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(x);
      x.value = PARKED_X;
    };
  }, [appActive, width, x]);

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    setWidth(Math.round(e.nativeEvent.layout.width));
  }, []);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { skewX: "-20deg" }],
  }));

  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
    >
      <Animated.View
        testID={`${testID}-band`}
        style={[
          { position: "absolute", top: "-20%", bottom: "-20%", left: 0, width: BAND_WIDTH },
          bandStyle,
        ]}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={onMediaTokens.white} stopOpacity={0} />
              <Stop offset="0.5" stopColor={onMediaTokens.white} stopOpacity={0.55} />
              <Stop offset="1" stopColor={onMediaTokens.white} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${GRADIENT_ID})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}
