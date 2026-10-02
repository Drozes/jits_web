import { Text, View } from "react-native";
import { CameraOff } from "lucide-react-native";
import type { UnavailableVariant } from "@/lib/match-flow/live-view-state";
import { BROADCAST } from "./broadcast-tokens";
import { TRACKING, typeStep } from "@/lib/typography";
import { Button } from "@/components/ui/elo-system/button";

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
    case "off":
      return {
        heading: "NOT RECORDING",
        body: `Recording is off on this phone. The clock runs as normal${counts}.`,
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
        style={[
          typeStep(compact ? "headline-xl" : "display-36"),
          {
            lineHeight: compact ? 27 : 34,
            letterSpacing: TRACKING.tight,
            color: BROADCAST.inkDark,
            textAlign: "center",
          },
        ]}
      >
        {copy.heading}
      </Text>
      <Text
        className="font-body"
        style={[
          typeStep(compact ? "body" : "callout"),
          {
            lineHeight: compact ? 18.2 : 21,
            color: BROADCAST.body72,
            textAlign: "center",
          },
        ]}
      >
        {copy.body}
      </Text>
      {variant === "canAsk" ? (
        <Button
          testID="live-allow-camera"
          variant="glass"
          label="ALLOW CAMERA"
          accessibilityLabel="Allow camera"
          height={48}
          hitSlop={10}
          style={{ width: Math.min(180, maxWidth) }}
          onPress={onAllowCamera}
        />
      ) : null}
    </View>
  );
}
