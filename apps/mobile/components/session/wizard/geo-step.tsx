import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { AlertTriangle, CheckCircle, MapPin, XCircle } from "lucide-react-native";
import { Plate } from "@/components/ui/elo-system";
import { useLocation } from "@/lib/location/use-location";
import {
  classifyProximity,
  GYM_PROXIMITY_THRESHOLD_KM,
} from "@/lib/session/distance-from-gym";
import { useThemedTokens } from "@/lib/theme/use-theme";

interface GeoStepProps {
  gymLatitude: number;
  gymLongitude: number;
  gymName: string;
  onNext: () => void;
}

type GeoStatus = "idle" | "checking" | "near" | "far" | "denied" | "failed";

/**
 * Native port of `apps/web/app/(app)/session/[id]/join/steps/geo-check-step.tsx`.
 *
 * ELO design system: wireframe C1 (lines 957-970). Full-bleed Plate centered
 * on the page with a spinner / status icon, an h2 title, a lede description,
 * and a tertiary "Cancel" cta that just goes back through the wizard.
 *
 * Lenient parity with web: distance threshold is 2km
 * (`GYM_PROXIMITY_THRESHOLD_KM`) and we never block "Continue"; we surface
 * the result and let the athlete proceed if they say they're actually at the
 * gym. Web has the same flow.
 */
export function GeoStep({ gymLatitude, gymLongitude, gymName, onNext }: GeoStepProps) {
  const tokens = useThemedTokens();
  const { position, isGranted, isLoading, error, request } = useLocation();
  const [status, setStatus] = React.useState<GeoStatus>("idle");

  // Auto-request location once on mount; user sees the OS permission prompt
  React.useEffect(() => {
    if (status === "idle") {
      setStatus("checking");
      request();
    }
  }, [request, status]);

  // React to permission/position results
  React.useEffect(() => {
    if (status !== "checking") return;
    if (isLoading) return;
    if (isGranted === false) {
      setStatus("denied");
      return;
    }
    if (error && !position) {
      setStatus("failed");
      return;
    }
    if (position) {
      const { proximity } = classifyProximity(position, {
        latitude: gymLatitude,
        longitude: gymLongitude,
      });
      setStatus(proximity === "near" ? "near" : "far");
    }
  }, [status, isLoading, isGranted, error, position, gymLatitude, gymLongitude]);

  const iconSize = 40;
  const icon =
    status === "checking" ? (
      <ActivityIndicator color={tokens.accentCta} size="large" />
    ) : status === "near" ? (
      <CheckCircle size={iconSize} color={tokens.statePositive} />
    ) : status === "far" ? (
      <AlertTriangle size={iconSize} color={tokens.accentCta} />
    ) : status === "denied" ? (
      <MapPin size={iconSize} color={tokens.textTertiary} />
    ) : (
      <XCircle size={iconSize} color={tokens.textTertiary} />
    );

  const title = (() => {
    switch (status) {
      case "checking":
        return "Verifying your location";
      case "near":
        return "Location confirmed";
      case "far":
        return "Hmm, that's far away";
      case "denied":
        return "Location permission denied";
      case "failed":
        return "Location unavailable";
      case "idle":
      default:
        return "Verifying your location";
    }
  })();

  const message = (() => {
    switch (status) {
      case "checking":
        return `Confirming you${"’"}re at ${gymName}.`;
      case "near":
        return `You${"’"}re near ${gymName}.`;
      case "far":
        return `You appear to be more than ${GYM_PROXIMITY_THRESHOLD_KM} km from ${gymName}. You can still continue if you${"’"}re actually there.`;
      case "denied":
        return `We couldn${"’"}t verify you${"’"}re at the gym. Grant permission in Settings or continue if you${"’"}re actually there.`;
      case "failed":
        return `We couldn${"’"}t verify you${"’"}re at the gym. You can still continue if you${"’"}re actually there.`;
      case "idle":
      default:
        return `Confirming you${"’"}re at ${gymName}.`;
    }
  })();

  const showContinue = status !== "checking" && status !== "idle";

  return (
    <Plate className="items-center py-10">
      <View className="mb-5">{icon}</View>
      <Text className="font-heading text-[20px] text-ink text-center mb-2">
        {title}
      </Text>
      <Text className="font-body text-[14px] text-ink-2 text-center leading-[22px] mb-6 px-4">
        {message}
      </Text>

      {status === "denied" && (
        <Pressable
          accessibilityRole="button"
          onPress={() => request()}
          className="bg-surface-3 border border-hairline-strong px-5 py-3 rounded-sm mb-2 active:bg-surface-4"
        >
          <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
            Try again
          </Text>
        </Pressable>
      )}

      {showContinue && (
        <Pressable
          accessibilityRole="button"
          onPress={onNext}
          className="bg-cta px-6 py-3 rounded-sm self-stretch items-center active:bg-cta-hover"
        >
          <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
            Continue
          </Text>
        </Pressable>
      )}
    </Plate>
  );
}
