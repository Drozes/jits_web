/**
 * `lobby:online` Presence for the Arena surface.
 *
 * The second of the app's two presence tiers. `app:online`
 * (`lib/presence/use-online-presence.ts`) says "this athlete has the app
 * open" and drives green dots everywhere; `lobby:online` says "this athlete is
 * in the Arena right now and can answer a live challenge". They are separate
 * signals on separate topics and must never be merged: the Arena splits its
 * roster on this one, and folding it into the app-wide channel would mark
 * every signed-in athlete as challengeable.
 *
 * Mirrors `apps/web/hooks/use-lobby-presence.ts`. Same external-store shape,
 * so any component can read the lobby without a Provider wrap.
 *
 * THE CHANNEL IS CREATED ONCE AND REUSED, NEVER REBUILT. This topic is a
 * shared constant, so the per-instance suffix that protects the Arena's
 * postgres_changes channel is not available here, and realtime-js 2.105.4
 * makes a rebuild actively dangerous:
 *   - `RealtimeClient.channel(topic)` returns the EXISTING instance when one
 *     with that topic is still registered (RealtimeClient.js:343-355).
 *   - `removeChannel()` is async and only tears the channel down when
 *     `unsubscribe()` resolves 'ok' (RealtimeClient.js:270-276), so a
 *     fire-and-forget removal can leave the instance registered.
 *   - `subscribe()` is a silent no-op unless the adapter `isClosed()`
 *     (RealtimeChannel.js:121), so re-subscribing that instance never fires
 *     SUBSCRIBED, never tracks, and the athlete never appears to anyone.
 *   - `on()` THROWS for presence and postgres_changes alike once the channel
 *     is joined or joining (RealtimeChannel.js:389-396), so re-binding it is
 *     not an option either.
 * A remount racing its own teardown would therefore leave a channel that is
 * silently dead for the rest of the app session, with "Online now" stuck at
 * zero. Adopting the live instance sidesteps all four.
 *
 * When a removal does NOT confirm, there is no instance worth adopting and no
 * safe way to build one, so setup BAILS OUT and comes back later rather than
 * re-binding the registered instance. Continuing past an unconfirmed removal
 * is the same dead lobby by a different door: `channel()` hands back the
 * joined instance, `on()` throws, `channelRef` is never assigned, and from
 * then on the identity guard in the sync handler rejects every update while
 * `track()` has nothing to push to.
 *
 * THE SERVER CAN CLOSE THE CHANNEL UNDER US (jits-fa9x). Realtime enforces a
 * per-channel presence rate limit (5 track/untrack calls per 30s); over it the
 * server stops the channel process (`ClientPresenceRateLimitReached`) and the
 * client receives `phx_close`. That is terminal for the instance: phoenix
 * marks it closed and realtime-js drops it from the registry, and nothing in
 * the library ever rejoins it. So a CLOSED for the channel the module still
 * owns (and no longer registered) is treated as a loss: the refs are cleared,
 * the dead instance is torn down, and setup runs again on a bounded backoff,
 * keeping `desiredPayload` so the new channel re-tracks on SUBSCRIBED.
 * CHANNEL_ERROR and TIMED_OUT are NOT losses while the instance is still
 * registered: phoenix already rejoins that exact instance on its own timer
 * (and on socket reopen), which fires SUBSCRIBED again. Tearing it down there
 * would fight the library on every network blip.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { LOBBY_TOPIC } from "./constants";

/**
 * Tracked payload. `looking_for_casual` / `looking_for_ranked` are carried for
 * web, whose `LobbyPayload` type expects them; `display_name` / `current_elo`
 * are what a mobile presence row can render without a second read. Neither
 * client reads the other's extra fields, but keeping the union means a future
 * reader on either side finds what it expects.
 */
export interface LobbyPayload {
  athlete_id: string;
  display_name: string;
  current_elo: number;
  looking_for_casual: boolean;
  looking_for_ranked: boolean;
}

/** What `RealtimeClient` keys its channel registry by. */
const REGISTERED_TOPIC = `realtime:${LOBBY_TOPIC}`;

/**
 * Backoff for a stale channel we could not clear.
 *
 * An unconfirmed removal means the socket is not answering, which is a
 * condition that passes: the retry is what turns "dead for the rest of the
 * session" into "dead until the connection comes back". Bounded because these
 * delays only cover a socket on its way back, and a remount or an athlete
 * change re-runs setup anyway.
 */
const STALE_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

/**
 * Backoff for rebuilding a channel the server closed (jits-fa9x), indexed by
 * how many losses have happened in a row.
 *
 * The first rebuild is quick, because the usual cause (the presence rate
 * limit) is cleared by a fresh channel and an athlete who is live should be
 * visible again within a couple of seconds. The steps then widen so a server
 * that keeps closing the channel is not hammered with joins and tracks, and
 * past the last step setup waits for the next foreground (or an explicit
 * go-live) instead.
 */
