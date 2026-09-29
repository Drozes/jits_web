/**
 * Keep a realtime channel alive across a server close (jits-fa9x).
 *
 * Shared by the Arena's challenge channels (`use-arena-challenge.ts`) and the
 * app-wide open-match store (`match-flow/active-match-store.ts`). The lobby
 * (`use-lobby-presence.ts`) has its own, presence-aware, version.
 */
import { AppState } from "react-native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * Rebuild delays for a channel the server closed, by losses in a row. Same
 * shape as the lobby's (jits-fa9x): quick first, widening, then wait for the
 * next foreground instead of hammering a server that keeps closing it.
 */
export const CHANNEL_LOSS_RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000];

/** A channel that stayed up this long ends the losing streak. */
export const CHANNEL_LOSS_STREAK_RESET_MS = 30_000;

/** True while the client still holds this exact channel instance. */
export function isRegistered(channel: RealtimeChannel): boolean {
  return supabase.getChannels().some((c) => c === channel);
}

/**
 * Subscribe a channel and keep it alive across a server close.
 *
 * The server can stop a channel process (a rate limit, a node restart), and
 * the client then gets CLOSED with the instance already dropped from the
 * registry: nothing in realtime-js ever rejoins it, so without this the prompt
 * and the waiting plate go deaf for the rest of the session. Mirrors the
 * lobby (jits-fa9x, `use-lobby-presence.ts`):
 *  - only CLOSED on an instance that is no longer registered is a loss;
 *    CHANNEL_ERROR / TIMED_OUT leave it registered while phoenix rejoins it;
 *  - the dead instance is left alone: tearing down a closed channel clears
 *    its reply bindings, and it is already out of the registry;
 *  - rebuilds are bounded (`CHANNEL_LOSS_RETRY_DELAYS_MS`), then wait for the
 *    next foreground, UNLESS `options.keepRetrying()` says so at that moment:
 *    then it keeps rebuilding at the last step (30s). The incoming-challenge
 *    channel passes "the athlete is live": a live phone is held awake
 *    (`useArenaLiveKeepAwake`), so no foreground would ever come, and a live,
 *    challengeable athlete would get no prompt for new challenges (the same
 *    reasoning as the lobby's `recoverLater`).
 * `build` returns a fresh, bound, NOT yet subscribed channel. `onSubscribed`
 * runs on every SUBSCRIBED; `rebuilt` is true for the first one after a loss,
 * when events may have been missed. Returns the teardown, which also carries
 * `resume()`: restart a channel that gave up without waiting for a foreground.
 * A live phone is held awake, so the caller calls it when the athlete goes
 * live: a channel that gave up while offline would otherwise stay down for the
 * whole live session (`keepRetrying` is read only when a loss happens).
 */
export interface SuperviseChannelOptions {
  /**
   * Asked when the delay table is exhausted: true keeps rebuilding at the
   * last step instead of waiting for the next foreground.
   */
  keepRetrying?: () => boolean;
}

/** The teardown returned by `superviseChannel`, plus a manual restart. */
export type SupervisedChannel = (() => void) & {
  /**
   * Restart now if the channel gave up (a fresh losing streak); a no-op while
   * it is up, rebuilding on a timer, or stopped.
   */
  resume: () => void;
};

export function superviseChannel(
  label: string,
  build: () => RealtimeChannel,
  onSubscribed: (rebuilt: boolean) => void,
  options: SuperviseChannelOptions = {},
): SupervisedChannel {
  let stopped = false;
  let current: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let losses = 0;
  let subscribedAt: number | null = null;
  let rebuilt = false;
  let gaveUp = false;

  const start = () => {
    if (stopped) return;
    const channel = build();
    current = channel;
    channel.subscribe((status) => {
      // Our own teardown (stopped) or an instance already replaced.
      if (stopped || current !== channel) return;
      if (status === "SUBSCRIBED") {
        subscribedAt = Date.now();
        const wasRebuilt = rebuilt;
        rebuilt = false;
        onSubscribed(wasRebuilt);
        return;
      }
      if (status === "CLOSED" && !isRegistered(channel)) lost();
    });
  };

  const lost = () => {
    current = null;
    if (
      subscribedAt !== null &&
      Date.now() - subscribedAt >= CHANNEL_LOSS_STREAK_RESET_MS
    ) {
      losses = 0;
    }
    subscribedAt = null;
    losses += 1;
    rebuilt = true;
    const delay =
      CHANNEL_LOSS_RETRY_DELAYS_MS[losses - 1] ??
      (options.keepRetrying?.()
        ? CHANNEL_LOSS_RETRY_DELAYS_MS[CHANNEL_LOSS_RETRY_DELAYS_MS.length - 1]
        : undefined);
    if (delay === undefined) {
      console.warn(
        `[realtime] gave up rebuilding the ${label} channel; retrying when the app next returns to the foreground`,
      );
      gaveUp = true;
      return;
    }
    console.warn(`[realtime] ${label} channel closed; rebuilding it (loss ${losses} in a row)`);
    timer = setTimeout(() => {
      timer = null;
      start();
    }, delay);
  };

  const resume = () => {
    if (!gaveUp || stopped) return;
    gaveUp = false;
    losses = 0;
    start();
  };

  const appStateSub = AppState.addEventListener("change", (next) => {
    if (next === "active") resume();
  });

  start();

  const stop = () => {
    stopped = true;
    appStateSub.remove();
    if (timer) clearTimeout(timer);
    if (current) void supabase.removeChannel(current);
    current = null;
  };
  return Object.assign(stop, { resume });
}
