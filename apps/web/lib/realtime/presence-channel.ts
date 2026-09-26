import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/** The slice of the client the channel owners need. */
export type ChannelClient = Pick<SupabaseClient, "getChannels" | "removeChannel">;

/**
 * Shared pieces of the `app:online` and `lobby:online` channel owners
 * (jits-ifvw, web parity with mobile jits-fa9x).
 *
 * Realtime enforces a per-channel presence rate limit (5 track/untrack calls
 * per 30s) and CLOSES a channel past it. realtime-js drops a closed channel
 * from its registry and never rejoins it, so an owner that only handles
 * SUBSCRIBED goes silently dead until a reload. Each owner therefore treats a
 * CLOSED for its channel, once the channel is no longer registered, as a loss
 * and rebuilds on the backoff below. CHANNEL_ERROR and TIMED_OUT are not
 * losses while the instance is still registered: phoenix rejoins that exact
 * instance itself and SUBSCRIBED fires again.
 */

/**
 * Rebuild delays after the server closed the owned channel, indexed by losses
 * in a row. The first rebuild is quick (a fresh channel clears the rate
 * limit); later ones widen so a server that keeps closing is not hammered.
 * Past the last step the owner waits for the tab to become visible again.
 */
export const LOSS_RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000];

/** Joined at least this long before a loss ends the losing streak. */
export const LOSS_STREAK_RESET_MS = 30_000;

/**
 * Hard upper bound on one awaited presence or removal call. phoenix normally
 * answers an unreplied push with "timed out" after 10s, but a rate-limited
 * call can get no reply at all, and once its channel is torn down nothing is
 * left to fire that timeout, so the promise never settles.
 */
export const PRESENCE_CALL_TIMEOUT_MS = 12_000;

/** Resolves to the call's own result, or "timed out" past `ms`. Never rejects. */
export async function settleWithin<T>(
  call: Promise<T>,
  ms: number = PRESENCE_CALL_TIMEOUT_MS,
  gone?: Promise<"lost">,
): Promise<T | "timed out" | "error" | "lost"> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      call.catch(() => "error" as const),
      new Promise<"timed out">((resolve) => {
        timer = setTimeout(() => resolve("timed out"), ms);
      }),
      ...(gone ? [gone] : []),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** True while the client still holds this exact channel instance. */
export function isRegistered(
  supabase: ChannelClient,
  channel: RealtimeChannel | null,
): boolean {
  if (!channel) return false;
  return supabase.getChannels().some((c) => c === channel);
}

/**
 * Drop a channel the owner lost. A channel the server CLOSED needs nothing
 * more (phoenix already dropped it), and tearing it down would clear the
 * reply bindings a pending push needs to ever time out. Anything else is torn
 * down locally, not via `removeChannel()`: that pushes a leave for this topic,
 * and realtime-js unregisters BY TOPIC on close, so a late close could take
 * the replacement with it.
 */
export function discardLostChannel(channel: RealtimeChannel): void {
  if (channel.state !== "closed") channel.teardown();
}

/**
 * Clear any instance still registered under `topic` before building a new
 * one: `supabase.channel(topic)` hands back a registered instance, whose
 * `subscribe()` is a no-op. Returns false when a removal did not confirm, in
 * which case the caller must not build (it would get that instance back).
 */
export async function clearStrayChannel(
  supabase: ChannelClient,
  topic: string,
): Promise<boolean> {
  const stray = supabase
    .getChannels()
    .find((c) => c.topic === `realtime:${topic}`);
  if (!stray) return true;
  return (await settleWithin(supabase.removeChannel(stray))) === "ok";
}
