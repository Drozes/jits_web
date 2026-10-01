import { Alert, Linking, Text, View } from "react-native";
import type { Booking } from "@jits/shared/api/invites";
import {
  ACCURACY_TOO_LOW_COPY,
  ACCURACY_TOO_LOW_STRIP_COPY,
  LOCATION_DENIED_COPY,
  LOCATION_DENIED_STRIP_COPY,
  LOCATION_UNAVAILABLE_COPY,
  LOCATION_UNAVAILABLE_STRIP_COPY,
  bookedMessage,
  bookedStripMessage,
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
 */
export function BookedStrip({
  booking,
  location,
  presence,
  onRetry,
  onAskLocation,
  onCancel,
}: {
  booking: Booking;
  location: BookingLocation;
  presence: BookingPresence | undefined;
  onRetry: () => void;
  onAskLocation: () => void;
  onCancel: () => Promise<CancelBookingResult>;
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

  const fix =
    location === "ask"
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
            : null;
  const blockedReason = presence?.blockedReason ?? null;
  const status = fix
    ? { short: fix.short, full: fix.full }
    : { short: bookedStripMessage(blockedReason, name), full: bookedMessage(blockedReason, name) };

  return (
    <View accessibilityLiveRegion="polite">
      <StripShell rail="neutral" testID={`arena-booked-${booking.challenge_id}`}>
        <View className="flex-1 py-0.5">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-mono-bold text-[11px] text-ink uppercase"
          >
            {`Booked · ${name}`}
          </Text>
          <Text
            testID="booked-message"
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            accessibilityRole={fix ? "alert" : undefined}
            accessibilityLabel={status.full}
            className="font-body text-[11px] leading-4 text-ink-3"
          >
            {status.short}
          </Text>
        </View>
        {fix ? <OutlineAction label={fix.label} accessibilityLabel={fix.a11y} onPress={fix.onPress} /> : null}
        <OutlineAction label="Cancel" accessibilityLabel="Cancel booking" onPress={confirmCancel} />
      </StripShell>
    </View>
  );
}
