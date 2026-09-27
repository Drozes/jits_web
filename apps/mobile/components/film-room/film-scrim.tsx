import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

interface FilmScrimProps {
  /** [offset 0..1, opacity 0..1] of `color`, top to bottom. */
  stops: [number, number][];
  color?: string;
  style: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A vertical gradient over film so overlaid text reads on any frame: the one
 * gradient the brand allows (camera scrims). react-native-svg is already in
 * the native build, so this stays OTA-safe.
 */
export function FilmScrim({ stops, color = "#000000", style, testID }: FilmScrimProps) {
  const id = `filmScrim${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View pointerEvents="none" testID={testID} style={[{ position: "absolute" }, style]}>
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
    </View>
  );
}
