// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { RealtimeClient } from "@supabase/supabase-js";
import { useVideoProgress } from "./use-video-progress";

function snapshot(over: Record<string, unknown> = {}) {
  return {
    video_id: "v1",
    status: "analyzed",
    chunk_count: 2,
    chunks_completed: 2,
    failed_chunk_count: 0,
    requested_tier: "standard",
    slice_started_at: null,
    slice_completed_at: null,
    merge_started_at: null,
    merge_completed_at: null,
    latest_error_message: null,
    chunks: [],
    ...over,
  };
}

function createClient(rpcResult: { data: unknown; error: unknown }) {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue("ok"),
  };
}

async function load(rpcData: unknown) {
  const client = createClient({ data: rpcData, error: null });
  const { result } = renderHook(() => useVideoProgress(client as never, "v1"));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  return result.current.data!;
}

describe("useVideoProgress match detection (jr_be-0qf)", () => {
  it("passes an explicit no-match through with its trimmed reason", async () => {
    const data = await load(snapshot({ match_detected: false, no_match_reason: " Nobody is on the mat. " }));
    expect(data.match_detected).toBe(false);
    expect(data.no_match_reason).toBe("Nobody is on the mat.");
    expect(data.status).toBe("analyzed");
  });

  it("keeps true and drops a reason", async () => {
    const data = await load(snapshot({ match_detected: true, no_match_reason: "stray" }));
    expect(data.match_detected).toBe(true);
    expect(data.no_match_reason).toBeNull();
  });

  it.each([
    ["null (not analysed yet / legacy)", { match_detected: null, no_match_reason: null }],
    ["absent (older backend)", {}],
  ])("reads match_detected %s as null", async (_label, over) => {
    const data = await load(snapshot({ status: "analyzing", ...over }));
    expect(data.match_detected).toBeNull();
    expect(data.no_match_reason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Channel ownership (jits-i5ih), against the REAL realtime-js client
// ---------------------------------------------------------------------------
//
// A hand-written channel mock can only mirror what we believe realtime-js
// does. These run the real `RealtimeClient` (supabase-js 2.105.4) over an
// in-process fake Realtime server, so the registry reuse in `channel(topic)`,
// the `.on()`-after-`subscribe()` throw and `removeChannel`'s unregistering
// are the library's own. Protocol vsn 1.0.0 keeps the frames plain JSON.

interface WireMessage {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  ref: string | null;
  join_ref?: string | null;
}

interface ServerBinding {
  id: number;
  table: string;
  filter: string;
}

function fakeRealtimeServer() {
  /** Live server-side subscriptions by topic. */
  const subs = new Map<string, { socket: FakeSocket; joinRef: string | null | undefined; bindings: ServerBinding[] }>();
  const leaves: string[] = [];
  let nextBindingId = 1;

  class FakeSocket {
    readyState = 0;
    bufferedAmount = 0;
    binaryType = "arraybuffer";
    onopen: ((e: unknown) => void) | null = null;
    onclose: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;

    constructor(_url: string) {
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.({});
      }, 0);
    }

    deliver(msg: WireMessage) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }

    /** A network round trip later, like the real server. */
    private reply(msg: WireMessage, response: Record<string, unknown> = {}) {
      setTimeout(() => {
        if (this.readyState !== 1) return;
        this.deliver({ ...msg, event: "phx_reply", payload: { status: "ok", response } });
      }, 0);
    }

    send(raw: string) {
      const msg = JSON.parse(raw) as WireMessage;
      if (msg.event === "phx_join") {
        const config = (msg.payload.config ?? {}) as {
          postgres_changes?: { event: string; schema: string; table: string; filter?: string }[];
        };
        const pg = (config.postgres_changes ?? []).map((f) => ({ ...f, id: nextBindingId++ }));
        subs.set(msg.topic, {
          socket: this,
          joinRef: msg.join_ref,
          bindings: pg.map((f) => ({ id: f.id, table: f.table, filter: f.filter ?? "" })),
        });
        this.reply(msg, { postgres_changes: pg });
      } else if (msg.event === "phx_leave") {
        leaves.push(msg.topic);
        subs.delete(msg.topic);
        this.reply(msg);
      } else {
        this.reply(msg);
      }
    }

    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1000, reason: "" });
    }
  }

  return {
    transport: FakeSocket,
    leaves,
    /** Server-side topics with a live subscription. */
    subscribedTopics: () => [...subs.keys()],
    /** A row change: every subscription with a matching binding hears it. */
    emit(table: string, filter: string) {
      for (const [topic, sub] of subs) {
        const ids = sub.bindings.filter((b) => b.table === table && b.filter === filter).map((b) => b.id);
        if (ids.length === 0) continue;
        sub.socket.deliver({
          topic,
          event: "postgres_changes",
          payload: {
            ids,
            data: {
              type: "UPDATE",
              schema: "public",
              table,
              commit_timestamp: "2026-10-19T00:00:00Z",
              columns: [],
              record: {},
              old_record: {},
              errors: null,
            },
          },
          ref: null,
          join_ref: sub.joinRef,
        });
      }
    },
  };
}

