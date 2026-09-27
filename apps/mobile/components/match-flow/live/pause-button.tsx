import { Pressable, Text, View } from "react-native";
import { Pause, Play } from "lucide-react-native";
import { BROADCAST, BROADCAST_LANDSCAPE, BROADCAST_SIZE, glassButtonStyle } from "./broadcast-tokens";

/**
 * Glass Pause button; while paused it is the amber Resume (the next action).
 * `tile`: the landscape rail's 112 x 112 square, icon above label.
 */
export function PauseButton({
  paused,
  disabled,
  onPress,
  tile = false,
}: {
  paused: boolean;
  disabled: boolean;
  onPress: () => void;
  tile?: boolean;
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
        ...(tile
          ? { width: BROADCAST_LANDSCAPE.pauseTile, height: BROADCAST_LANDSCAPE.pauseTile, flexDirection: "column" as const }
          : { flex: 1, minWidth: 0, height: BROADCAST_SIZE.controls, flexDirection: "row" as const }),
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
