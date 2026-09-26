import { Pressable, Text, View } from "react-native";
import { Pause, Play } from "lucide-react-native";
import { BROADCAST, BROADCAST_SIZE, glassButtonStyle } from "./broadcast-tokens";

/** Glass Pause button; while paused it is the amber Resume (the next action). */
export function PauseButton({
  paused,
  disabled,
  onPress,
}: {
  paused: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID="live-pause-toggle"
      accessibilityRole="button"
      accessibilityLabel={paused ? "Resume match clock" : "Pause match clock"}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        height: BROADCAST_SIZE.controls,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        ...glassButtonStyle(pressed && !disabled),
        // Paused, it is the amber Resume.
        ...(paused ? { borderColor: BROADCAST.amber, backgroundColor: BROADCAST.amberSoft } : null),
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <View pointerEvents="none">
        {paused ? (
          <Play size={22} color={BROADCAST.white} strokeWidth={2} />
        ) : (
          <Pause size={22} color={BROADCAST.white} strokeWidth={2} />
        )}
      </View>
      <Text className="font-heading" style={{ fontSize: 14, lineHeight: 16, letterSpacing: 1.12, color: BROADCAST.white }}>
        {paused ? "RESUME" : "PAUSE"}
      </Text>
    </Pressable>
  );
}
