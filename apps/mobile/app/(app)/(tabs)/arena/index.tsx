/**
 * The Arena: go live, see who else is, challenge them, roll.
 *
 * Mirrors the shipped web surface (`apps/web/app/(app)/arena/`). The roster
 * splits on two different signals: "Online now" is Presence (`lobby:online`),
 * "Open to challenges" is the `looking_for_ranked` column. Only the first can
 * answer a live prompt, so only those rows carry a Challenge.
 *
 * `lobby:online` is mounted HERE rather than in the app layout. On web that
 * was a hydration workaround; on React Native the reason is lifetime. The
 * channel and the database flag have to rise and fall together (see
 * `lib/arena/use-arena-live.ts`), and this screen is the only thing whose life
 * matches when an athlete is actually in the Arena. Mounting it app-wide would
 * keep every signed-in athlete in the matchmaking lobby for as long as the app
 * was open.
 */
import * as React from "react";
import { RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useLobbyIds, useLobbyPresence } from "@/lib/arena/use-lobby-presence";
import { useArenaLive } from "@/lib/arena/use-arena-live";
import { useArenaRoster } from "@/lib/arena/use-arena-roster";
import { useArenaChallenge } from "@/lib/arena/use-arena-challenge";
import { GoLivePlate } from "@/components/arena/go-live-plate";
import { CompetitorRow, type RowAction } from "@/components/arena/competitor-row";
import { ChallengePromptSheet } from "@/components/arena/challenge-prompt-sheet";
import { ArenaSkeleton } from "@/components/arena/arena-skeleton";
import {
  CapPlate,
  EmptyLobbyPlate,
  NobodyOnlineNote,
  RosterErrorPlate,
  SectionLabel,
  WaitingPlate,
} from "@/components/arena/arena-plates";

export default function ArenaScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();

  const athleteId = athlete?.id ?? "";
  useLobbyPresence(athleteId);
  const lobbyIds = useLobbyIds();

  const { isLive, isSaving, toggle } = useArenaLive({
    athleteId,
    displayName: athlete?.display_name ?? "",
    currentElo: athlete?.current_elo ?? 0,
    initialRanked: athlete?.looking_for_ranked ?? false,
  });

  const {
    competitors,
    challengedIds,
    isLoading,
    isRefreshing,
    hasError,
    refresh,
  } = useArenaRoster(athlete?.current_elo ?? 0);

  const {
    incoming,
    outgoing,
    isBusy,
    capReached,
    sendChallenge,
    accept,
    decline,
    cancelOutgoing,
    clearCap,
  } = useArenaChallenge({
    athleteId,
    athleteWeight: athlete?.current_weight ?? null,
  });

  const online = competitors.filter((c) => lobbyIds.has(c.id));
  const offline = competitors.filter((c) => !lobbyIds.has(c.id));

  // One challenge at a time: a second outgoing prompt while one is unanswered
  // would give the athlete two matches to walk into.
  const actionsLocked = isBusy || !!outgoing || !!incoming;

  const actionFor = React.useCallback(
    (id: string, acceptsRanked: boolean, inLobby: boolean): RowAction => {
      if (!inLobby) return { kind: "none" };
      if (challengedIds.has(id) || outgoing?.opponentId === id) {
        return { kind: "pending" };
      }
      if (!acceptsRanked) return { kind: "casual-only" };
      if (!isLive) return { kind: "go-live" };
      if (capReached) return { kind: "capped" };
      return { kind: "challenge" };
    },
    [challengedIds, outgoing, isLive, capReached],
  );

  const renderRow = (inLobby: boolean) =>
    function Row(c: (typeof competitors)[number]) {
      return (
        <CompetitorRow
          key={c.id}
          competitor={c}
          inLobby={inLobby}
          action={actionFor(c.id, c.acceptsRanked, inLobby)}
          disabled={actionsLocked || isSaving}
          onChallenge={() => void sendChallenge(c.id, c.displayName)}
          onGoLive={() => void toggle()}
          onOpenProfile={() => router.push(`/athlete/${c.id}`)}
        />
      );
    };

  if (authLoading || !athlete) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Arena" />
        <PageContainer contentContainerStyle={{ paddingTop: 16 }}>
          <ArenaSkeleton />
        </PageContainer>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader
        title="Arena"
        rightAction={<NotificationBell athleteId={athlete.id} />}
      />

      <PageContainer
        contentContainerStyle={{ paddingTop: 16, gap: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={tokens.accentCta}
          />
        }
      >
        {isLoading ? (
          <ArenaSkeleton />
        ) : (
          <>
            {outgoing ? (
              <WaitingPlate
                name={outgoing.opponentName}
                onCancel={() => void cancelOutgoing()}
                disabled={isBusy}
              />
            ) : (
              <GoLivePlate
                isLive={isLive}
                isSaving={isSaving}
                onToggle={() => void toggle()}
              />
            )}

            {capReached ? <CapPlate onDismiss={clearCap} /> : null}

            {hasError ? <RosterErrorPlate onRetry={refresh} /> : null}

            {!hasError && competitors.length === 0 ? (
              <EmptyLobbyPlate isLive={isLive} />
            ) : null}

            {competitors.length > 0 ? (
              <>
                {/* Rendered even at zero so the split stays learnable instead
                    of the page silently losing its structure. */}
                <View className="gap-2">
                  <SectionLabel label="Online now" count={online.length} />
                  {online.length > 0 ? (
                    online.map(renderRow(true))
                  ) : (
                    <NobodyOnlineNote />
                  )}
                </View>

                {offline.length > 0 ? (
                  <View className="gap-2">
                    <SectionLabel
                      label="Open to challenges"
                      count={offline.length}
                    />
                    <Text className="font-body text-[12px] text-ink-3">
                      Not in the app right now, so they cannot answer a live
                      challenge.
                    </Text>
                    {offline.map(renderRow(false))}
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </PageContainer>

      <ChallengePromptSheet
        challenge={incoming}
        busy={isBusy}
        onAccept={() => void accept()}
        onDecline={() => void decline()}
      />
    </View>
  );
}
