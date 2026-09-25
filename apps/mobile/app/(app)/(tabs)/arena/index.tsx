/**
 * The Arena: go live, see who else is, challenge them, roll.
 *
 * Mirrors the shipped web surface (`apps/web/app/(app)/arena/`). The roster
 * splits on two different signals: "Online now" is Presence (`lobby:online`),
 * "Open to challenges" is the `looking_for_ranked` column. Only the first can
 * answer a live prompt, so only those rows carry a Challenge.
 *
 * This screen OWNS NOTHING realtime. Being live persists across tabs, so the
 * live state machine, the `lobby:online` channel and the incoming-challenge
 * listener and prompt are mounted once, app-wide, by `<ArenaBootstrap />`
 * (`lib/arena/arena-bootstrap.tsx`), and this screen reads and drives them
 * through `lib/arena/arena-store.ts`. Mounting any of them here as well would
 * mean a second flag writer and a second prompt for every challenge.
 * Observing the lobby is not joining it: an athlete is only tracked in
 * `lobby:online` while they are live.
 */
import * as React from "react";
import { RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useLobbyIds } from "@/lib/arena/use-lobby-presence";
import { useArenaRoster } from "@/lib/arena/use-arena-roster";
import {
  arenaActions,
  setOpponentUnavailableHandler,
  useArenaState,
} from "@/lib/arena/arena-store";
import { GoLivePlate } from "@/components/arena/go-live-plate";
import { CompetitorRow, type RowAction } from "@/components/arena/competitor-row";
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

  const lobbyIds = useLobbyIds();
  const { isLive, isSaving, incoming, outgoing, isBusy, capReached } =
    useArenaState();
  const { toggle, sendChallenge, cancelOutgoing, clearCap } = arenaActions;

  const {
    competitors,
    challengedIds,
    isLoading,
    isRefreshing,
    hasError,
    refresh,
  } = useArenaRoster(athlete?.current_elo ?? 0);

  // An opponent who left between the roster load and the tap leaves a stale
  // row behind; re-reading the roster is what corrects it. The challenge hook
  // lives app-wide, so the roster's refresh is handed to it here.
  React.useEffect(() => {
    setOpponentUnavailableHandler(refresh);
    return () => setOpponentUnavailableHandler(null);
  }, [refresh]);

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
        <AppHeader title="Arena" liveSignal="static" />
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
        liveSignal="static"
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
    </View>
  );
}
