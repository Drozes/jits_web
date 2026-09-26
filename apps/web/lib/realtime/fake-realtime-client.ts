import { vi } from "vitest";

/**
 * Test double for the realtime surface the presence owners use. Mirrors the
 * realtime-js 2.105 behaviours that matter here: `channel(topic)` hands back
 * a still-registered instance, `removeChannel()` unregisters only once it
 * resolves "ok", and a server close drops the instance from the registry
 * before its CLOSED callback fires. Test-only.
 */
export type CallResult = "ok" | "timed out" | "error";

export class FakeChannel {
  state: "closed" | "joining" | "joined" = "closed";
  private statusCb: ((status: string) => void) | null = null;
  private syncCb: (() => void) | null = null;
  presence: Record<string, unknown[]> = {};
  /** What the next track/untrack returns; a never-settling promise hangs it. */
  nextCall: () => Promise<CallResult> = async () => "ok";
  track = vi.fn((_payload: unknown) => this.nextCall());
  untrack = vi.fn(() => this.nextCall());
  teardown = vi.fn();

  constructor(
    readonly topic: string,
    private readonly client: FakeClient,
  ) {}

  on(_type: string, _filter: unknown, cb: () => void) {
    this.syncCb = cb;
    return this;
  }
  subscribe(cb: (status: string) => void) {
    this.statusCb = cb;
    this.state = "joining";
    return this;
  }
  presenceState() {
    return this.presence;
  }

  // --- test controls ---
  join() {
    this.state = "joined";
    this.statusCb?.("SUBSCRIBED");
  }
  sync(presence: Record<string, unknown[]>) {
    this.presence = presence;
    this.syncCb?.();
  }
  /** phx_close from the server, e.g. ClientPresenceRateLimitReached. */
  serverClose() {
    this.state = "closed";
    this.client.unregister(this);
    this.statusCb?.("CLOSED");
  }
  /** An error phoenix will rejoin by itself: stays registered. */
  error() {
    this.statusCb?.("CHANNEL_ERROR");
  }
  closeFromRemoval() {
    this.state = "closed";
    this.statusCb?.("CLOSED");
  }
}

export class FakeClient {
  channels: FakeChannel[] = [];
  /** Every instance ever built, in order. */
  built: FakeChannel[] = [];
  /** Resolves a removal; replace to hold removals open. */
  removalResult: () => Promise<CallResult> = async () => "ok";

  channel(name: string) {
    const topic = `realtime:${name}`;
    const existing = this.channels.find((c) => c.topic === topic);
    if (existing) return existing;
    const ch = new FakeChannel(topic, this);
    this.channels.push(ch);
    this.built.push(ch);
    return ch;
  }
  getChannels() {
    return this.channels;
  }
  removeChannel = vi.fn(async (ch: FakeChannel) => {
    const status = await this.removalResult();
    if (status === "ok") {
      this.unregister(ch);
      ch.closeFromRemoval();
    }
    return status;
  });
  unregister(ch: FakeChannel) {
    this.channels = this.channels.filter((c) => c !== ch);
  }
  /** The most recently built instance. */
  get last(): FakeChannel {
    const ch = this.built[this.built.length - 1];
    if (!ch) throw new Error("no channel built yet");
    return ch;
  }
}

/** A promise with its resolver exposed. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
