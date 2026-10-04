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
import { AppState } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { getMyLookingForRanked } from "@jits/shared/api/location";
import type { AthleteGuardRow } from "@jits/shared/api/queries";
import { ChallengePromptSheet } from "@/components/arena/challenge-prompt-sheet";
import { GoLiveLocationSheet } from "@/components/arena/go-live-location-sheet";
import { StartBlockedSheet } from "@/components/arena/start-blocked-sheet";
import { useChallengerArenaReading } from "./use-challenger-arena-reading";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
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
import { cancelLocationSheet, useLegacyGoLiveReadingRefresh } from "./go-live-location";
import {
  GO_LIVE_FAILED_MESSAGE,
  showLocationOffGoLiveCta,
  showServerEndedLiveCta,
} from "./go-live-feedback";
import { goLiveFromTap, restoreFirstFrame, restoreLiveSilently } from "./location-ladder";
import { useMatchProximityRequired } from "./location-flags";
import { DriftPromptSheet } from "@/components/arena/drift-prompt-sheet";
import { useLiveDriftCheck } from "./use-live-drift-check";
import {
  markMatchLocationRequired,
  readMatchLocationRequired,
  useMatchLocationRequired,
} from "./match-location-flag";
import { setDeviceLocationOwner, validDeviceTag } from "@/lib/location/device-location-store";
import {
  getPresenceCapability,
  subscribePresenceCapability,
} from "@/lib/location/presence-capability";
import { getGoLiveDisplay, isInArenaMatch, setGoLiveDisplay } from "./arena-store";
import { useLobbyIds, useLobbyKnown, useLobbyPresence } from "./use-lobby-presence";
import { usePendingChallengeRecovery } from "./use-pending-challenge-recovery";
import { useActiveMatchOwner } from "../match-flow/active-match-store";

const ARENA_KEEP_AWAKE_TAG = "arena-live";

/**
 * How often a live athlete in the foreground asks the server whether it
 * still has them live (the 12 hour cap or an admin can end a session; the
 * athletes row is not on realtime). One small read, never a reading.
 */
export const SERVER_LIVE_CHECK_MS = 3 * 60_000;

/** Whether the backend predates the instant go-live migration (`legacy`). */
function useLegacyBackend(): boolean {
  const cap = React.useSyncExternalStore(subscribePresenceCapability, getPresenceCapability, getPresenceCapability);
  return cap === "legacy";
}

/**
 * The server ended the live session while the app is open (UX 019, 3j,
 * C6): on every return to the foreground and every few minutes while live,
 * read `looking_for_ranked`; a definite false drops the chip to GO LIVE at
 * once with one toast whose tap runs the Go Live flow.
 */
