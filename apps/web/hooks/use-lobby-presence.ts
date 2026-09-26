"use client";

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  clearStrayChannel,
  discardLostChannel,
  isRegistered,
  LOSS_RETRY_DELAYS_MS,
  LOSS_STREAK_RESET_MS,
  settleWithin,
} from "@/lib/realtime/presence-channel";

/** Payload tracked on the `lobby:online` Presence channel. */
interface LobbyPayload {
  athlete_id: string;
  looking_for_casual: boolean;
  looking_for_ranked: boolean;
}

const TOPIC = "lobby:online";

// ---------------------------------------------------------------------------
// External store: allows any client component to subscribe without context
// ---------------------------------------------------------------------------

let lobbyIds: Set<string> = new Set();
const listeners = new Set<() => void>();

function emitChange() {
  for (const l of listeners) l();
}

function getSnapshot(): Set<string> {
  return lobbyIds;
}

const SERVER_SNAPSHOT: Set<string> = new Set();
function getServerSnapshot(): Set<string> {
  return SERVER_SNAPSHOT;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// ---------------------------------------------------------------------------
// Module-level channel state for the imperative API (jits-ifvw, mirrors
// mobile jits-fa9x)
// ---------------------------------------------------------------------------

let channelRef: RealtimeChannel | null = null;

/**
 * What we WANT tracked. The SUBSCRIBED callback seeds it from the owner's
 * flags; `joinLobby()` / `leaveLobby()` change it. Kept across a server close
 * so the rebuilt channel re-tracks it.
 */
let desiredPayload: LobbyPayload | null = null;

/**
 * What the owned channel holds for us, as a payload key (`null`: nothing,
 * `UNCONFIRMED`: unknown). The server allows 5 presence calls per 30s per
 * channel and CLOSES it past that, so a track of the payload already held or
 * an untrack of nothing is a call we must not make. Reset on every
 * SUBSCRIBED, because a fresh join holds nothing.
 */
let trackedKey: string | null = null;
const UNCONFIRMED = "\u0000unconfirmed";

/** Lets an in-flight presence call go the moment its channel is dropped. */
let abandonInFlight: (() => void) | null = null;

/** Delay before the one follow-up sync after an unconfirmed call. */
const UNCONFIRMED_RESYNC_MS = 2_000;
let resyncTimer: ReturnType<typeof setTimeout> | null = null;
let resyncSpent = false;

/** The mounted owner: `resume` retries a setup that gave up. */
let owner: { resume: () => void } | null = null;

/** The previous owner's channel removal, while it is still in flight. */
let pendingRemoval: Promise<unknown> | null = null;

function payloadKey(payload: LobbyPayload | null): string | null {
  // Field by field: two callers building the same payload in a different
  // key order must still compare equal.
  return payload
    ? `${payload.athlete_id}|${payload.looking_for_casual}|${payload.looking_for_ranked}`
    : null;
}

function cancelResync(): void {
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = null;
  resyncSpent = false;
}

/**
 * Drop the owned channel from the module (loss or release). Keeps
 * `desiredPayload`; a release clears it itself.
 */
function dropOwnedChannel(): void {
  channelRef = null;
  trackedKey = null;
  abandonInFlight?.();
  abandonInFlight = null;
  cancelResync();
  // No more syncs arrive, so the roster we hold is going stale.
  lobbyIds = new Set();
  emitChange();
}

/**
 * One reconciliation toward `desiredPayload`. Only pushes on a JOINED
 * channel: while joining, phoenix would buffer the push and SUBSCRIBED would
 * then track again, two presence calls for one intent.
 */
async function syncOnce(): Promise<void> {
  const channel = channelRef;
  if (!channel) {
    if (desiredPayload) owner?.resume();
    return;
  }
  if (channel.state !== "joined") return;

  const want = payloadKey(desiredPayload);
  if (want === trackedKey) return;
  trackedKey = want;
  const gone = new Promise<"lost">((resolve) => {
    abandonInFlight = () => resolve("lost");
  });
  const status = await settleWithin(
    desiredPayload ? channel.track(desiredPayload) : channel.untrack(),
    undefined,
    gone,
  );
  if (channelRef !== channel || trackedKey !== want) return;
  if (status === "ok") {
    resyncSpent = false;
    return;
  }
  // Not knowing what the server holds: sync once more a little later, but
  // only once per run of unconfirmed calls (each call counts to the limit).
  trackedKey = UNCONFIRMED;
  if (resyncTimer || resyncSpent) return;
  resyncSpent = true;
  resyncTimer = setTimeout(() => {
    resyncTimer = null;
    void syncPresence();
  }, UNCONFIRMED_RESYNC_MS);
}

let syncing: Promise<void> | null = null;
let syncAgain = false;

/**
 * Reconcile presence, coalescing overlapping requests: a request during an
 * in-flight call marks the pass dirty and the loop re-reads `desiredPayload`
 * once it settles, so a burst of toggles costs at most two calls.
 */
function syncPresence(): Promise<void> {
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  syncing = (async () => {
    try {
      do {
        syncAgain = false;
        await syncOnce();
      } while (syncAgain);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

// ---------------------------------------------------------------------------
// Consumer hook: use in any client component
// ---------------------------------------------------------------------------

export function useLobbyStatus(athleteId: string): boolean {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ids.has(athleteId);
}

/** Returns the full set of athlete IDs currently in the lobby. */
export function useLobbyIds(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ---------------------------------------------------------------------------
// Imperative API: call from toggle component
// ---------------------------------------------------------------------------

export function joinLobby(payload: LobbyPayload): void {
  desiredPayload = payload;
  void syncPresence();
}

export function leaveLobby(): void {
  desiredPayload = null;
  void syncPresence();
}

// ---------------------------------------------------------------------------
// Provider hook: call once at app level to set up the channel
// ---------------------------------------------------------------------------

/**
 * Owns the single `lobby:online` channel. A CLOSED for the owned channel once
 * it is no longer registered is the server closing it (e.g. the presence rate
 * limit); realtime-js never rejoins it, so it is rebuilt on a bounded backoff
 * and `desiredPayload` re-tracked. CHANNEL_ERROR / TIMED_OUT with the
 * instance still registered are left to phoenix, which rejoins it itself.
 */
export function useLobbyPresence(
  athleteId: string,
  lookingForCasual: boolean,
  lookingForRanked: boolean,
): void {
  // The SUBSCRIBED callback re-fires on every websocket rejoin, but the effect
  // deliberately depends only on athleteId (so a toggle does not tear the
  // channel down). Without this ref the rejoin would re-track using the flags
  // captured at MOUNT, silently dropping a user who went live mid-session out
  // of the lobby on the next reconnect.
  const lookingRef = useRef({ lookingForCasual, lookingForRanked });
  lookingRef.current = { lookingForCasual, lookingForRanked };

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    /** A channel the server closed, discarded by the next setup. */
    let deadChannel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let losses = 0;
    let subscribedAt: number | null = null;
    let gaveUp = false;

    function scheduleRebuild() {
      if (cancelled || retryTimer) return;
      const delay = LOSS_RETRY_DELAYS_MS[losses - 1];
      if (delay === undefined) {
        console.warn(
          "[arena] gave up rebuilding the lobby channel; retrying when the tab is next visible or on going live",
        );
        gaveUp = true;
        return;
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        run();
      }, delay);
    }

    function handleLoss(channel: RealtimeChannel, reason: string) {
      if (channelRef !== channel) return;
      const wasHealthy =
        subscribedAt !== null && Date.now() - subscribedAt >= LOSS_STREAK_RESET_MS;
      losses = wasHealthy ? 1 : losses + 1;
      console.warn(
        `[arena] lobby channel lost (${reason}); rebuilding it (loss ${losses} in a row)`,
      );
      subscribedAt = null;
      deadChannel = channel;
      dropOwnedChannel();
      scheduleRebuild();
    }

    async function connect() {
      if (deadChannel) {
        discardLostChannel(deadChannel);
        deadChannel = null;
      }
      if (pendingRemoval) await pendingRemoval;
      if (cancelled) return;
      if (!(await clearStrayChannel(supabase, TOPIC))) {
        // Still registered, so `channel()` would hand this one back and
        // `on()` would throw on it.
        console.warn("[arena] stale lobby channel did not clear");
        losses += 1;
        scheduleRebuild();
        return;
      }
      if (cancelled) return;

      const channel = supabase.channel(TOPIC, {
        config: { presence: { key: athleteId } },
      });

      channel.on("presence", { event: "sync" }, () => {
        if (channelRef !== channel) return;
        const state = channel.presenceState<LobbyPayload>();
        lobbyIds = new Set(Object.keys(state));
        emitChange();
      });

      channel.subscribe((status) => {
        // Released or superseded: the cleanup nulls `channelRef` before its
        // removal fires CLOSED, so an intentional teardown stops here.
        if (channelRef !== channel) return;
        if (status === "SUBSCRIBED") {
          // A fresh join (first or a phoenix rejoin) holds nothing for us.
          subscribedAt = Date.now();
          trackedKey = null;
          const { lookingForCasual: casual, lookingForRanked: ranked } =
            lookingRef.current;
          desiredPayload =
            casual || ranked
              ? {
                  athlete_id: athleteId,
                  looking_for_casual: casual,
                  looking_for_ranked: ranked,
                }
              : null;
          void syncPresence();
          return;
        }
        if (!isRegistered(supabase, channel)) handleLoss(channel, status);
      });

      channelRef = channel;
      trackedKey = null;
    }

    function run() {
      if (cancelled || running) return;
      running = true;
      void connect()
        .catch((err: unknown) => {
          console.warn("[arena] lobby channel setup failed", err);
          losses += 1;
          scheduleRebuild();
        })
        .finally(() => {
          running = false;
        });
    }

    function resume() {
      if (!gaveUp || cancelled || running || channelRef) return;
      gaveUp = false;
      losses = 0;
      run();
    }

    const self = { resume };
    owner = self;
    run();

    const onVisible = () => {
      if (document.visibilityState === "visible") resume();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (owner === self) owner = null;
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimer) clearTimeout(retryTimer);
      if (deadChannel) discardLostChannel(deadChannel);
      const channel = channelRef;
      desiredPayload = null;
      // Drop the last roster so nothing reads a stale lobby after sign-out or
      // an athlete switch (the next owner starts from an empty set).
      dropOwnedChannel();
      if (channel) {
        // The next owner waits on this before building its own channel.
        const removal = settleWithin(supabase.removeChannel(channel)).finally(
          () => {
            if (pendingRemoval === removal) pendingRemoval = null;
          },
        );
        pendingRemoval = removal;
      }
    };
    // Only athleteId in deps: toggle changes go through the imperative API,
    // avoiding channel teardown/reconnect on every toggle. The flags are read
    // through lookingRef, so no suppression is needed.
  }, [athleteId]);
}
