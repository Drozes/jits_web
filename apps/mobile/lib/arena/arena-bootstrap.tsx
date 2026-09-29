/**
 * The single, app-wide owner of the Arena: live state, `lobby:online`
 * presence, the incoming-challenge listener and its prompt.
 *
 * Mounted once in `app/(app)/_layout.tsx`, beside the Stack, so it lives for
 * as long as the signed-in app does and NOT for as long as a screen does. That
 * is what lets being live persist across Home, Arena, Rankings and Profile,
 * and what lets a live athlete on any of them answer a challenge.
 *
 * It renders only for an ACTIVE athlete and is keyed by athlete id, so a
 * sign-out or an athlete switch unmounts it (every hook below tears down and
 * goes offline) and the next athlete gets a clean instance instead of
 * inheriting the last one's intent. Its state is published to
 * `arena-store.ts`, which is the only way the rest of the app reads it.
 */
import * as React from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import type { AthleteGuardRow } from "@jits/shared/api/queries";
import { ChallengePromptSheet } from "@/components/arena/challenge-prompt-sheet";
import { REOPEN_SURFACE_GRACE_MS } from "./constants";
import { useAuth } from "../auth/hooks";
import {
  IDLE_ARENA_STATE,
  notifyOpponentUnavailable,
  notifyStaleChallengesCancelled,
  useHasIncomingReopenSurface,
  useIsInArenaMatch,
  useMatchExitCount,
  publishArenaSelfId,
  publishArenaState,
  registerArenaController,
} from "./arena-store";
import { useArenaChallenge } from "./use-arena-challenge";
import { useArenaLive } from "./use-arena-live";
import { useLobbyIds, useLobbyKnown, useLobbyPresence } from "./use-lobby-presence";
import { usePendingChallengeRecovery } from "./use-pending-challenge-recovery";
import { useActiveMatchOwner } from "../match-flow/active-match-store";

const ARENA_KEEP_AWAKE_TAG = "arena-live";

/**
 * Hold the screen awake while the athlete is live. Auto-lock backgrounds the
 * app, and backgrounding takes a live athlete out of the lobby, so without
 * this a phone left on the table silently stops being challengeable. Same
 * imperative API (and module, already in the shipped binary) as the match
 * live step's `useMatchKeepAwake`, under its own tag so the two never release
 * each other's lock. Not held in a match: the live step owns that.
 */