let realtimeClients: RealtimeClient[] = [];

afterEach(async () => {
  await Promise.all(realtimeClients.map((rt) => rt.disconnect()));
  realtimeClients = [];
});

/** The video a channel's topic watches, without whatever per-subscription suffix the hook adds. */
const videoTopic = (topic: string) => topic.replace(/^(realtime:video_progress:[^:]+):.+$/, "$1");

function realtimeHarness() {
  const server = fakeRealtimeServer();
  const realtime = new RealtimeClient("ws://realtime.test/realtime/v1", {
    params: { apikey: "test" },
    transport: server.transport as never,
    vsn: "1.0.0",
  });
  realtimeClients.push(realtime);
  const rpc = vi.fn((_fn: string, args: { p_video_id: string }) =>
    Promise.resolve({ data: snapshot({ video_id: args.p_video_id, status: "analyzing" }), error: null }),
  );
  // The slice of SupabaseClient the hook touches; supabase-js delegates
  // channel / removeChannel straight to its RealtimeClient.
  const client = {
    rpc,
    channel: (name: string) => realtime.channel(name),
    removeChannel: (channel: ReturnType<RealtimeClient["channel"]>) => realtime.removeChannel(channel),
  };
  const registered = () => realtime.getChannels();
  /**
   * Waits until exactly these videos have a registered AND joined channel
   * each, every one on its own topic. The per-subscription suffix's form is
   * not part of the contract (a counter or a random mount id both fix
   * jits-i5ih), only that topics differ.
   */
  const joined = (videoIds: string[]) =>
    waitFor(() => {
      const chans = registered();
      expect(chans.map((c) => videoTopic(c.topic)).sort()).toEqual(
        videoIds.map((id) => `realtime:video_progress:${id}`).sort(),
      );
      expect(new Set(chans.map((c) => c.topic)).size).toBe(chans.length);
      expect(chans.every((c) => c.state === "joined")).toBe(true);
    });
  const rpcCallsFor = (videoId: string) => rpc.mock.calls.filter(([, a]) => a.p_video_id === videoId).length;
  return { server, realtime, client, rpc, registered, joined, rpcCallsFor };
}