function useServerEndedLiveCheck(
  active: boolean,
  check: () => Promise<boolean>,
): void {
  const checkRef = React.useRef(check);
  checkRef.current = check;
  React.useEffect(() => {
    if (!active) return;
    const run = () => {
      if (AppState.currentState !== "active") return;
      void checkRef
        .current()
        .then((dropped) => {
          if (dropped) showServerEndedLiveCta();
        })
        .catch(() => undefined);
    };
    const t = setInterval(run, SERVER_LIVE_CHECK_MS);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") run();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [active]);
}

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
  // The device location store belongs to this athlete (an athlete switch
  // clears the previous one's entry); read it into memory now.
  React.useLayoutEffect(() => {
    setDeviceLocationOwner(athlete.id);
  }, [athlete.id]);
  // Cold start while the server says live: draw the restore from the first
  // frame (UX 019, 3h), before the arrival restore has read anything.
  React.useLayoutEffect(() => {
    if (athlete.looking_for_ranked && AppState.currentState === "active" && !isInArenaMatch()) {
      setGoLiveDisplay(restoreFirstFrame(athlete.id));
    }
    return () => setGoLiveDisplay(null);
    // Once, on arrival, like the arrival restore itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // match_location_required: Go Live needs a fresh go_live reading, and an
  // Arena start needs both athletes on one mat (contract-location-flag 6).
  const locationRequired = useMatchLocationRequired();
  const locationRequiredRef = React.useRef(locationRequired);
  locationRequiredRef.current = locationRequired;
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
    // A restore the athlete did not tap (foreground, after a match, cold
    // start): the location ladder, silently (instant go-live 4.2). A valid
    // stored tag puts the athlete back with no reading; without one, a
    // silent fix only with permission already granted. Nothing lands: no
    // live write (D12), one toast.
    autoLive: (ctx) =>
      restoreLiveSilently({
        athleteId: athlete.id,
        write: ctx.write,
        lastRefusal: ctx.lastRefusal,
        canWrite: ctx.canWrite,
        locationRequiredHint: locationRequiredRef.current,
      }),
    // Leaving for the background while live with a valid tag: the chip is
    // already drawn live for the return (UX 019, 3i).
    onResumeParked: () => {
      if (validDeviceTag(athlete.id)) setGoLiveDisplay("restore-live");
    },
  });
  // Read by the refresh handlers below and the controller (registered once).
  const liveRef = React.useRef(live);
  liveRef.current = live;

  // match_proximity_required (seeded OFF): only with both on does an Arena
  // start need a reading (instant go-live 4.3). An older backend without
  // the flag that still gates on proximity is caught by its refusal.
  const proximityFlag = useMatchProximityRequired();
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
    locationRequired,
    proximityRequired: locationRequired && proximityFlag,
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

  // A restore drawn live is for the tab roots; a match screen's header dot
  // must never read it (the athlete is offline for the match).
  React.useEffect(() => {
    if (!inMatch) return;
    const d = getGoLiveDisplay();
    if (d === "restore-live" || d === "restore-finding") setGoLiveDisplay(null);
  }, [inMatch]);
  const { isLive, isSaving } = live;
  const liveTransition = live.transition ?? null;
  const lastLiveWriteFailed = live.lastWriteFailed ?? false;
  // Live, with the lobby channel down or rejoining: nobody can vouch that
  // this athlete is on the mat right now (AC-H11, `◌ RECONNECTING`).
  const reconnecting = isLive && !lobbyKnown;
  const { incoming, outgoing, incomingCount, incomingTucked, isBusy, capReached } =
    challenge;
  useArenaLiveKeepAwake(isLive && !inMatch);
  const athleteId = athlete.id;
  // No reading is refreshed while live (instant go-live 4.2: the 60 s
  // refresh is gone; the server no longer expires a session for missing
  // readings). Only against a backend WITHOUT that migration, whose 10
  // minute expiry still needs it, the old refresh runs, as the build before.
  const legacyBackend = useLegacyBackend();
  useLegacyGoLiveReadingRefresh(isLive && !inMatch && locationRequired && legacyBackend, {
    onPermissionLost: showLocationOffGoLiveCta,
    onNotReady: (outcome) => {
      void liveRef.current
        .dropIfServerOffline(() => getMyLookingForRanked(supabase, athleteId))
        .then((dropped) => {
          if (!dropped) return;
          if (outcome === "permission") showLocationOffGoLiveCta();
          else toast.info("You're offline. Go live again in the Arena.");
        })
        .catch(() => undefined);
    },
  });
  // The server may still end a session by itself (the 12 hour cap, an
  // admin): the chip drops at once with one toast (UX 019, 3j).
  useServerEndedLiveCheck(isLive && !inMatch, () =>
    liveRef.current.dropIfServerOffline(() => getMyLookingForRanked(supabase, athleteId)),
  );
  // The drift check (flag live_location_drift_check, seeded OFF).
  useLiveDriftCheck({ athleteId, isLive, inMatch, locationRequired });
  // The challenger's reading while its challenge waits (pending or
  // accepted), only while an Arena start needs proximity (both flags on).
  useChallengerArenaReading(
    outgoing?.challengeId ?? null,
    locationRequired && proximityFlag && !inMatch,
  );

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
  const challengeRef = React.useRef(challenge);
  challengeRef.current = challenge;
  const athleteIdRef = React.useRef(athlete.id);
  athleteIdRef.current = athlete.id;
  React.useEffect(() => {
    /**
     * Go live, through the location step when the flag is on. A flag read
     * that said off but a server that refuses with `location_required` means
     * the flag was just turned on: remember that and run the location step.
     */
    const goLive = async () => {
      const l = liveRef.current;
      if (!(await readMatchLocationRequired())) {
        const ok = await l.goLive();
        if (ok || l.lastGoLiveRefusal() !== "location_required") return ok;
        markMatchLocationRequired(true);
      }
      // The location ladder (instant go-live 4.2): server tag, device tag,
      // OS cache, then a fresh fix (the only rung that may ask).
      return goLiveFromTap({
        athleteId: athleteIdRef.current,
        write: () => liveRef.current.goLive(),
        lastRefusal: () => liveRef.current.lastGoLiveRefusal(),
      });
    };
    const unregister = registerArenaController({
      toggle: async () => {
        const l = liveRef.current;
        // Going live from offline with the flag on: the same flow as goLive
        // (location step, live write, one go_live_attempt log).
        if (!l.isLive && !l.transition && (await readMatchLocationRequired())) {
          const r = await goLive();
          if (r === false) toast.info(GO_LIVE_FAILED_MESSAGE);
          return;
        }
        return liveRef.current.toggle();
      },
      goOffline: () => liveRef.current.goOffline(),
      goLive,
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
      // A Go Live waiting on the location sheet would otherwise hold the
      // live switch locked with nothing left to answer it.
      cancelLocationSheet();
    };
  }, []);

  // The prompt is never over a match. A prompt that is up when a match
  // starts by another route (deep link) is dropped by the challenge hook,
  // not held, and recovery re-offers it after the match only if it is still
  // fresh and its challenger is still in the lobby (jits-yiwx). The
  // `inMatch` guard here covers the render between the match starting and
  // that clear. A challenge tucked away with "Later" keeps its sheet down;
  // the header chip carries it until it is reopened or clears.
  return (
    <>
      {/* Go Live location states (explain, denied, accuracy, no fix). */}
      <GoLiveLocationSheet />
      {/* "Still on the same mat?" (drift check, flag off by default). */}
      <DriftPromptSheet
        blocked={inMatch || (!!incoming && !incomingTucked) || !!challenge.startBlocked}
      />
      <ChallengePromptSheet
        // Never two modals: a blocked start's sheet holds the screen until
        // it is answered; a challenge arriving meanwhile waits in the chip.
        challenge={inMatch || incomingTucked || challenge.startBlocked ? null : incoming}
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
      {/* Accepted, but the server says the two are not on one mat yet (flag
          on): the reason, Retry and Cancel. Never over a match. */}
      <StartBlockedSheet
        blocked={inMatch ? null : (challenge.startBlocked ?? null)}
        busy={isBusy}
        onRetry={() => void challenge.retryBlockedStart()}
        onCancel={() => void challenge.cancelBlockedStart()}
      />
    </>
  );
}