function useArenaLiveKeepAwake(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(ARENA_KEEP_AWAKE_TAG).catch(() => {
      // Non-fatal: the athlete just stays subject to auto-lock.
    });
    return () => {
      // Async: a rejection would otherwise surface as an unhandled promise.
      void deactivateKeepAwake(ARENA_KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [active]);
}

export function ArenaBootstrap() {
  const { athlete, refreshAthleteSoft } = useAuth();

  // A finished match changed this athlete's rating, and nothing else re-reads
  // the auth row: the tab screens that show it (Home's ELO hero, Profile, the
  // Arena's gaps) stay mounted under the match now (jits-tlk3). Soft: a failed
  // read keeps the current athlete instead of nulling it, which would bounce
  // the tabs to /profile-setup and tear this owner (live, presence) down.
  const matchExits = useMatchExitCount();
  const seenExits = React.useRef(matchExits);
  React.useEffect(() => {
    if (matchExits === seenExits.current) return;
    seenExits.current = matchExits;
    void refreshAthleteSoft();
  }, [matchExits, refreshAthleteSoft]);

  if (!athlete || athlete.status !== ATHLETE_STATUS.ACTIVE) return null;
  return <ArenaOwner key={athlete.id} athlete={athlete} />;
}

function ArenaOwner({ athlete }: { athlete: AthleteGuardRow }) {
  useLobbyPresence(athlete.id);
  const lobbyIds = useLobbyIds();
  // An empty set reads the same whether the lobby is empty or its channel is
  // down; the challenge hook must only act on a lobby that is actually known.
  const lobbyKnown = useLobbyKnown();
  const inMatch = useIsInArenaMatch();
  // The app-wide "result to confirm" / Resume source (F10).
  useActiveMatchOwner(athlete.id);
  // Who the header chip counts as "self" (left out of the lobby count).
  React.useEffect(() => {
    publishArenaSelfId(athlete.id);
    return () => publishArenaSelfId(null);
  }, [athlete.id]);

  // The challenge hook is created after the live hook, so a manual
  // go-offline reaches it through a ref.
  const beginManualOfflineRef = React.useRef<
    () => ((wentOffline: boolean) => void) | void
  >(() => {});
  const live = useArenaLive({
    athleteId: athlete.id,
    displayName: athlete.display_name ?? "",
    // Null, not 0: an unrated athlete never tracks a placeholder rating.
    currentElo:
      typeof athlete.current_elo === "number" && Number.isFinite(athlete.current_elo)
        ? athlete.current_elo
        : null,
    initialRanked: athlete.looking_for_ranked ?? false,
    inMatch,
    onManualOffline: () => beginManualOfflineRef.current(),
  });

  const challenge = useArenaChallenge({
    athleteId: athlete.id,
    athleteWeight: athlete.current_weight ?? null,
    inMatch,
    isLive: live.isLive,
    onOpponentUnavailable: notifyOpponentUnavailable,
    onStaleCancelled: notifyStaleChallengesCancelled,
    // Null, not undefined: presence is tracked but UNKNOWN right now, so
    // the hook refuses to send rather than skip the on-the-mat check (F13).
    lobbyIds: lobbyKnown ? lobbyIds : null,
  });
  beginManualOfflineRef.current = challenge.beginManualOffline;

  // Also withdraws my own stale outgoing challenges (jits-celf) on the same
  // triggers: mount, going live, foreground. The one on my plate is kept.
  usePendingChallengeRecovery({
    athleteId: athlete.id,
    isLive: live.isLive,
    inMatch,
    hasIncoming: !!challenge.incoming,
    tuckedIncomingId: challenge.incomingTucked
      ? (challenge.incoming?.challengeId ?? null)
      : null,
    lobbyIds,
    lobbyKnown,
    offerIncoming: challenge.offerIncoming,
    restoreOutgoing: challenge.restoreOutgoing,
    outgoingChallengeId: challenge.outgoing?.challengeId ?? null,
    onStaleCancelled: notifyStaleChallengesCancelled,
    onIncomingRead: challenge.noteIncomingRead,
  });

  const { isLive, isSaving } = live;
  const liveTransition = live.transition ?? null;
  const lastLiveWriteFailed = live.lastWriteFailed ?? false;
  // Live, with the lobby channel down or rejoining: nobody can vouch that
  // this athlete is on the mat right now (AC-H11, `◌ RECONNECTING`).
  const reconnecting = isLive && !lobbyKnown;
  const { incoming, outgoing, incomingCount, incomingTucked, isBusy, capReached } =
    challenge;
  useArenaLiveKeepAwake(isLive && !inMatch);

  // "Later" is only offered while something on screen can bring the prompt
  // back (the header chip registers itself, see useIncomingReopenSurface). If
  // the last such surface goes away while a challenge is tucked, it comes
  // straight back up as the sheet rather than staying hidden with no way to
  // answer it until it lapses (AC-S4). After a short grace, so a surface that
  // registers in a later effect (this owner's effects run before a sibling
  // header's) or remounts across a navigation does not bounce the sheet up.
  const canReopen = useHasIncomingReopenSurface();
  const reopenIncoming = challenge.reopenIncoming;
  React.useEffect(() => {
    if (!incomingTucked || canReopen) return;
    const timer = setTimeout(reopenIncoming, REOPEN_SURFACE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [incomingTucked, canReopen, reopenIncoming]);
  React.useEffect(() => {
    publishArenaState({
      isLive,
      isSaving,
      liveTransition,
      incoming,
      outgoing,
      incomingCount,
      incomingTucked,
      isBusy,
      capReached,
      lastLiveWriteFailed,
      reconnecting,
    });
  }, [
    isLive,
    isSaving,
    liveTransition,
    incoming,
    outgoing,
    incomingCount,
    incomingTucked,
    isBusy,
    capReached,
    lastLiveWriteFailed,
    reconnecting,
  ]);

  // Registered through refs so the controller is registered once and still
  // always calls the latest callbacks.
  const liveRef = React.useRef(live);
  liveRef.current = live;
  const challengeRef = React.useRef(challenge);
  challengeRef.current = challenge;
  React.useEffect(() => {
    const unregister = registerArenaController({
      toggle: () => liveRef.current.toggle(),
      goOffline: () => liveRef.current.goOffline(),
      goLive: () => liveRef.current.goLive(),
      sendChallenge: (id, name) => challengeRef.current.sendChallenge(id, name),
      cancelOutgoing: () => challengeRef.current.cancelOutgoing(),
      clearCap: () => challengeRef.current.clearCap(),
      tuckIncoming: () => challengeRef.current.tuckIncoming(),
      reopenIncoming: () => challengeRef.current.reopenIncoming(),
      isIncomingDismissed: (id) => challengeRef.current.isIncomingDismissed(id),
    });
    return () => {
      unregister();
      publishArenaState(IDLE_ARENA_STATE);
    };
  }, []);

  return (
    // Never over a match. A prompt that is up when a match starts by another
    // route (deep link) is dropped by the challenge hook, not held, and
    // recovery re-offers it after the match only if it is still fresh and
    // its challenger is still in the lobby (jits-yiwx). The `inMatch` guard
    // here covers the render between the match starting and that clear.
    // A challenge tucked away with "Later" keeps its sheet down; the header
    // chip carries it until it is reopened or clears.
    <ChallengePromptSheet
      challenge={inMatch || incomingTucked ? null : incoming}
      busy={isBusy}
      onAccept={() => void challenge.accept()}
      onDecline={() => void challenge.decline()}
      // "Later" (AC-S4): minimize into the header chip; nothing is written.
      // No chip mounted, no Later.
      onLater={canReopen ? () => challenge.tuckIncoming() : undefined}
      // The prompt shows the first challenge; the rest are "+N more" (AC-S6).
      moreCount={Math.max(0, incomingCount - 1)}
      viewer={{ elo: athlete.current_elo ?? null, weight: athlete.current_weight ?? null }}
    />
  );
}