const LOSS_RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000];

/**
 * A channel that stayed joined this long before it was lost ends the losing
 * streak, so the next loss starts the backoff over. Matches the server's
 * presence rate-limit window.
 */
const LOSS_STREAK_RESET_MS = 30_000;

/**
 * `trackedKey` value for a presence call whose outcome we could not confirm.
 * It equals no payload key and is not `null`, so the next sync re-sends
 * whichever of track or untrack is wanted.
 */
const UNCONFIRMED = "\u0000unconfirmed";

// ---------------------------------------------------------------------------
// External store
// ---------------------------------------------------------------------------

let lobbyIds: Set<string> = new Set();
const listeners = new Set<() => void>();

function emitChange() {
  for (const l of listeners) l();
}

function getSnapshot(): Set<string> {
  return lobbyIds;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Every athlete id currently present in `lobby:online`. */
export function useLobbyIds(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** True when this athlete is present in the lobby. */
export function useLobbyStatus(athleteId: string): boolean {
  return useLobbyIds().has(athleteId);
}

// ---------------------------------------------------------------------------
// Imperative API
// ---------------------------------------------------------------------------

let channelRef: RealtimeChannel | null = null;
/** The athlete the live channel's presence key was built for. */
let channelAthleteId: string | null = null;
/**
 * What we WANT tracked, independent of whether the channel is joined yet.
 *
 * Two cases need it. A `joinLobby()` that lands before SUBSCRIBED would be
 * dropped by a bare `channel.track()`, and the SUBSCRIBED callback re-fires on
 * every websocket rejoin, where re-tracking a payload captured at mount would
 * resurrect a stale one. Reading the desired payload at track time fixes both.
 */
let desiredPayload: LobbyPayload | null = null;

/**
 * What the owned channel's server-side presence holds for us, as a payload key
 * (`null`: nothing, `UNCONFIRMED`: unknown). Reset on every SUBSCRIBED,
 * because a fresh join starts with nothing tracked.
 *
 * This is what keeps presence churn down: the server allows 5 presence calls
 * per 30s per channel and CLOSES the channel past that, so a track of the
 * payload already held, or an untrack of nothing, is a call we must not make.
 */
let trackedKey: string | null = null;

/** When the owned channel last reached SUBSCRIBED, for the loss streak. */
let ownedSubscribedAt: number | null = null;
/** Losses in a row without a channel that stayed healthy in between. */
let consecutiveLosses = 0;
/** A channel the server closed, waiting to be torn down by the next setup. */
let lostChannel: RealtimeChannel | null = null;

/**
 * Hooks into the mounted owner (`useLobbyPresence`), which is the only place
 * that knows the athlete id and owns the retry timer. `null` while nothing is
 * mounted, in which case the next mount's setup does the rebuild.
 */
let owner: {
  /** The owned channel was lost: rebuild it on the loss backoff. */
  onChannelLost: () => void;
  /** Setup gave up earlier and something now wants the lobby: try again. */
  resume: () => void;
} | null = null;

function payloadKey(payload: LobbyPayload | null): string | null {
  return payload ? JSON.stringify(payload) : null;
}

/**
 * The owned channel is gone for good (server close). Clear the refs and ask
 * the owner to build a new one, KEEPING `desiredPayload` so the new channel
 * re-tracks on SUBSCRIBED. The identity guard is what stops an intentional
 * teardown from looping: `releaseChannel()` nulls `channelRef` before its
 * removal fires CLOSED, so that CLOSED never gets here.
 */
function handleChannelLoss(channel: RealtimeChannel, reason: string): void {
  if (channelRef !== channel) return;
  const wasHealthy =
    ownedSubscribedAt !== null &&
    Date.now() - ownedSubscribedAt >= LOSS_STREAK_RESET_MS;
  consecutiveLosses = wasHealthy ? 1 : consecutiveLosses + 1;
  console.warn(
    `[arena] lobby channel lost (${reason}); rebuilding it (loss ${consecutiveLosses} in a row)`,
  );
  channelRef = null;
  channelAthleteId = null;
  trackedKey = null;
  ownedSubscribedAt = null;
  lostChannel = channel;
  // We no longer receive syncs, so the roster we hold is going stale.
  lobbyIds = new Set();
  emitChange();
  owner?.onChannelLost();
}

/**
 * One reconciliation of the owned channel's presence toward `desiredPayload`.
 * Only pushes on a JOINED channel: while it is joining or errored, phoenix
 * would buffer the push and the SUBSCRIBED callback would then track again,
 * two presence calls for one intent. SUBSCRIBED re-syncs instead.
 */
async function syncOnce(): Promise<void> {
  const channel = channelRef;
  if (!channel) {
    if (desiredPayload) owner?.resume();
    return;
  }
  if (!isRegistered(channel)) {
    // Closed without the CLOSED callback reaching us (or before it did).
    // Pushing into it would fail silently for the rest of the session.
    handleChannelLoss(channel, "no longer registered");
    return;
  }
  if (channel.state !== "joined") return;

  const want = payloadKey(desiredPayload);
  if (want === trackedKey) return;
  trackedKey = want;
  try {
    const status = desiredPayload
      ? await channel.track(desiredPayload)
      : await channel.untrack();
    if (status !== "ok" && channelRef === channel && trackedKey === want) {
      trackedKey = UNCONFIRMED;
    }
  } catch (error: unknown) {
    if (channelRef === channel && trackedKey === want) trackedKey = UNCONFIRMED;
    console.warn("[arena] lobby presence update failed:", error);
  }
}

let syncing: Promise<void> | null = null;
let syncAgain = false;

/**
 * Reconcile presence, coalescing overlapping requests. A request that lands
 * while a track or untrack is in flight does not queue its own call: it marks
 * the pass dirty, and the loop re-reads `desiredPayload` once the in-flight
 * call settles. A burst of live/offline toggles therefore costs at most one
 * call in flight plus one for the final state, with no added delay (a time
 * debounce would also have held back the "left the lobby on entering a
 * match" untrack). Never rejects.
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

/** Appear in the lobby. Safe to call before the channel has joined. */
export async function joinLobby(payload: LobbyPayload): Promise<void> {
  desiredPayload = payload;
  await syncPresence();
}

/** Disappear from the lobby. */
export async function leaveLobby(): Promise<void> {
  desiredPayload = null;
  await syncPresence();
}

/** True while the client still holds this exact channel instance. */
function isRegistered(channel: RealtimeChannel | null): boolean {
  if (!channel) return false;
  return supabase.getChannels().some((c) => c === channel);
}

/**
 * Drop the channel properly: awaited, and with the status checked, because a
 * removal that did not confirm leaves the instance registered and poisons
 * every later `channel()` call for this topic.
 */
async function releaseChannel(): Promise<void> {
  const channel = channelRef;
  channelRef = null;
  channelAthleteId = null;
  desiredPayload = null;
  trackedKey = null;
  ownedSubscribedAt = null;
  // A deliberate release (athlete change, sign-out) starts a new story.
  consecutiveLosses = 0;
  lobbyIds = new Set();
  emitChange();
  if (!channel) return;
  const status = await supabase.removeChannel(channel);
  if (status !== "ok") {
    console.warn("[arena] lobby channel did not confirm teardown:", status);
  }
}

// ---------------------------------------------------------------------------
// Provider hook
// ---------------------------------------------------------------------------

/**
 * Owns the single `lobby:online` channel. Mount once, app-wide, from
 * `<ArenaBootstrap />` (`arena-bootstrap.tsx`), never from a screen. Observing
 * the channel is not joining the lobby: nothing is tracked until
 * `joinLobby()`, which only the live state machine calls.
 *
 * Going live and going offline run through the imperative API above rather
 * than through props, so a toggle never tears the channel down and re-joins
 * it.
 */
export function useLobbyPresence(athleteId: string): void {
  React.useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    /** A setup pass is running; a second one would race it to `channel()`. */
    let running = false;
    /** Setup was requested while a pass was running: run once more after. */
    let rerunQueued = false;
    /**
     * The backoff ran out. The owner is app-wide now, so there is no "next
     * Arena visit" to re-run setup; coming back to the foreground is the
     * natural moment the socket is back, so that is when setup runs again
     * (as does an explicit go-live, through `owner.resume`).
     */
    let gaveUp = false;

    /**
     * Come back to a setup that could not complete. `attempt` is the try that
     * just failed, so the delays step up and the sequence terminates.
     */
    function retryLater(attempt: number) {
      if (cancelled) return;
      const delay = STALE_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        console.warn(
          "[arena] gave up clearing the stale lobby channel; retrying when the app next returns to the foreground",
        );
        gaveUp = true;
        return;
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        run(attempt + 1);
      }, delay);
    }

    /**
     * Rebuild after the server closed the owned channel. Stepped by the
     * losing streak rather than by setup attempts, so a server that keeps
     * closing fresh channels (the rate limit, say) is backed off from instead
     * of being handed a new join and track every second.
     */
    function recoverLater() {
      if (cancelled || retryTimer) return;
      const delay = LOSS_RETRY_DELAYS_MS[consecutiveLosses - 1];
      if (delay === undefined) {
        console.warn(
          "[arena] gave up rebuilding the lost lobby channel; retrying when the app next returns to the foreground",
        );
        gaveUp = true;
        return;
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        run(0);
      }, delay);
    }

    async function ensure(attempt: number) {
      // A channel the server closed is already out of the registry; tear it
      // down (timers, buffered pushes, bindings) without sending anything.
      // `removeChannel()` would push a leave for this topic, and realtime-js
      // drops registry entries BY TOPIC on close, so any late close event
      // from it could unregister the replacement built below.
      if (lostChannel) {
        const dead = lostChannel;
        lostChannel = null;
        dead.teardown();
      }

      if (!athleteId) {
        await releaseChannel();
        return;
      }

      // Adopt a channel we already hold for this athlete. Its existing
      // presence binding is still wired to the module store, so nothing needs
      // re-binding, which is fortunate, because `on()` would throw.
      if (isRegistered(channelRef) && channelAthleteId === athleteId) {
        await syncPresence();
        return;
      }

      // Either we hold a channel for a different athlete, or one was left
      // behind. Both have to go before `channel()` will hand back anything
      // new rather than the old instance.
      if (channelRef || channelAthleteId !== null) await releaseChannel();
      if (cancelled) return;

      const stray = supabase
        .getChannels()
        .find((c) => c.topic === REGISTERED_TOPIC);
      if (stray) {
        const status = await supabase.removeChannel(stray);
        if (status !== "ok") {
          // BAIL OUT. The instance is still registered and still joined, so
          // `channel()` below would hand back this exact one and `on()` would
          // THROW on it, killing the lobby for the rest of the app session.
          // An unconfirmed removal is a socket that is not answering, which
          // is temporary, so the honest move is to leave the lobby empty and
          // try the removal again rather than adopt a channel we cannot wire.
          console.warn("[arena] stale lobby channel did not clear:", status);
          retryLater(attempt);
          return;
        }
      }
      if (cancelled) return;

      const channel = supabase.channel(LOBBY_TOPIC, {
        config: { presence: { key: athleteId } },
      });

      channel.on("presence", { event: "sync" }, () => {
        // Identity guard rather than a mount counter: the only question that
        // matters is whether this is still the channel the module owns.
        if (channelRef !== channel) return;
        const state = channel.presenceState<LobbyPayload>();
        lobbyIds = new Set(Object.keys(state));
        emitChange();
      });

      channel.subscribe((status) => {
        // Released or superseded. `releaseChannel()` nulls `channelRef`
        // before its removal fires CLOSED, so an intentional teardown stops
        // here and can never loop back into a rebuild.
        if (channelRef !== channel) return;
        if (status === "SUBSCRIBED") {
          // A fresh join (first or a phoenix rejoin) holds nothing for us
          // server-side, so the desired payload has to be tracked again.
          ownedSubscribedAt = Date.now();
          trackedKey = null;
          void syncPresence();
          return;
        }
        // CLOSED lands after realtime-js has already dropped the instance
        // from the registry, and nothing will ever rejoin it. CHANNEL_ERROR
        // and TIMED_OUT leave it registered while phoenix rejoins it itself.
        if (!isRegistered(channel)) handleChannelLoss(channel, status);
      });

      channelRef = channel;
      channelAthleteId = athleteId;
      trackedKey = null;
      ownedSubscribedAt = null;
    }

    /**
     * Never let a setup failure escape as an unhandled rejection, and never
     * let it pass quietly either: a lobby that is empty because setup threw
     * looks exactly like a lobby that is empty because nobody is in it.
     */
    function run(attempt: number) {
      if (cancelled) return;
      if (running) {
        // e.g. the adopt path's sync found the channel gone mid-pass.
        rerunQueued = true;
        return;
      }
      running = true;
      void ensure(attempt)
        .catch((error: unknown) => {
          console.warn("[arena] lobby channel setup failed:", error);
          retryLater(attempt);
        })
        .finally(() => {
          running = false;
          if (!rerunQueued) return;
          rerunQueued = false;
          // A pending backoff timer already owns the next pass.
          if (!retryTimer) run(0);
        });
    }

    function resume() {
      if (!gaveUp || cancelled) return;
      gaveUp = false;
      run(0);
    }

    const self = { onChannelLost: recoverLater, resume };
    owner = self;

    run(0);

    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") resume();
    });

    return () => {
      cancelled = true;
      if (owner === self) owner = null;
      appStateSub.remove();
      if (retryTimer) clearTimeout(retryTimer);
      // Leave the lobby, KEEP the channel. Removing it here is what creates
      // the zombie described at the top of this file, and an observer with
      // nothing tracked costs one idle topic.
      void leaveLobby();
    };
  }, [athleteId]);
}
