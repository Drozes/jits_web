import * as React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, type SharedValue } from "react-native-reanimated";
import Svg, { G, Path, Rect } from "react-native-svg";

// react-native-svg is declared as a peerDependency by lucide-react-native and is
// now a pinned direct dependency (package.json), so it is autolinked into the
// native build, no new package, just a version pin on what was already resolved.
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// E·R lettermark, the SAME vector source that generates the native splash icon
// (design/icon-options/er-lettermark/splash.svg, viewBox 0 0 1024 1024), so the
// static→animated hand-off lines up. DM Sans Bold glyph outlines in Terminal
// White; the interpunct is a Signal Red square. The white E/R share one opacity
// (they crossfade out together into the wordmark); the dot has its own so it can
// fade out on its own beat (during the hold, before the letters expand).
const WHITE = "#E8EDF2";
const RED = "#E63946";
const E_PATH =
  "M196.23 0L25.59 0L25.59-259.66L196.23-259.66L196.23-219.22L75.67-219.22L75.67-151.34L185.10-151.34L185.10-112.39L75.67-112.39L75.67-40.43L196.23-40.43";
const R_PATH =
  "M75.67 0L25.59 0L25.59-259.66L122.41-259.66Q153.94-259.66 174.34-248.90Q194.74-238.14 204.76-220.15Q214.77-202.16 214.77-180.28Q214.77-159.50 205.13-141.51Q195.48-123.52 174.90-112.58Q154.31-101.64 122.04-101.64L75.67-101.64L75.67 0M217.37 0L160.24 0L106.83-114.25L160.99-114.25L217.37 0M75.67-217.74L75.67-137.99L119.44-137.99Q142.07-137.99 152.83-149.12Q163.58-160.24 163.58-178.42Q163.58-196.60 153.01-207.17Q142.44-217.74 119.44-217.74";

interface ErMarkProps {
  /** dp width/height of the square mark (matches app.json splash imageWidth). */
  size: number;
  /** Opacity of the white E/R glyphs, crossfades out into the wordmark. */
  glyphOpacity: SharedValue<number>;
  /** Opacity of the red interpunct, fades out during the hold. */
  dotOpacity: SharedValue<number>;
}

/**
 * The animated E·R lettermark, absolutely centered in the FULL screen (NOT inside
 * a SafeAreaView, the native splash ignores insets, so this must too or the mark
 * shifts under the notch/Dynamic Island). Everything animated here is opacity +
 * transform on Reanimated worklets, so it is safe on the New Architecture / Fabric.
 */
export function ErMark({ size, glyphOpacity, dotOpacity }: ErMarkProps) {
  const glyphProps = useAnimatedProps(() => ({ opacity: glyphOpacity.value }));
  const dotProps = useAnimatedProps(() => ({ opacity: dotOpacity.value }));

  return (
    <View style={styles.center} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 1024 1024">
        <AnimatedG animatedProps={glyphProps}>
          <Path d={E_PATH} fill={WHITE} transform="translate(220.17 641.83)" />
          <Path d={R_PATH} fill={WHITE} transform="translate(560.87 641.83)" />
        </AnimatedG>
        <AnimatedRect
          x={486.5}
          y={497.07}
          width={29.86}
          height={29.86}
          fill={RED}
          animatedProps={dotProps}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
