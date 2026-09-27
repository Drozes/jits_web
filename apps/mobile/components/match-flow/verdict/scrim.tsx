import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

function Fade({ id, color, stops }: { id: string; color: string; stops: [number, number][] }) {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(([offset, opacity]) => (
            <Stop key={offset} offset={String(offset)} stopColor={color} stopOpacity={opacity} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The camera-scrim gradients over the opening still (the only gradients the
 * brand allows): black at the top for the chips, into the themed page ground
 * (`ground`) at the bottom, solid under the verdict that overlaps the photo
 * so it reads in either theme.
 */
export function StillScrims({ height, ground }: { height: number; ground: string }) {
  return (
    <>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 120 }}>
        <Fade id="verdictScrimTop" color="#000000" stops={[[0, 0.6], [1, 0]]} />
      </View>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: height - 190, height: 192 }}>
        <Fade id="verdictScrimBottom" color={ground} stops={[[0, 0], [0.6, 1], [1, 1]]} />
      </View>
    </>
  );
}
