import { Pressable, Text, View } from "react-native";
import { CameraOff } from "lucide-react-native";
import type { UnavailableVariant } from "@/lib/match-flow/live-view-state";
import { BROADCAST, glassButtonStyle } from "./broadcast-tokens";

/**
 * The plate's words. Deliberately no Settings button: iOS restarts the app
 * when a camera or microphone privacy switch changes, which would strand the
 * athlete mid-match. Practice drops "your result still counts" (it does not).
 */
export function noVideoCopy(variant: UnavailableVariant, practice: boolean): { heading: string; body: string } {
  const counts = practice ? "" : " and your result still counts";
  switch (variant) {
    case "canAsk":
      return {
        heading: "CAMERA ACCESS NEEDED",
        body: "Allow access to record this match. The clock runs either way.",
      };
    case "denied":
      return {
        heading: "NO VIDEO FOR THIS MATCH",
        body: `Camera access is off. The clock runs as normal${counts}. To record your next match, turn on camera and microphone in Settings after this one.`,
      };
    case "error":
      return {
        heading: "NO VIDEO FOR THIS MATCH",
        body: `The camera could not start. The clock runs as normal${counts}.`,
      };
  }
}

/**
 * `regionWidth` (landscape): the free width between the lower-third and the
 * rail. The plate fits inside it (capped at 300), drops the icon and uses
 * smaller type.
 */
export function NoVideoPlate({
  variant,
  practice,
  onAllowCamera,
  regionWidth,
}: {
  variant: UnavailableVariant;
  practice: boolean;
  onAllowCamera: () => void;
  regionWidth?: number;
}) {
  const copy = noVideoCopy(variant, practice);
  const compact = regionWidth != null;
  const maxWidth = compact ? Math.min(300, regionWidth) : 300;
  return (
    <View testID={`live-no-video-${variant}`} style={{ maxWidth, alignItems: "center", gap: 12 }}>
      {compact ? null : <CameraOff size={40} color={BROADCAST.dim62} strokeWidth={1.5} />}
      <Text
        accessibilityRole="header"
        className="font-display"
        style={{
          fontSize: compact ? 28 : 36,
          lineHeight: compact ? 27 : 34,
          letterSpacing: -0.18,
          color: BROADCAST.inkDark,
          textAlign: "center",
        }}
      >
        {copy.heading}
      </Text>
      <Text
        className="font-body"
        style={{
          fontSize: compact ? 13 : 14,
          lineHeight: compact ? 18.2 : 21,
          color: BROADCAST.body72,
          textAlign: "center",
        }}
      >
        {copy.body}
      </Text>
      {variant === "canAsk" ? (
        <Pressable
          testID="live-allow-camera"
          accessibilityRole="button"
          accessibilityLabel="Allow camera"
          onPress={onAllowCamera}
          hitSlop={10}
          style={({ pressed }) => ({
            width: Math.min(180, maxWidth),
            height: 48,
            alignItems: "center",
            justifyContent: "center",
            ...glassButtonStyle(pressed),
          })}
        >
          <Text className="font-heading" style={{ fontSize: 14, lineHeight: 16, letterSpacing: 1.12, color: BROADCAST.white }}>
            ALLOW CAMERA
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
