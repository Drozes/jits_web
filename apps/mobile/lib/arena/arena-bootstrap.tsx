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
import { ATHLETE_STATUS } from "@jits/shared/constants";
import type { AthleteGuardRow } from "@jits/shared/api/queries";
import { ChallengePromptSheet } from "@/components/arena/challenge-prompt-sheet";
import { useAuth } from "../auth/hooks";
import {
  IDLE_ARENA_STATE,
  notifyOpponentUnavailable,
  notifyStaleChallengesCancelled,
  useIsInArenaMatch,
  useMatchExitCount,
  publishArenaState,
  registerArenaController,
} from "./arena-store";
import { useArenaChallenge } from "./use-arena-challenge";
import { useArenaLive } from "./use-arena-live";
import { useLobbyIds, useLobbyPresence } from "./use-lobby-presence";
import { usePendingChallengeRecovery } from "./use-pending-challenge-recovery";

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
  const inMatch = useIsInArenaMatch();

  const live = useArenaLive({
    athleteId: athlete.id,
    displayName: athlete.display_name ?? "",
    currentElo: athlete.current_elo ?? 0,
    initialRanked: athlete.looking_for_ranked ?? false,
    inMatch,
  });

  const challenge = useArenaChallenge({
    athleteId: athlete.id,
    athleteWeight: athlete.current_weight ?? null,
    inMatch,
    isLive: live.isLive,
    onOpponentUnavailable: notifyOpponentUnavailable,
    onStaleCancelled: notifyStaleChallengesCancelled,
  });

  // Also withdraws my own stale outgoing challenges (jits-celf) on the same
  // triggers: mount, going live, foreground. The one on my plate is kept.
  usePendingChallengeRecovery({
    athleteId: athlete.id,
    isLive: live.isLive,
    inMatch,
    hasIncoming: !!challenge.incoming,
    lobbyIds,
    offerIncoming: challenge.offerIncoming,
    restoreOutgoing: challenge.restoreOutgoing,
    outgoingChallengeId: challenge.outgoing?.challengeId ?? null,
    onStaleCancelled: notifyStaleChallengesCancelled,
  });

  const { isLive, isSaving } = live;
  const { incoming, outgoing, isBusy, capReached } = challenge;
  React.useEffect(() => {
    publishArenaState({ isLive, isSaving, incoming, outgoing, isBusy, capReached });
  }, [isLive, isSaving, incoming, outgoing, isBusy, capReached]);

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
      sendChallenge: (id, name) => challengeRef.current.sendChallenge(id, name),
      cancelOutgoing: () => challengeRef.current.cancelOutgoing(),
      clearCap: () => challengeRef.current.clearCap(),
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
    <ChallengePromptSheet
      challenge={inMatch ? null : incoming}
      busy={isBusy}
      onAccept={() => void challenge.accept()}
      onDecline={() => void challenge.decline()}
    />
  );
}
