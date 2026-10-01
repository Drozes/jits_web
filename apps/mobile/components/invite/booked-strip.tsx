import { Alert, Linking, Text, View } from "react-native";
import type { Booking } from "@jits/shared/api/invites";
import {
  ACCURACY_TOO_LOW_COPY,
  LOCATION_DENIED_COPY,
  LOCATION_UNAVAILABLE_COPY,
  bookedMessage,
} from "@jits/shared/utils";
import { SecondaryButton, TertiaryButton } from "@/components/auth/auth-buttons";
import type { BookingLocation, BookingPresence } from "@/lib/invites/use-bookings";

/**
 * One booked invite match on the Arena (US5): who, why it has not started
 * (a busy athlete, location off, a coarse reading), and a way out (cancel).
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
  onCancel: () => Promise<boolean>;
}) {
  const name = booking.opponent.first_name || booking.opponent.display_name;
  const confirmCancel = () =>
    Alert.alert("Cancel this booking?", `Your match with ${name} won't start.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: async () => {
          const ok = await onCancel();
          if (!ok) Alert.alert("Couldn't cancel", "Check your connection and try again.");
        },
      },
    ]);

  return (
    <View
      testID={`arena-booked-${booking.challenge_id}`}
      accessibilityLiveRegion="polite"
      className="gap-2 border-l-2 border-l-positive bg-surface-2 px-3 py-3"
    >
      <Text className="font-heading text-[12px] uppercase tracking-caps-l text-ink">Booked · vs {name}</Text>
      <Text testID="booked-message" className="font-body text-[13px] text-ink-2 leading-5">
        {bookedMessage(presence?.blockedReason ?? null, name)}
      </Text>

      {location === "ask" ? (
        <>
          <Text className="font-body text-[12px] text-ink-3 leading-5">{LOCATION_DENIED_COPY}</Text>
          <SecondaryButton label="Turn on location" onPress={onAskLocation} />
        </>
      ) : location === "denied" ? (
        <>
          <Text className="font-body text-[12px] text-ink-3 leading-5">{LOCATION_DENIED_COPY}</Text>
          <SecondaryButton label="Open Settings" onPress={() => void Linking.openSettings()} />
        </>
      ) : location === "unavailable" ? (
        <>
          <Text className="font-body text-[12px] text-ink-3 leading-5">{LOCATION_UNAVAILABLE_COPY}</Text>
          <SecondaryButton label="Try again" onPress={onRetry} />
        </>
      ) : presence?.accuracyTooLow ? (
        <>
          <Text accessibilityRole="alert" className="font-body text-[12px] text-ink-3 leading-5">
            {ACCURACY_TOO_LOW_COPY}
          </Text>
          <SecondaryButton label="Try again" onPress={onRetry} />
        </>
      ) : null}

      <TertiaryButton label="Cancel booking" onPress={confirmCancel} className="self-start px-0 py-1" />
    </View>
  );
}
