import { Text, View } from "react-native";
import { BROADCAST, BROADCAST_RADIUS, TABULAR } from "./broadcast-tokens";

/**
 * R-P8: the opponent ended the match; shown briefly before the END step.
 * `headlineLines` caps the headline (landscape: 2, then truncated).
 */
export function OpponentEndedPlate({
  name,
  finalFormatted,
  durationFormatted,
  headlineLines,
}: {
  name: string;
  finalFormatted: string;
  durationFormatted: string;
  headlineLines?: number;
}) {
  return (
    <View
      testID="live-opponent-ended"
      accessible
      accessibilityRole="alert"
      style={{
        backgroundColor: BROADCAST.plate,
        borderWidth: 1,
        borderColor: BROADCAST.plateBorder,
        borderRadius: BROADCAST_RADIUS.plate,
        paddingTop: 16,
        paddingHorizontal: 16,
        paddingBottom: 14,
        gap: 6,
      }}
    >
      <Text className="font-mono-bold" style={{ fontSize: 10, lineHeight: 12, letterSpacing: 2.52, color: BROADCAST.ink3 }}>
        MATCH OVER
      </Text>
      <Text
        testID="live-opponent-ended-headline"
        className="font-display"
        numberOfLines={headlineLines}
        style={{ fontSize: 40, lineHeight: 38, color: BROADCAST.ink }}
      >
        {`${name.toUpperCase()} ENDED THE MATCH`}
      </Text>
      <Text
        className="font-mono-medium"
        style={[{ fontSize: 11, lineHeight: 13, letterSpacing: 0.56, color: BROADCAST.ink3 }, TABULAR]}
      >
        {`FINAL CLOCK ${finalFormatted} OF ${durationFormatted}`}
      </Text>
    </View>
  );
}
