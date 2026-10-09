/**
 * The Arena, as a Mat Board (spec arena-live-chip section 6): who should I
 * roll with right now? Sticky control bar, the challenge strips, the Closest
 * Match card (the surface's one red CTA) and On The Mat, with the invite actions
 * pinned above the tab bar. Rules
 * live in `lib/arena/mat-board.ts`, pieces in `components/arena/mat-board.tsx`.
 *
 * On The Mat is the roster (`get_arena_data.looking_athletes`) intersected
 * with `lobby:online`, self excluded; online athletes only (spec 14, D1), and
 * every number on the screen and the chip's `· N` comes from those rows (D2).
 * With `match_location_required` on and a usable location (jr_be 016
 * addendum, `get_arena_nearby`), those rows split further: On the mat is only
 * the athletes on my mat, "Online & close" the live ones within 2 km.
 *
 * This screen owns nothing realtime: the live state, the lobby channel and
 * the incoming prompt are mounted once by `<ArenaBootstrap />` and read here
 * through `arena-store.ts`. A second mount would mean a second flag writer
 * and a second prompt per challenge.
 */
import * as React from "react";
import { RefreshControl, View } from "react-native";
import Animated from "react-native-reanimated";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { BrandHeader } from "@/components/layout/brand-header";
import { PageContainer } from "@/components/layout/page-container";
import { useLobbyIds, useLobbyKnown } from "@/lib/arena/use-lobby-presence";
import { useArenaRoster } from "@/lib/arena/use-arena-roster";
import { useRosterLobbySync } from "@/lib/arena/use-roster-lobby-sync";
import { goLiveWithFeedback, goOfflineWithFeedback } from "@/lib/arena/go-live-feedback";
import { useChallengeDeepLink } from "@/lib/arena/use-challenge-deep-link";
import { openMatchToConfirm } from "@/lib/arena/open-match-to-confirm";
import {
  chooseStrip,
  closestCta,
  formatMatCounts,
  matCounts,
  onTheMatRows,
  partitionNearby,
  pickClosest,
} from "@/lib/arena/mat-board";
import { useArenaNearby } from "@/lib/arena/use-arena-nearby";
import { OnlineCloseSection } from "@/components/arena/online-close-section";
import { useMatchToConfirm } from "@/lib/match-flow/active-match-store";
import { useFreshIncomingCount } from "@/lib/notifications/bell-store";
import {
  arenaActions,
  setOpponentUnavailableHandler,
  clearOpponentUnavailableHandler,
  useArenaState,
  publishNearbyOnMatCount,
  useIsInArenaMatch,
  useCanGoLive,
  useCanGoOffline,
  useGoLiveDisplay,
  useLiveSurface,
  useLiveSwitchDirection,
  useLiveSwitchPhase,
} from "@/lib/arena/arena-store";
import {
  ClosestMatchCard,
  ConfirmStrip,
  IncomingStrip,
  MatControlBar,
  MatRow,
  MatSectionLabel,
  OfferStrip,
  AwayStrip,
  WaitingStrip,
  type MatRowAction,
} from "@/components/arena/mat-board";
import { ArenaSkeleton } from "@/components/arena/arena-skeleton";
import { OnAirStrip } from "@/components/arena/on-air-strip";
import { useFirstLoadEntering } from "@/lib/motion";
import { CapPlate, RosterErrorPlate } from "@/components/arena/arena-plates";
import { Button } from "@/components/ui/elo-system/button";
import { toast, useToastBelowScreenBar } from "@/components/ui/toast";
import { MAT_CONTROL_BAR_HEIGHT } from "@/components/arena/mat-board";
import { BookedStrip } from "@/components/invite/booked-strip";
import { sortFriendsFirst } from "@jits/shared/api/friends";
import { useFriendIds } from "@/lib/invites/use-friend-ids";
import { useInvitesEnabled } from "@/lib/invites/use-invites-enabled";
import { useBookings } from "@/lib/invites/use-bookings";
import { loadMatchLocationRequired, useMatchLocationFlag } from "@/lib/arena/match-location-flag";
import { arenaMatchHref } from "@/lib/arena/constants";

