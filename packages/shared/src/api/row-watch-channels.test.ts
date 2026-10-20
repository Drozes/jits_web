/**
 * Row watchers own their realtime channel (jits-i5ih). realtime-js
 * `RealtimeClient.channel(topic)` hands back the channel already registered
 * under a topic, and `.on("postgres_changes", ...)` on a joining or joined
 * channel throws, so two watchers of the same row must get two topics. The
 * mobile invite screen and the Arena's bookings can both watch one booking.
 *
 * Runs against the real RealtimeClient over a socket that never connects:
 * `subscribe()` alone puts a channel in `joining`, which is enough for the
 * throw this guards against.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { RealtimeClient } from "@supabase/supabase-js";
import { subscribeToChallengeStatus } from "./location";
import { subscribeToInvite } from "./invites";

/** A WebSocket that never opens: channels stay `joining`, nothing goes on the wire. */
class SilentSocket {
  readyState = 0;
  bufferedAmount = 0;
  binaryType = "arraybuffer";
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(_url: string) {}
  send() {}
  close() {
    this.readyState = 3;
  }
}

let clients: RealtimeClient[] = [];
afterEach(async () => {
  await Promise.all(clients.map((rt) => rt.disconnect()));
  clients = [];
});

function harness() {
  const realtime = new RealtimeClient("ws://realtime.test/realtime/v1", {
    params: { apikey: "test" },
    transport: SilentSocket as never,
    vsn: "1.0.0",
  });
  clients.push(realtime);
  // The slice of SupabaseClient these helpers touch; supabase-js delegates
  // channel / removeChannel straight to its RealtimeClient.
  const client = {
    channel: (name: string) => realtime.channel(name),
    removeChannel: (channel: ReturnType<RealtimeClient["channel"]>) => realtime.removeChannel(channel),
  };
  const topics = () => realtime.getChannels().map((c) => c.topic);
  return { realtime, client, topics };
}

/** The row a topic watches, without whatever per-call suffix the helper adds. */
const rowTopic = (prefix: string, topic: string) =>
  topic.replace(new RegExp(`^(realtime:${prefix}:[^:]+):.+$`), "$1");

describe.each([
  {
    name: "subscribeToChallengeStatus",
    prefix: "challenge-status",
    watch: (client: unknown, id: string) => subscribeToChallengeStatus(client as never, id, vi.fn()),
  },
  {
    name: "subscribeToInvite",
    prefix: "invite",
    watch: (client: unknown, id: string) => subscribeToInvite(client as never, id, vi.fn()),
  },
])("$name: every call owns its channel (jits-i5ih)", ({ prefix, watch }) => {
  it("a second watcher of the same row subscribes on its own topic instead of throwing", () => {
    const h = harness();
    const stopFirst = watch(h.client, "row-1");
    // Before the fix: "cannot add `postgres_changes` callbacks for
    // realtime:<prefix>:row-1 after `subscribe()`".
    const stopSecond = watch(h.client, "row-1");
    expect(h.topics().map((t) => rowTopic(prefix, t))).toEqual([`realtime:${prefix}:row-1`, `realtime:${prefix}:row-1`]);
    expect(new Set(h.topics()).size).toBe(2);
    stopFirst();
    stopSecond();
  });

  it("stopping one watcher removes only its own channel", async () => {
    const h = harness();
    const stopFirst = watch(h.client, "row-1");
    const stopSecond = watch(h.client, "row-1");
    const [, secondTopic] = h.topics();
    stopFirst();
    await vi.waitFor(() => expect(h.topics()).toEqual([secondTopic]));
    const survivor = h.realtime.getChannels()[0];
    expect(survivor.state).not.toBe("closed");
    stopSecond();
    await vi.waitFor(() => expect(h.topics()).toEqual([]));
  });
});
