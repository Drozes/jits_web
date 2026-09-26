import { Text, View } from "react-native";
import { BROADCAST, BROADCAST_RADIUS, BROADCAST_SIZE, TABULAR } from "./broadcast-tokens";

export interface LiveAthlete {
  name: string;
  meta: string | null;
}

const NAME_STYLE = { fontSize: 15, lineHeight: 18, letterSpacing: 0.6, color: BROADCAST.ink };
const META_STYLE = [{ fontSize: 11, lineHeight: 13, letterSpacing: 0.56, color: BROADCAST.ink3 }, TABULAR];

/**
 * You (left, with the red mark) vs your opponent (right) on the light plate.
 * `flatTop` squares the top corners when a strip or plate sits on it.
 */
export function AthleteBar({ me, opponent, flatTop }: { me: LiveAthlete; opponent: LiveAthlete; flatTop: boolean }) {
  const radius = flatTop ? 0 : BROADCAST_RADIUS.plate;
  return (
    <View
      testID="live-athlete-bar"
      style={{
        height: BROADCAST_SIZE.bar,
        flexDirection: "row",
        backgroundColor: BROADCAST.plate,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: BROADCAST.plateBorder,
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, paddingLeft: 12, justifyContent: "center", gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel="You"
            testID="live-you-mark"
            style={{ width: 4, height: 4, backgroundColor: BROADCAST.cta }}
          />
          <Text
            testID="live-me-name"
            className="font-heading"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[NAME_STYLE, { flexShrink: 1 }]}
          >
            {me.name.toUpperCase()}
          </Text>
        </View>
        {me.meta ? (
          <Text testID="live-me-meta" className="font-mono" numberOfLines={1} style={[META_STYLE, { paddingLeft: 11 }]}>
            {me.meta}
          </Text>
        ) : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 44, alignItems: "center", paddingTop: 7, gap: 3 }}
      >
        <Text className="font-display" style={{ fontSize: 22, lineHeight: 22, letterSpacing: 0.4, color: BROADCAST.ctaText }}>
          VS
        </Text>
        <View style={{ width: 1, flexGrow: 1, backgroundColor: BROADCAST.cta }} />
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 12, justifyContent: "center", alignItems: "flex-end", gap: 4 }}>
        <Text
          testID="live-opponent-name"
          className="font-heading"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={NAME_STYLE}
        >
          {opponent.name.toUpperCase()}
        </Text>
        {opponent.meta ? (
          <Text testID="live-opponent-meta" className="font-mono" numberOfLines={1} style={META_STYLE}>
            {opponent.meta}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
