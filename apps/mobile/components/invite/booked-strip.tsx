import { Linking, Text, View } from "react-native";
import type { Booking } from "@jits/shared/api/invites";
import { BOOKED_COPY, LOCATION_DENIED_COPY } from "@jits/shared/utils";
import { SecondaryButton } from "@/components/auth/auth-buttons";

/** One booked invite match on the Arena (US5): who, and that it starts on the mat. */
export function BookedStrip({ booking, locationOff }: { booking: Booking; locationOff: boolean }) {
  const name = booking.opponent.first_name || booking.opponent.display_name;
  return (
    <View
      testID={`arena-booked-${booking.challenge_id}`}
      accessibilityLiveRegion="polite"
      className="gap-2 border-l-2 border-l-positive bg-surface-2 px-3 py-3"
    >
      <Text className="font-heading text-[12px] uppercase tracking-caps-l text-ink">Booked · vs {name}</Text>
      <Text className="font-body text-[13px] text-ink-2 leading-5">{BOOKED_COPY}</Text>
      {locationOff ? (
        <>
          <Text className="font-body text-[12px] text-ink-3 leading-5">{LOCATION_DENIED_COPY}</Text>
          <SecondaryButton label="Open Settings" onPress={() => void Linking.openSettings()} />
        </>
      ) : null}
    </View>
  );
}
