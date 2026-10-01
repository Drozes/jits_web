/**
 * One fresh foreground location reading for the invite proximity check
 * (contract 6: `Accuracy.High`, 10 s timeout). Never throws; coordinates are
 * sent to the server once and never stored on the device.
 */
import * as Location from "expo-location";
import type { LocationReading } from "@jits/shared/api/invites";

export type ReadingResult =
  | { status: "ok"; reading: LocationReading }
  | { status: "denied" }
  | { status: "unavailable" };

const TIMEOUT_MS = 10_000;

export async function readLocationOnce(opts: { ask: boolean } = { ask: true }): Promise<ReadingResult> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    let granted = current.granted;
    if (!granted && opts.ask && current.canAskAgain) {
      granted = (await Location.requestForegroundPermissionsAsync()).granted;
    }
    if (!granted) return { status: "denied" };
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (!position) return { status: "unavailable" };
    const accuracy = position.coords.accuracy;
    return {
      status: "ok",
      reading: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        // A missing accuracy is treated as too coarse; the server answers accuracy_too_low.
        accuracyM: typeof accuracy === "number" && accuracy > 0 ? accuracy : 1000,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}
