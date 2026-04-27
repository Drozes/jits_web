import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { AlertTriangle, CheckCircle, MapPin, XCircle } from "lucide-react-native";
import { Button } from "@/components/ui/button";
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
 * Lenient parity with web: distance threshold is 2km (`GYM_PROXIMITY_THRESHOLD_KM`)
 * and we never block "Continue" — we surface the result and let the athlete
 * proceed if they say they're actually at the gym. Web has the same flow.
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

  const iconSize = 48;
  const icon =
    status === "checking" ? (
      <ActivityIndicator color={tokens.mutedForeground} size="large" />
    ) : status === "near" ? (
      <CheckCircle size={iconSize} color={tokens.success} />
    ) : status === "far" ? (
      <AlertTriangle size={iconSize} color="#f59e0b" />
    ) : status === "denied" ? (
      <MapPin size={iconSize} color={tokens.mutedForeground} />
    ) : (
      <XCircle size={iconSize} color={tokens.mutedForeground} />
    );

  const message = (() => {
    switch (status) {
      case "checking":
        return "Checking your location...";
      case "near":
        return `You're near ${gymName}.`;
      case "far":
        return `You appear to be more than ${GYM_PROXIMITY_THRESHOLD_KM} km from ${gymName}. You can still continue if you're actually there.`;
      case "denied":
        return "Location permission denied, so we couldn't verify you're at the gym. Grant permission in Settings or continue if you're actually there.";
      case "failed":
        return "Location unavailable, so we couldn't verify you're at the gym. You can still continue if you're actually there.";
      case "idle":
      default:
        return "Tap below to share your location.";
    }
  })();

  const showContinue = status !== "checking" && status !== "idle";

  return (
    <View className="items-center gap-4 py-8">
      {icon}
      <Text className="px-4 text-center text-sm text-muted-foreground">
        {message}
      </Text>
      {status === "denied" && (
        <Button variant="outline" onPress={() => request()}>
          Try again
        </Button>
      )}
      {showContinue && (
        <Button onPress={onNext} className="w-full">
          Continue
        </Button>
      )}
    </View>
  );
}
