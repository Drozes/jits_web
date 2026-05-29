/**
 * Presentational sub-components for the gym detail (E2) screen.
 *
 * These all assume the parent has loaded gym data via getGymDetail() and only
 * deal with layout. They live alongside the route file so the screen file
 * stays under the 200-line target. All styling uses ELO design tokens.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  DataRow,
  EloTile,
  LivePill,
  MetaTag,
  ParticipantRow,
  Plate,
} from "@/components/ui/elo-system";
import type { SessionListItem } from "@jits/shared/types/session";

interface GymTitleBlockProps {
  name: string;
  address: string;
  isMyGym: boolean;
  distanceLabel: string | null;
  memberLabel: string;
  showLocationCta: boolean;
  locationLoading: boolean;
  onRequestLocation: () => void;
}

export function GymTitleBlock({
  name,
  address,
  isMyGym,
  distanceLabel,
  memberLabel,
  showLocationCta,
  locationLoading,
  onRequestLocation,
}: GymTitleBlockProps) {
  const addressLine = distanceLabel ? `${address} · ${distanceLabel}` : address;
  return (
    <View className="gap-1">
      <Text
        className="font-heading text-[26px] text-ink leading-[30px]"
        numberOfLines={2}
      >
        {name}
      </Text>
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {addressLine.toUpperCase()}
        {isMyGym ? " · My Gym" : ""}
      </Text>
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-1">
        {memberLabel}
      </Text>
      {showLocationCta ? (
        <Pressable
          onPress={onRequestLocation}
          accessibilityRole="button"
          className="mt-2 rounded-xs border border-dashed border-hairline p-3 bg-surface-3"
        >
          <Text className="font-mono-bold text-[10px] text-cta uppercase tracking-caps-l">
            {locationLoading ? "Locating..." : "Enable Location"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ActiveSessionPlate({ session }: { session: SessionListItem }) {
  const router = useRouter();
  const capacity = session.maxParticipants
    ? `${session.participantCount}/${session.maxParticipants} in lobby`
    : `${session.participantCount} in lobby`;
  const target = `/session/${session.id}/join` as const;
  return (
    <Plate variant="live">
      <View className="flex-row items-center justify-between gap-3 mb-3">
        <LivePill label="Session Live" />
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
          {capacity}
        </Text>
      </View>
      <Pressable
        onPress={() => router.push(target)}
        accessibilityRole="button"
        className="bg-cta rounded-sm py-3 px-5 items-center justify-center active:bg-cta-hover"
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          Join Lobby →
        </Text>
      </Pressable>
    </Plate>
  );
}

interface UpcomingSessionsSectionProps {
  sessions: SessionListItem[];
  rsvpSet: Set<string>;
  participantSet: Set<string>;
}

export function UpcomingSessionsSection({
  sessions,
  rsvpSet,
  participantSet,
}: UpcomingSessionsSectionProps) {
  return (
    <View className="gap-2">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        Upcoming ELO Sessions
      </Text>
      {sessions.length === 0 ? (
        <View className="rounded-xs border border-dashed border-hairline p-4 bg-surface-3 items-center">
          <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
            No Sessions Scheduled
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {sessions.slice(0, 3).map((s) => (
            <UpcomingSessionRow
              key={s.id}
              session={s}
              isRsvpd={rsvpSet.has(s.id)}
              isParticipant={participantSet.has(s.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function UpcomingSessionRow({
  session,
  isRsvpd,
  isParticipant,
}: {
  session: SessionListItem;
  isRsvpd: boolean;
  isParticipant: boolean;
}) {
  const router = useRouter();
  const start = new Date(session.scheduledStart);
  const dayTime = start.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
  });
  const fullDate = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const attending = session.rsvpCount + session.participantCount;
  const subtitle = `${fullDate} · ${attending} attending`;
  const going = isRsvpd || isParticipant;

  // Tap row → open the join wizard (handles RSVP + check-in). Already-RSVP'd
  // athletes still go through join so they can confirm weight before lobby.
  const onPress = () => router.push(`/session/${session.id}/join`);

  return (
    <ParticipantRow
      name={dayTime}
      subtitle={subtitle}
      onPress={onPress}
      action={
        <View
          className={
            going
              ? "px-3 py-1.5 rounded-xs bg-cta"
              : "px-3 py-1.5 rounded-xs border border-hairline-strong bg-surface-3"
          }
        >
          <Text
            className={
              going
                ? "font-heading text-[10px] text-ink-on-cta uppercase tracking-caps"
                : "font-heading text-[10px] text-ink uppercase tracking-caps"
            }
          >
            {going ? "✓ Going" : "Attend"}
          </Text>
        </View>
      }
    />
  );
}

export function StatsGrid({
  avgPerSession,
  avgElo,
}: {
  avgPerSession: string;
  avgElo: string;
}) {
  return (
    <View className="flex-row gap-3">
      <View className="flex-1">
        <EloTile label="Avg Session" value={avgPerSession} size="medium" />
      </View>
      <View className="flex-1">
        <EloTile label="Avg ELO" value={avgElo} size="medium" />
      </View>
    </View>
  );
}

export function LastSessionPlate() {
  return (
    <View>
      <View className="mb-3">
        <MetaTag>Last Session · —</MetaTag>
      </View>
      <Plate>
        <View className="flex-row flex-wrap">
          <View className="w-1/2 pr-2 py-1">
            <DataRow label="Attendees" value="—" />
          </View>
          <View className="w-1/2 pl-2 py-1">
            <DataRow label="Avg Matches" value="—" />
          </View>
          <View className="w-1/2 pr-2 py-1">
            <DataRow label="ELO Range" value="—" />
          </View>
          <View className="w-1/2 pl-2 py-1">
            <DataRow label="Median" value="—" />
          </View>
        </View>
      </Plate>
    </View>
  );
}
