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
 * Rematch (jits-00fr): see `lib/arena/use-rematch-pin.ts`. Never auto-sends.
 * Someone who goes live after the roster loaded re-reads it
 * (`lib/arena/use-roster-lobby-sync.ts`, jits-hlm1.4).
 */
import * as React from "react";
import { RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useLobbyIds } from "@/lib/arena/use-lobby-presence";
import { useArenaRoster } from "@/lib/arena/use-arena-roster";
import { useRosterLobbySync } from "@/lib/arena/use-roster-lobby-sync";
import { pinFirst, useRematchPin } from "@/lib/arena/use-rematch-pin";
import {
  arenaActions,
  setOpponentUnavailableHandler,
  useArenaState,
  useIsInArenaMatch,
} from "@/lib/arena/arena-store";
import { GoLivePlate } from "@/components/arena/go-live-plate";
import { CompetitorRow, type RowAction } from "@/components/arena/competitor-row";
import { ArenaSkeleton } from "@/components/arena/arena-skeleton";
import {
  CapPlate,
  EmptyLobbyPlate,
  NobodyOnlineNote,
  RematchHint,
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
    isFetching,
    lastReadOk,
    refresh,
    refreshQuietly,
  } = useArenaRoster(athlete?.current_elo ?? 0);

  const rosterIds = React.useMemo(
    () => competitors.map((c) => c.id),
    [competitors],
  );
  // A pushed profile or another tab keeps this screen mounted: read nothing
  // then, and catch up on return.
  const isFocused = useIsFocused();
  useRosterLobbySync({
    rosterIds,
    lobbyIds,
    selfId: athlete?.id ?? null,
    isLive,
    isLoading,
    isFetching,
    lastReadOk,
    enabled: isFocused,
    refresh: refreshQuietly,
  });

  // An opponent who left between the roster load and the tap leaves a stale
  // row behind; re-reading the roster is what corrects it. The challenge hook
  // lives app-wide, so the roster's refresh is handed to it here. An empty id
  // is the stale-challenge sweep (`notifyStaleChallengesCancelled`), which
  // nobody tapped for, so it reads in the background: no spinner, and a
  // failed read keeps the roster instead of swapping in the error plate.
  React.useEffect(() => {
    setOpponentUnavailableHandler((id) => (id ? refresh() : refreshQuietly()));
    return () => setOpponentUnavailableHandler(null);
  }, [refresh, refreshQuietly]);

  useRefreshOnChallengeEnd(
    outgoing?.challengeId ?? null,
    incoming?.challengeId ?? null,
    refreshQuietly,
  );

  const rematch = useRematchPin({
    competitors,
    lobbyIds,
    isLoading,
    refresh: refreshQuietly,
    outgoingOpponentId: outgoing?.opponentId ?? null,
  });

  const online = pinFirst(
    competitors.filter((c) => lobbyIds.has(c.id)),
    rematch.isOnline ? rematch.pinnedId : null,
  );
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
          pinned={inLobby && c.id === rematch.pinnedId}
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

            {!hasError && rematch.pinnedId && !rematch.isOnline ? (
              <RematchHint name={rematch.name} />
            ) : null}

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
                    <NobodyOnlineNote isLive={isLive} />
                  )}
                </View>

                {offline.length > 0 ? (
                  <View className="gap-2">
                    <SectionLabel
                      label="Open to challenges"
                      count={offline.length}
                    />
                    <Text className="font-body text-[12px] text-ink-3">
                      Not in the app right now. They can take a challenge once
                      they open it and go live.
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

/**
 * How long a challenge end waits before its roster read, so a challenge that
 * ended INTO a match (enterMatch clears the slot, then pushes the match
 * screen) is recognised as one and skipped.
 */
const CHALLENGE_END_SETTLE_MS = 300;

/**
 * A challenge that ends without a match (declined, cancelled, expired,
 * withdrawn) leaves its "Pending" tag on the roster row: that tag comes from
 * `challengedIds` in the last roster read, and nothing in those paths reads
 * the roster again. So re-read it, quietly, when either slot goes from a
 * challenge to empty. Skipped when the end was a match: the match-exit read
 * (`useArenaRoster`) covers that one.
 */
function useRefreshOnChallengeEnd(
  outgoingId: string | null,
  incomingId: string | null,
  refreshQuietly: () => void,
): void {
  const inMatch = useIsInArenaMatch();
  const inMatchRef = React.useRef(inMatch);
  inMatchRef.current = inMatch;
  const prev = React.useRef({ outgoingId, incomingId });
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  React.useEffect(() => {
    const was = prev.current;
    prev.current = { outgoingId, incomingId };
    const ended =
      (!!was.outgoingId && !outgoingId) || (!!was.incomingId && !incomingId);
    if (!ended || inMatchRef.current || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!inMatchRef.current) refreshQuietly();
    }, CHALLENGE_END_SETTLE_MS);
  }, [outgoingId, incomingId, refreshQuietly]);

  React.useEffect(() => {
    if (inMatch) cancel();
  }, [inMatch, cancel]);

  React.useEffect(() => cancel, [cancel]);
}