describe("useVideoProgress channel ownership (jits-i5ih)", () => {
  it("two mounts of the same video each own a joined channel; unmounting one leaves the other live", async () => {
    const h = realtimeHarness();
    const first = renderHook(() => useVideoProgress(h.client as never, "v1"));
    await h.joined(["v1"]);
    const [firstChannel] = h.registered();

    // Before the fix this threw "cannot add `postgres_changes` callbacks for
    // realtime:video_progress:v1 after `subscribe()`" (the E17 crash).
    const second = renderHook(() => useVideoProgress(h.client as never, "v1"));
    await h.joined(["v1", "v1"]);
    const secondChannel = h.registered().find((c) => c !== firstChannel)!;
    expect(secondChannel.topic).not.toBe(firstChannel.topic);
    expect(h.server.subscribedTopics().sort()).toEqual([firstChannel.topic, secondChannel.topic].sort());

    second.unmount();
    // Exactly the unmounted mount's channel left, client and server side.
    expect(h.registered()).toEqual([firstChannel]);
    expect(firstChannel.state).toBe("joined");
    await waitFor(() => expect(h.server.leaves).toEqual([secondChannel.topic]));
    expect(h.server.subscribedTopics()).toEqual([firstChannel.topic]);

    // The survivor still hears the server and refreshes from it.
    await waitFor(() => expect(first.result.current.data).not.toBeNull());
    const before = h.rpcCallsFor("v1");
    h.server.emit("match_videos", "id=eq.v1");
    await waitFor(() => expect(h.rpcCallsFor("v1")).toBe(before + 1));

    first.unmount();
    expect(h.registered()).toEqual([]);
  });

  it("switching onto a video another mount watches, and back, never touches that mount's channel", async () => {
    const h = realtimeHarness();
    const a = renderHook(() => useVideoProgress(h.client as never, "v1"));
    const b = renderHook(({ id }: { id: string }) => useVideoProgress(h.client as never, id), {
      initialProps: { id: "v2" },
    });
    await h.joined(["v1", "v2"]);
    const aChannel = h.registered().find((c) => videoTopic(c.topic) === "realtime:video_progress:v1")!;
    const bFirst = h.registered().find((c) => c !== aChannel)!;

    // Before the fix this re-render threw (b reached for a's joined channel).
    b.rerender({ id: "v1" });
    await h.joined(["v1", "v1"]);
    const bSecond = h.registered().find((c) => c !== aChannel)!;
    expect(bFirst.state).toBe("closed");
    expect(h.registered()).toContain(aChannel);

    b.rerender({ id: "v2" });
    await h.joined(["v1", "v2"]);
    expect(bSecond.state).toBe("closed");
    expect(h.registered()).toContain(aChannel);
    expect(aChannel.state).toBe("joined");
    await waitFor(() => expect(h.server.leaves.sort()).toEqual([bFirst.topic, bSecond.topic].sort()));

    // a was never disturbed: a row change on v1 still reaches it.
    await waitFor(() => expect(a.result.current.data?.video_id).toBe("v1"));
    const before = h.rpcCallsFor("v1");
    h.server.emit("match_videos", "id=eq.v1");
    await waitFor(() => expect(h.rpcCallsFor("v1")).toBe(before + 1));

    a.unmount();
    b.unmount();
    expect(h.registered()).toEqual([]);
  });

  it("a single mount moving v1 -> v2 -> v1 removes each previous channel and ends on a joined v1 channel", async () => {
    const h = realtimeHarness();
    const view = renderHook(({ id }: { id: string }) => useVideoProgress(h.client as never, id), {
      initialProps: { id: "v1" },
    });
    await h.joined(["v1"]);
    const c1 = h.registered()[0];

    view.rerender({ id: "v2" });
    await h.joined(["v2"]);
    const c2 = h.registered()[0];
    expect(c1.state).toBe("closed");

    view.rerender({ id: "v1" });
    await h.joined(["v1"]);
    const c3 = h.registered()[0];
    expect(c2.state).toBe("closed");
    expect(c3).not.toBe(c1);
    expect(h.server.subscribedTopics()).toEqual([c3.topic]);

    // The fresh channel carries both filters and hears the chunk table too.
    const before = h.rpcCallsFor("v1");
    h.server.emit("video_chunks", "video_id=eq.v1");
    await waitFor(() => expect(h.rpcCallsFor("v1")).toBe(before + 1));

    view.unmount();
    expect(h.registered()).toEqual([]);
  });
});
