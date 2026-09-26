import { Pressable, Text, View } from "react-native";
import { Pause, Play } from "lucide-react-native";
import { BROADCAST, BROADCAST_RADIUS, BROADCAST_SIZE } from "./broadcast-tokens";

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
        borderRadius: BROADCAST_RADIUS.button,
        borderWidth: 1,
        borderColor: paused ? BROADCAST.amber : BROADCAST.glassBorder,
        backgroundColor: paused
          ? BROADCAST.amberSoft
          : pressed
            ? BROADCAST.glassFillPressed
            : BROADCAST.glassFill,
        opacity: disabled ? 0.5 : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
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
