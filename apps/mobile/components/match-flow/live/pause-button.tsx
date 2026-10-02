import { Text, View } from "react-native";
import { Pause, Play } from "lucide-react-native";
import { BROADCAST, BROADCAST_LANDSCAPE, BROADCAST_SIZE, glassButtonStyle } from "./broadcast-tokens";
import { TRACKING, typeStep } from "@/lib/typography";
import { PressableScale } from "@/components/ui/pressable-scale";

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
    <PressableScale
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
      <Text className="font-heading" style={[typeStep("callout"), { lineHeight: 16, letterSpacing: TRACKING.caps, color: BROADCAST.white }]}>
        {paused ? "RESUME" : "PAUSE"}
      </Text>
    </PressableScale>
  );
}
