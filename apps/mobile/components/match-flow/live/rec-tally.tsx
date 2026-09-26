import { Text, View } from "react-native";
import { CameraOff } from "lucide-react-native";
import type { TallyVariant } from "@/lib/match-flow/live-view-state";
import { formatClock, spokenDuration } from "@/lib/match-flow/live-view-state";
import { BROADCAST, BROADCAST_RADIUS, BROADCAST_SIZE, TABULAR } from "./broadcast-tokens";

/**
 * Top-left HUD tally. "REC mm:ss" appears only while the recorder is
 * actually recording; every other state says what the camera is doing.
 */
export function RecTally({ variant, recordingSeconds }: { variant: TallyVariant; recordingSeconds: number }) {
  const rec = variant === "rec";
  const label =
    variant === "rec"
      ? `REC ${formatClock(recordingSeconds)}`
      : variant === "starting"
        ? "CAMERA STARTING"
        : variant === "saving"
          ? "SAVING VIDEO"
          : "NO VIDEO";
  const spoken =
    variant === "rec"
      ? `Recording, ${spokenDuration(recordingSeconds)}`
      : variant === "starting"
        ? "Camera starting"
        : variant === "saving"
          ? "Saving video"
          : "No video";
  const textColor = rec ? BROADCAST.ink : BROADCAST.white;
  return (
    <View
      testID="live-tally"
      accessible
      accessibilityLabel={spoken}
      style={{
        height: BROADCAST_SIZE.tally,
        paddingHorizontal: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        borderRadius: BROADCAST_RADIUS.tag,
        backgroundColor: rec ? BROADCAST.cta : BROADCAST.tallyGlass,
        borderWidth: rec ? 0 : 1,
        borderColor: BROADCAST.glassBorder,
      }}
    >
      {variant === "noVideo" ? (
        <CameraOff size={14} color={BROADCAST.white} strokeWidth={2} />
      ) : (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor:
              variant === "rec" ? BROADCAST.ink : variant === "saving" ? BROADCAST.white : "transparent",
            borderWidth: variant === "starting" ? 1.5 : 0,
            borderColor: BROADCAST.white,
          }}
        />
      )}
      <Text
        className="font-mono-bold"
        style={[{ fontSize: 11, lineHeight: 13, letterSpacing: 1.68, color: textColor }, TABULAR]}
      >
        {label}
      </Text>
    </View>
  );
}
