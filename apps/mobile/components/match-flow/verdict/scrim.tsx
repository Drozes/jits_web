import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

function Fade({ id, color, from, to }: { id: string; color: string; from: number; to: number }) {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={from} />
          <Stop offset="1" stopColor={color} stopOpacity={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The camera-scrim gradients over the opening still (the only gradients the
 * brand allows): black at the top for the chips, into the page ground at the
 * bottom so the verdict reads over the photo.
 */
export function StillScrims({ height }: { height: number }) {
  return (
    <>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 120 }}>
        <Fade id="verdictScrimTop" color="#000000" from={0.6} to={0} />
      </View>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: height - 190, height: 192 }}>
        <Fade id="verdictScrimBottom" color="#0D0F14" from={0} to={1} />
      </View>
    </>
  );
}
