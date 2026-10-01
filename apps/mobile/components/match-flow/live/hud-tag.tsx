import { Text, View } from "react-native";
import { BROADCAST, BROADCAST_RADIUS, BROADCAST_SIZE } from "./broadcast-tokens";
import { StatePressable } from "@/components/ui/state-pressable";

const TAG_STYLE = {
  height: BROADCAST_SIZE.tally,
  paddingHorizontal: 10,
  justifyContent: "center" as const,
  alignItems: "center" as const,
  borderWidth: 1,
  borderColor: BROADCAST.glassBorder,
  borderRadius: BROADCAST_RADIUS.tag,
  backgroundColor: BROADCAST.tagFill,
};

function TagLabel({ children }: { children: string }) {
  return (
    <Text
      className="font-mono-medium"
      style={{ fontSize: 10, lineHeight: 12, letterSpacing: 2.52, color: BROADCAST.tagText }}
    >
      {children}
    </Text>
  );
}

/** Top-right glass tag: PRACTICE (shown only on a practice match). */
export function HudTag({ label, testID }: { label: string; testID?: string }) {
  return (
    <View testID={testID} style={TAG_STYLE}>
      <TagLabel>{label}</TagLabel>
    </View>
  );
}

/** The same glass tag as a button (the practice EXIT pill). */
export function HudTagButton({
  label,
  onPress,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  accessibilityLabel: string;
}) {
  return (
    <StatePressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [TAG_STYLE, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
    >
      <TagLabel>{label}</TagLabel>
    </StatePressable>
  );
}
