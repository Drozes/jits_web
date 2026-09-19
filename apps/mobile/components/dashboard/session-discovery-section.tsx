import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Plate } from "@/components/ui/elo-system";
import { GymCard } from "@/components/gyms/gym-card";
import {
  ActiveSessionPlate,
  UpcomingSessionsSection,
} from "@/components/gyms/gym-detail-parts";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { GymListItem, SessionListItem } from "@jits/shared/types/session";

export interface SessionDiscoverySectionProps {
  /** The athlete's primary gym, or null for a free agent. */
  gymId: string | null;
  gymName: string | null;
  /** Live + upcoming sessions at the primary gym (empty for a free agent). */
  sessions: SessionListItem[];
  rsvpSessionIds: string[];
  participantSessionIds: string[];
  /**
   * Gyms that currently have a live session, used only on the free-agent path
   * (an athlete with a primary gym is pointed at their own gym instead).
   */
  liveGyms: GymListItem[];
}

/**
 * Home's gym + session discovery surface.
 *
 * This is the app's ONLY path to a new session now that the Gyms tab is gone:
 * before this existed, finding a session meant Gyms tab, gym detail, join, so
 * removing the tab without it would strand every athlete who is not already in
 * a session. It covers both jobs the tab did, find a session and find a gym:
 *
 *   - member with sessions at their gym: the live one gets the join plate, the
 *     scheduled ones get the same attend rows the gym detail screen uses, so the
 *     join flow (/session/[id]/join) is one tap from Home;
 *   - member with no sessions: UpcomingSessionsSection says so in its own empty
 *     state, and the gym list is still one tap away;
 *   - free agent with no primary gym: a plate explaining the gap, the gyms that
 *     are live right now, and the same browse action.
 *
 * The active-session card renders ABOVE this on Home and keeps its priority: an
 * athlete already in a session sees that first, and this is the next thing down.
 */
export function SessionDiscoverySection({
  gymId,
  gymName,
  sessions,
  rsvpSessionIds,
  participantSessionIds,
  liveGyms,
}: SessionDiscoverySectionProps) {
  const router = useRouter();
  const tokens = useThemedTokens();

  const rsvpSet = React.useMemo(() => new Set(rsvpSessionIds), [rsvpSessionIds]);
  const participantSet = React.useMemo(
    () => new Set(participantSessionIds),
    [participantSessionIds],
  );

  const activeSession = React.useMemo(
    () => sessions.find((s) => s.status === "active") ?? null,
    [sessions],
  );
  const upcomingSessions = React.useMemo(
    () => sessions.filter((s) => s.status !== "active"),
    [sessions],
  );

  const isFreeAgent = !gymId;
  const hasNothingAtMyGym = !isFreeAgent && sessions.length === 0;

  return (
    <View className="gap-3">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        Find A Session
      </Text>

      {isFreeAgent ? (
        <>
          <Plate variant="accent">
            <Text className="font-body text-[14px] text-ink leading-[22px]">
              You haven{"’"}t set a home gym yet. Browse partner gyms to find one
              near you, then join a session to get your first ranked match on the
              board.
            </Text>
          </Plate>

          {liveGyms.length > 0 ? (
            <View className="gap-2">
              <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
                Live Right Now
              </Text>
              {liveGyms.slice(0, 3).map((gym) => (
                <GymCard key={gym.id} gym={gym} isMyGym={false} />
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <>
          {activeSession ? <ActiveSessionPlate session={activeSession} /> : null}

          <UpcomingSessionsSection
            sessions={upcomingSessions}
            rsvpSet={rsvpSet}
            participantSet={participantSet}
          />

          {hasNothingAtMyGym ? (
            <Text className="font-body text-[12px] text-ink-3 leading-[18px]">
              Nothing scheduled at {gymName ?? "your gym"} right now. Other gyms
              in your city may be running sessions.
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${gymName ?? "my gym"}`}
            onPress={() => router.push(`/gyms/${gymId}`)}
            className="flex-row items-center justify-between rounded-xs border border-hairline bg-surface-3 px-4 py-3 active:bg-surface-4"
          >
            <Text
              numberOfLines={1}
              className="font-heading text-[13px] text-ink uppercase tracking-caps flex-1"
            >
              {gymName ?? "My Gym"}
            </Text>
            <View pointerEvents="none">
              <ChevronRight size={16} color={tokens.textSecondary} />
            </View>
          </Pressable>
        </>
      )}

      {/*
        Always present, whichever branch rendered: the gym list is the wider net
        and the only way to reach a gym other than the athlete's own. It is the
        primary (Signal-Red) action exactly when there is nothing closer to tap.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Browse gyms"
        onPress={() => router.push("/gyms")}
        className={
          isFreeAgent || hasNothingAtMyGym
            ? "bg-cta rounded-sm py-3 px-5 items-center justify-center active:bg-cta-hover"
            : "rounded-sm border border-hairline-strong bg-surface-3 py-3 px-5 items-center justify-center active:bg-surface-4"
        }
      >
        <Text
          className={
            isFreeAgent || hasNothingAtMyGym
              ? "font-heading text-[13px] text-ink-on-cta uppercase tracking-caps"
              : "font-heading text-[13px] text-ink uppercase tracking-caps"
          }
        >
          Browse Gyms
        </Text>
      </Pressable>
    </View>
  );
}
