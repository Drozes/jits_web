import { Alert, Linking, Text, View } from "react-native";
import type { Booking } from "@jits/shared/api/invites";
import {
  ACCURACY_TOO_LOW_COPY,
  ACCURACY_TOO_LOW_STRIP_COPY,
  LOCATION_DENIED_COPY,
  LOCATION_DENIED_STRIP_COPY,
  LOCATION_UNAVAILABLE_COPY,
  LOCATION_UNAVAILABLE_STRIP_COPY,
  START_AVAILABLE_COPY,
  START_AVAILABLE_STRIP_COPY,
  BOOKED_COPY,
  BOOKED_STRIP_COPY,
  IMPLAUSIBLE_MOVEMENT_COPY,
  bookedMessage,
  bookedStripMessage,
  type StartBookingErrorView,
} from "@jits/shared/utils";
import { MAX_SCALE, OutlineAction, StripShell } from "@/components/arena/strip-primitives";
import type { BookingLocation, BookingPresence, CancelBookingResult } from "@/lib/invites/use-bookings";

/**
 * One booked invite match on the Arena (US5), built on the same strip shell
 * as the challenge strips so it sits at their size: `BOOKED · ALEX`, one
 * short status line (why it has not started: a busy athlete, location off, a
 * coarse reading), a fix when there is one, and Cancel.
 *
 * The status shows a short strip copy (it must fit beside two buttons at
 * 375pt) and carries the full copy as its accessibilityLabel. A location fix
 * takes precedence over the busy line: nothing starts until it is fixed.
 *
 * With `match_location_required` off (`locationRequired` false) there is no
 * location at all: the strip offers Start match (an outline button: red
 * stays GO LIVE) and says why a start was refused, in the same short form.
 */
export function BookedStrip({
  booking,
  location,
  presence,
  onRetry,
  onAskLocation,
  onCancel,
  locationRequired = true,
  onStart,
  starting = false,
  startError = null,
  flagKnown = true,
}: {
  booking: Booking;
  location: BookingLocation;
  presence: BookingPresence | undefined;
  onRetry: () => void;
  onAskLocation: () => void;
  onCancel: () => Promise<CancelBookingResult>;
  /** `match_location_required`; off shows Start match instead of location. */
  locationRequired?: boolean;
  onStart?: () => void;
  /** A Start match tap is in flight. */
  starting?: boolean;
  /** Why the last Start match was refused (short line + full copy). */
  startError?: StartBookingErrorView | null;
  /**
   * `match_location_required` has an answer yet. Until it has, the strip
   * shows only that the match is booked: neither Start match nor a location
   * fix, so a cold start never flashes the wrong variant.
   */
  flagKnown?: boolean;
}) {
  const name = booking.opponent.first_name || booking.opponent.display_name;
  const confirmCancel = () =>
    Alert.alert("Cancel this booking?", `Your match with ${name} won't start.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: async () => {
          // `too_late`: the match started (the face-off opens) or the booking
          // closed (the strip leaves); nothing more to say here.
          const result = await onCancel();
          if (result === "failed") Alert.alert("Couldn't cancel", "Check your connection and try again.");
        },
      },
    ]);

  const fix = !flagKnown || !locationRequired
    ? null
    : location === "ask"
      ? { short: LOCATION_DENIED_STRIP_COPY, full: LOCATION_DENIED_COPY, label: "Enable", a11y: "Turn on location", onPress: onAskLocation }
      : location === "denied"
        ? {
            short: LOCATION_DENIED_STRIP_COPY,
            full: LOCATION_DENIED_COPY,
            label: "Settings",
            a11y: "Open Settings",
            onPress: () => void Linking.openSettings(),
          }
        : location === "unavailable"
          ? { short: LOCATION_UNAVAILABLE_STRIP_COPY, full: LOCATION_UNAVAILABLE_COPY, label: "Retry", a11y: "Try again", onPress: onRetry }
          : presence?.accuracyTooLow
            ? { short: ACCURACY_TOO_LOW_STRIP_COPY, full: ACCURACY_TOO_LOW_COPY, label: "Retry", a11y: "Try again", onPress: onRetry }
            : presence?.implausibleMovement
              ? // Only the athlete's own Retry sends another reading.
                { short: IMPLAUSIBLE_MOVEMENT_COPY, full: IMPLAUSIBLE_MOVEMENT_COPY, label: "Retry", a11y: "Try again", onPress: onRetry }
              : null;
  const blockedReason = presence?.blockedReason ?? null;
  const status = !flagKnown
    ? { short: BOOKED_STRIP_COPY, full: BOOKED_COPY }
    : !locationRequired
    ? startError
      ? { short: startError.short, full: startError.full }
      : { short: START_AVAILABLE_STRIP_COPY, full: START_AVAILABLE_COPY }
    : fix
      ? { short: fix.short, full: fix.full }
      : { short: bookedStripMessage(blockedReason, name), full: bookedMessage(blockedReason, name) };

  return (
    <View accessibilityLiveRegion="polite">
      <StripShell rail="neutral" testID={`arena-booked-${booking.challenge_id}`}>
        <View className="flex-1 py-0.5">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-mono-bold tabular-nums text-caption text-ink uppercase"
          >
            {`Booked · ${name}`}
          </Text>
          <Text
            testID="booked-message"
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            accessibilityRole={fix || startError ? "alert" : undefined}
            accessibilityLabel={status.full}
            className="font-body text-caption leading-4 text-ink-3"
          >
            {status.short}
          </Text>
        </View>
        {fix ? <OutlineAction label={fix.label} accessibilityLabel={fix.a11y} onPress={fix.onPress} /> : null}
        {flagKnown && !locationRequired && onStart ? (
          <OutlineAction
            testID={`arena-booked-start-${booking.challenge_id}`}
            label={starting ? "Starting" : "Start match"}
            accessibilityLabel={`Start match with ${name}`}
            disabled={starting}
            onPress={onStart}
          />
        ) : null}
        <OutlineAction label="Cancel" accessibilityLabel="Cancel booking" onPress={confirmCancel} />
      </StripShell>
    </View>
  );
}
