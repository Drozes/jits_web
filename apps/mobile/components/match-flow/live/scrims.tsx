import { View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Stops as [offset, opacity] of black, along the gradient's axis. */
type Stops = [number, number][];

function Gradient({ id, stops, horizontal = false }: { id: string; stops: Stops; horizontal?: boolean }) {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={horizontal ? "1" : "0"} y2={horizontal ? "0" : "1"}>
          {stops.map(([offset, opacity]) => (
            <Stop key={offset} offset={String(offset)} stopColor="#000000" stopOpacity={opacity} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The only soft shadows on the live screen, so the chrome reads over any
 * feed. Portrait: a top scrim behind the HUD and a bottom scrim behind the
 * lower-third. Landscape: a left scrim behind the HUD and lower-third and a
 * right scrim behind the rail.
 */
export function Scrims({ landscape = false }: { landscape?: boolean }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (landscape) {
    return (
      <>
        <View
          pointerEvents="none"
          testID="live-scrim-left"
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 440 }}
        >
          <Gradient id="liveScrimLeft" horizontal stops={[[0, 0.72], [0.5, 0.5], [1, 0]]} />
        </View>
        <View
          pointerEvents="none"
          testID="live-scrim-right"
          style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 220 }}
        >
          <Gradient id="liveScrimRight" horizontal stops={[[0, 0], [0.55, 0.55], [1, 0.7]]} />
        </View>
      </>
    );
  }
  return (
    <>
      <View
        pointerEvents="none"
        testID="live-scrim-top"
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: insets.top + 86 }}
      >
        <Gradient id="liveScrimTop" stops={[[0, 0.7], [1, 0]]} />
      </View>
      <View
        pointerEvents="none"
        testID="live-scrim-bottom"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.45 }}
      >
        <Gradient id="liveScrimBottom" stops={[[0, 0], [1, 0.85]]} />
      </View>
    </>
  );
}
