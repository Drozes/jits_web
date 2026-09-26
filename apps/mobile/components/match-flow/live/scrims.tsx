import { View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function Gradient({ id, from, to }: { id: string; from: number; to: number }) {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={from} />
          <Stop offset="1" stopColor="#000000" stopOpacity={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The only soft shadows on the live screen: a top scrim behind the HUD and
 * a bottom scrim behind the lower-third, so the chrome reads over any feed.
 */
export function Scrims() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <>
      <View
        pointerEvents="none"
        testID="live-scrim-top"
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: insets.top + 86 }}
      >
        <Gradient id="liveScrimTop" from={0.7} to={0} />
      </View>
      <View
        pointerEvents="none"
        testID="live-scrim-bottom"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.45 }}
      >
        <Gradient id="liveScrimBottom" from={0} to={0.85} />
      </View>
    </>
  );
}
