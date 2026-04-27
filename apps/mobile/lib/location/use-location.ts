import * as React from "react";
import * as Location from "expo-location";

export interface LocationPosition {
  latitude: number;
  longitude: number;
}

export interface UseLocationResult {
  /** Last known position. `null` until permission granted + position obtained. */
  position: LocationPosition | null;
  /** Permission status: `null` until first request. `true` if granted. */
  isGranted: boolean | null;
  /** True while a request is in flight. */
  isLoading: boolean;
  /** Last error message (e.g. permission denied, timeout). */
  error: string | null;
  /** Triggers permission prompt + position fetch. Idempotent. */
  request: () => Promise<void>;
}

/**
 * Wraps `expo-location` permission + position fetch. Does NOT auto-request on
 * mount — better UX to let the screen prompt the user explicitly.
 *
 * Mirrors the simple shape used on web's `useGeolocation`-style hooks.
 */
export function useLocation(): UseLocationResult {
  const [position, setPosition] = React.useState<LocationPosition | null>(null);
  const [isGranted, setIsGranted] = React.useState<boolean | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const request = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setIsGranted(granted);
      if (!granted) {
        setError("Location permission denied");
        return;
      }
      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPosition({
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location request failed";
      setError(message);
      console.error("[useLocation]", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { position, isGranted, isLoading, error, request };
}

/** Haversine distance in kilometers between two lat/lon points. */
export function haversineKm(
  a: LocationPosition,
  b: { latitude: number; longitude: number },
): number {
  const R = 6371; // earth radius km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Formats a km distance as "0.4 km" / "12 km" / "320 km". */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(0)} km`;
}