/**
 * The tab bar sits below the screen and pads its own inset, so the shared
 * `PageContainer` default (96 + inset) would leave blank space (AC-A7).
 */
const ARENA_BOTTOM_PAD = 24;


export default function ArenaScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();

  const lobbyIds = useLobbyIds();
  const selfElo =
    typeof athlete?.current_elo === "number" && Number.isFinite(athlete.current_elo)
      ? athlete.current_elo
      : null;
  const {
    isLive,
    isSaving,
    incoming,
    incomingCount,
    incomingTucked,
    outgoing,
    isBusy,
    capReached,
  } = useArenaState();
  const { sendChallenge, cancelOutgoing, clearCap } = arenaActions;
  // A transition in flight (for Challenge only): a live choice itself is
  // never locked (review round 3).
  const switchPhase = useLiveSwitchPhase();
  // Any live transition in flight, from any surface: no Challenge meanwhile.
  const liveSaving = switchPhase === "saving";
  const switchDirection = useLiveSwitchDirection();
  const goingLive = switchDirection === "going-live";
  // What the live surfaces draw while a go-live resolves (UX 019): green on
  // the tap with a valid tag, nothing pending for the first 240 ms.
  const liveDisplay = useGoLiveDisplay();
  // Live and pending from ONE store snapshot, shared with the header chip
  // (round 5): the bar and the chip never read different frames.
  const surface = useLiveSurface();
  const displayLive = surface.drawnLive;
  // Both choices are always open with an owner mounted (review round 3).
  const canGoLive = useCanGoLive();
  const canGoOffline = useCanGoOffline();
  const switchLocked = !canGoLive;
  // The athlete chose live and it is on its way (QA 4): LIVE shows pending,
  // OFFLINE stays selectable.
  const livePending = surface.pending;
  const confirm = useMatchToConfirm(athlete?.id ?? null);

  const {
    competitors,
    challengedIds,
    isLoading,
    isRefreshing,
    hasError,
    isFetching,
    lastReadOk,
    hasRoster,
    refresh,
    refreshQuietly,
  } = useArenaRoster(athlete?.current_elo ?? 0);

  const rosterIds = React.useMemo(() => competitors.map((c) => c.id), [competitors]);
  // Unfocused (another tab or a pushed profile), read nothing; catch up on return.
  const isFocused = useIsFocused();
  // Toasts sit below the sticky control bar here, never over OFFLINE / LIVE (QA C).
  useToastBelowScreenBar(isFocused, MAT_CONTROL_BAR_HEIGHT);
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

  // An opponent who left leaves a stale row: the app-wide challenge hook
  // re-reads the roster through this. An empty id is the background stale
  // sweep, which nobody tapped for, so it reads quietly.
  React.useEffect(() => {
    const handler = (id: string) => (id ? refresh() : refreshQuietly());
    setOpponentUnavailableHandler(handler);
    return () => clearOpponentUnavailableHandler(handler);
  }, [refresh, refreshQuietly]);

  useRefreshOnChallengeEnd(
    outgoing?.challengeId ?? null,
    incoming?.challengeId ?? null,
    refreshQuietly,
  );

  const lobbyKnown = useLobbyKnown();
  const freshIncomingCount = useFreshIncomingCount();
  // A challenge push: `?challenge=<id>` (AC-A8).
  const deepLink = useChallengeDeepLink({
    athleteId: athlete?.id ?? null,
    isLive,
    incoming,
    incomingTucked,
    lobbyIds,
    lobbyKnown,
    // The Arena tab's red count source (AC-T1): offline, an offer strip backs it.
    freshIncomingCount,
  });
  const offer = deepLink.offer;

  // While the lobby is unknown (down or rejoining) keep the last known rows
  // rather than claiming the mat emptied. Challenges are refused meanwhile
  // (use-arena-challenge), so a stale row cannot send.
  const lastKnownLobbyRef = React.useRef<Set<string>>(lobbyIds);
  if (lobbyKnown) lastKnownLobbyRef.current = lobbyIds;
  const matLobbyIds = lobbyKnown ? lobbyIds : lastKnownLobbyRef.current;

  // Closest first, strictly (AC-A4).
  const selfId = athlete?.id ?? null;
  const lobbyRows = React.useMemo(
    () => onTheMatRows(competitors, matLobbyIds, selfId),
    [competitors, matLobbyIds, selfId],
  );
  // Invites + friends (jr_be spec 016): friends sort first in the list (the
  // closest-match pick above stays strictly closest), and a friend_live push
  // (`?athlete=<id>`) puts that friend on top, one tap from a challenge.
  const { athlete: focusAthleteId } = useLocalSearchParams<{ athlete?: string }>();
  const friendIds = useFriendIds(selfId);
  const { required: locationRequired, known: flagKnown } = useMatchLocationFlag();
  // The owner may flip the flag while the app is open: re-read it each time
  // the Arena gains focus (server replies flip it in between).
  React.useEffect(() => {
    if (isFocused) void loadMatchLocationRequired();
  }, [isFocused]);
  // On the mat by proximity (jr_be 016 addendum): with the flag on and a
  // usable location, On the mat is only the athletes on my mat, and the live
  // ones within 2 km are "Online & close". Otherwise today's list.
  const lobbyKey = React.useMemo(() => [...lobbyIds].sort().join(","), [lobbyIds]);
  const nearbyView = useArenaNearby({ focused: isFocused, isLive, locationRequired, lobbyKey });
  const nearby = React.useMemo(
    () => partitionNearby(lobbyRows, nearbyView, friendIds),
    [lobbyRows, nearbyView, friendIds],
  );
  const onTheMat = nearby.onTheMat;
  const matRows = React.useMemo(() => {
    const sorted = sortFriendsFirst(onTheMat, (c) => c.id, friendIds);
    if (!focusAthleteId) return sorted;
    return sortFriendsFirst(sorted, (c) => c.id, new Set([focusAthleteId]));
  }, [onTheMat, friendIds, focusAthleteId]);
  // The label names the order: friends lead the list when any are on the mat.
  const matHasFriend = React.useMemo(() => onTheMat.some((c) => friendIds.has(c.id)), [onTheMat, friendIds]);
  const invitesOn = useInvitesEnabled();
  const inMatch = useIsInArenaMatch();
  const booked = useBookings({
    visible: isFocused,
    // Unknown (cold start): neither location readings nor Start match.
    locationRequired: flagKnown ? locationRequired : null,
    onStarted: (matchId) => {
      if (!inMatch) router.push(arenaMatchHref(matchId) as Href);
    },
    onClosed: (message) => toast.info(message),
  });
  // Counts from exactly these rows (D2); unknown while the rows are a
  // placeholder (roster not loaded) or a last-known snapshot (lobby unknown).
  const { onMat, inBand } = matCounts(
    hasRoster && lobbyKnown ? onTheMat : null,
    selfElo !== null,
  );
  // The chip's `· N` is these same rows (D2): in nearby mode only my mat.
  useNearbyOnMatCountPublisher(nearby.mode === "nearby", onMat);
  // Never suggest someone a challenge is already pending with, either way.
  const outgoingOpponentId = outgoing?.opponentId ?? null;
  const closest = React.useMemo(
    () =>
      pickClosest(onTheMat, (c) => challengedIds.has(c.id) || outgoingOpponentId === c.id),
    [onTheMat, challengedIds, outgoingOpponentId],
  );

  const strip = chooseStrip({
    hasIncoming: !!incoming,
    incomingTucked,
    hasOutgoing: !!outgoing,
    hasOffer: !!offer,
    hasConfirm: !!confirm,
  });
  const cta = closestCta({
    isLive,
    hasClosest: !!closest,
    hasIncoming: !!incoming,
    hasOutgoing: !!outgoing,
    // The offer owns red only while its strip is the one showing.
    hasOffer: strip.challenge === "offer",
    capped: capReached,
  });

  // On the mat rows rise in on the FIRST load only (list enter stagger).
  const enterRow = useFirstLoadEntering();

  // Countdowns tick in leaf components, only while this tab is focused.
  const ticking = isFocused;

  // One challenge at a time.
  const actionsLocked = isBusy || !!outgoing || !!incoming;

  // Every match is ranked and `get_arena_data` lists only athletes with
  // `looking_for_ranked`, so every on-mat row falls through to Roll / Sent.
  const actionFor = (id: string): MatRowAction => {
    if (outgoing?.opponentId === id) return { kind: "sent", source: outgoing, active: ticking };
    if (challengedIds.has(id)) return { kind: "pending" };
    if (!isLive) return { kind: "go-live" };
    if (capReached) return { kind: "capped" };
    return { kind: "roll" };
  };

  // Guarded and non-reversing, never a toggle.
  const goLive = () => void goLiveWithFeedback();
  const openProfile = (id: string) => router.push(`/athlete/${id}`);

  if (authLoading || !athlete) {
    return (
      <View className="flex-1 bg-surface">
        <BrandHeader title="Arena" onArena />
        <PageContainer contentContainerStyle={{ paddingTop: 16, paddingBottom: ARENA_BOTTOM_PAD }}>
          <ArenaSkeleton />
        </PageContainer>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <BrandHeader title="Arena" onArena />

      {/* Outside the scroll view, so it stays put (sticky, AC-A1). */}
      <MatControlBar
        isLive={displayLive}
        locked={!canGoLive}
        offlineLocked={!canGoOffline}
        saving={isSaving || liveSaving}
        goingLive={goingLive && liveDisplay !== "hold"}
        pending={livePending}
        counts={formatMatCounts(onMat, inBand)}
        onGoLive={goLive}
        onGoOffline={() => void goOfflineWithFeedback()}
      />

      <PageContainer
        contentContainerStyle={{ paddingTop: 12, paddingBottom: ARENA_BOTTOM_PAD, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={tokens.textTertiary}
          />
        }
      >
        {/* While live: ON AIR tally and the heartbeat on the tempo clock. */}
        <OnAirStrip isLive={displayLive} />

        {strip.challenge === "incoming" && incoming ? (
          <IncomingStrip
            challengeId={incoming.challengeId}
            name={incoming.challengerName}
            // Offline, fresh on-mat challenges not in hand count here too.
            count={incomingCount + deepLink.moreOnMat}
            source={incoming}
            active={ticking}
            onOpen={() => arenaActions.reopenIncoming()}
          />
        ) : null}
        {strip.challenge === "offer" && offer ? (
          <OfferStrip
            challengeId={offer.challengeId}
            name={offer.challengerName}
            count={1 + deepLink.moreOnMat}
            source={offer}
            active={ticking}
            onGoLive={deepLink.acceptOffer}
            disabled={switchLocked}
          />
        ) : null}
        {/* Also under a tucked incoming (or offer) strip: my own challenge
            stays cancellable while another waits in the chip. */}
        {(strip.challenge === "waiting" || strip.alsoWaiting) && outgoing ? (
          <WaitingStrip
            name={outgoing.opponentName}
            source={outgoing}
            active={ticking}
            onCancel={() => void cancelOutgoing()}
            disabled={isBusy}
          />
        ) : null}
        {/* Fresh challenges the Arena cannot raise yet (challenger off the
            mat): the tab and the bell count them, so they show here. */}
        {deepLink.away.length > 0 ? (
          <AwayStrip
            name={deepLink.away[0].challengerName}
            count={deepLink.away.length}
            source={deepLink.away[0]}
            active={ticking}
          />
        ) : null}
        {/* Under a challenge strip, never displaced by one. */}
        {strip.confirm && confirm ? (
          <ConfirmStrip
            opponentName={confirm.opponentName}
            onConfirm={() => openMatchToConfirm(router, confirm.matchId)}
          />
        ) : null}

        {booked.bookings.map((b) => (
          <BookedStrip
            key={b.challenge_id}
            booking={b}
            location={booked.location}
            presence={booked.presence[b.challenge_id]}
            onRetry={() => void booked.retry()}
            onAskLocation={() => void booked.askLocation()}
            onCancel={() => booked.cancel(b.challenge_id)}
            locationRequired={locationRequired}
            flagKnown={flagKnown}
            onStart={() => void booked.start(b.challenge_id)}
            starting={Boolean(booked.starting[b.challenge_id])}
            startError={booked.startErrors[b.challenge_id] ?? null}
          />
        ))}

        {isLoading ? (
          <ArenaSkeleton />
        ) : (
          <>
            {capReached ? <CapPlate onDismiss={clearCap} /> : null}

            {hasError ? <RosterErrorPlate onRetry={refresh} /> : null}

            {/* A failed roster read hides the suggestion, but going live
                does not depend on it: offline keeps GO LIVE TO ROLL (AC-A3). */}
            {!hasError || !isLive ? (
              <ClosestMatchCard
                athlete={hasError ? null : closest}
                emptyText={
                  hasError
                    ? null
                    : !lobbyKnown
                      ? "Reconnecting to the mat"
                      : onTheMat.length === 0
                        ? "Nobody else on the mat"
                        : "No opponent free on the mat"
                }
                kind={cta.kind}
                red={cta.red}
                disabled={
                  cta.kind === "challenge"
                    ? actionsLocked || liveSaving || capReached
                    : switchLocked
                }
                viewer={{ elo: selfElo, weight: athlete.current_weight ?? null }}
                onChallenge={() => {
                  if (closest) void sendChallenge(closest.id, closest.displayName);
                }}
                onGoLive={goLive}
              />
            ) : null}

            {onTheMat.length > 0 ? (
              <View testID="arena-on-the-mat">
                <MatSectionLabel
                  label={
                    matHasFriend
                      ? "On the mat · friends first"
                      : nearby.mode === "nearby"
                        ? "On the mat · near you"
                        : "On the mat · closest first"
                  }
                  right={String(onTheMat.length)}
                />
                {matRows.map((c, i) => {
                  const action = actionFor(c.id);
                  return (
                    <Animated.View key={c.id} entering={enterRow(i)}>
                      <MatRow
                        competitor={c}
                        action={action}
                        // A row's go-live is the live switch too; ROLL is not.
                        disabled={
                          action.kind === "go-live"
                            ? actionsLocked || switchLocked
                            : actionsLocked || liveSaving
                        }
                        onRoll={() => void sendChallenge(c.id, c.displayName)}
                        onGoLive={goLive}
                        onOpenProfile={() => openProfile(c.id)}
                        isFriend={friendIds.has(c.id)}
                      />
                    </Animated.View>
                  );
                })}
              </View>
            ) : null}

            {/* Live within 2 km but not on my mat: collapsed with a count,
                no ROLL (nearby mode only; hidden at zero). */}
            {!hasError ? (
              <OnlineCloseSection
                rows={nearby.close}
                friendIds={friendIds}
                actionFor={actionFor}
                onOpenProfile={openProfile}
              />
            ) : null}
          </>
        )}
      </PageContainer>

      {/* Invites (jr_be spec 016): pinned above the tab bar, outside the
          scroll, so it is always reachable. Secondary styling: the red stays
          GO LIVE. */}
      {invitesOn && !hasError && !isLoading ? (
        <View
          testID="arena-invite-actions"
          className="gap-0.5 border-t border-hairline bg-surface px-4 pb-1 pt-2"
        >
          <Button
            variant="secondary"
            height={44}
            label="Invite a training partner"
            onPress={() => router.push("/invite?from=arena" as Href)}
          />
          <Button
            variant="ghost"
            height={32}
            label="Got a challenge code?"
            onPress={() => router.push("/invite-code" as Href)}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Publish the nearby On the mat count for the header chip while the Arena
 * is in nearby mode (`null` count: rows not known yet); fallback mode, or
 * the Arena going away, hands the chip back to the lobby count.
 */
function useNearbyOnMatCountPublisher(nearbyMode: boolean, onMat: number | null): void {
  React.useEffect(() => {
    publishNearbyOnMatCount(nearbyMode ? { count: onMat } : null);
  }, [nearbyMode, onMat]);
  React.useEffect(() => () => publishNearbyOnMatCount(null), []);
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
