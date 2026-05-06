/**
 * Tests for the offline mutation queue.
 *
 * The MutationQueue is a singleton class that:
 * - Runs mutations immediately when online
 * - Queues mutations with a stable key when offline (last-write-wins)
 * - Flushes FIFO on reconnect via NetInfo listener
 * - Notifies listeners on size changes
 */

// ---------------------------------------------------------------------------
// Mocks -- all variables referenced inside jest.mock() must be prefixed "mock"
// ---------------------------------------------------------------------------

// NetInfo mock: we capture the listener so tests can simulate reconnect.
let mockNetInfoListener: ((state: { isConnected: boolean | null }) => void) | null =
  null;
let mockNetInfoFetchResult = { isConnected: true };

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() => Promise.resolve(mockNetInfoFetchResult)),
    addEventListener: jest.fn(
      (listener: (state: { isConnected: boolean | null }) => void) => {
        mockNetInfoListener = listener;
        return jest.fn(); // unsubscribe
      },
    ),
  },
}));

// We need __DEV__ to be defined for the module
// @ts-expect-error -- global override for test
globalThis.__DEV__ = true;

// ---------------------------------------------------------------------------
// Import under test -- we need a fresh instance for each test, so we use
// jest.isolateModules to get a clean singleton per test.
// ---------------------------------------------------------------------------

import type { QueuedResult } from "@/lib/network/mutation-queue";

function loadFreshQueue() {
  let mod: typeof import("@/lib/network/mutation-queue");
  jest.isolateModules(() => {
    mod = require("@/lib/network/mutation-queue");
  });
  // Reset the listener captured by the fresh module
  mockNetInfoListener = null;
  return mod!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockNetInfoFetchResult = { isConnected: true };
  mockNetInfoListener = null;
});

describe("MutationQueue", () => {
  describe("online behavior", () => {
    it("runs the function immediately when online", async () => {
      const { mutationQueue } = loadFreshQueue();
      const fn = jest.fn().mockResolvedValue({ ok: true, data: { id: "1" } });

      const result = await mutationQueue.enqueue("key-1", fn);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: true, data: { id: "1" } });
    });

    it("returns the mutation result directly when online", async () => {
      const { mutationQueue } = loadFreshQueue();
      const fn = jest
        .fn()
        .mockResolvedValue({ ok: false, error: { code: "UNKNOWN" } });

      const result = await mutationQueue.enqueue("key-2", fn);

      expect(result).toEqual({ ok: false, error: { code: "UNKNOWN" } });
    });

    it("queues defensively if the function throws (rare case)", async () => {
      const { mutationQueue, isQueuedResult } = loadFreshQueue();
      const fn = jest.fn().mockRejectedValue(new Error("Network error"));

      const result = await mutationQueue.enqueue("key-throw", fn);

      // Should get a queued result since the fn threw
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(isQueuedResult(result.data)).toBe(true);
      }
    });
  });

  describe("offline behavior", () => {
    it("queues the mutation and returns a QueuedResult when offline", async () => {
      const { mutationQueue, isQueuedResult } = loadFreshQueue();

      // Trigger ensureSubscribed, then go offline
      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );

      // Now simulate offline via the NetInfo listener
      mockNetInfoListener?.({ isConnected: false });

      const fn = jest.fn();
      const result = await mutationQueue.enqueue("offline-key", fn);

      expect(fn).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(isQueuedResult(result.data)).toBe(true);
        expect((result.data as QueuedResult).key).toBe("offline-key");
      }
      expect(mutationQueue.size()).toBe(1);
    });

    it("replaces a prior queued entry for the same key (last-write-wins)", async () => {
      const { mutationQueue } = loadFreshQueue();

      // Go online first to subscribe, then offline
      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      const fn1 = jest.fn().mockResolvedValue({ ok: true, data: "first" });
      const fn2 = jest.fn().mockResolvedValue({ ok: true, data: "second" });

      await mutationQueue.enqueue("same-key", fn1);
      await mutationQueue.enqueue("same-key", fn2);

      // Only one entry under that key
      expect(mutationQueue.size()).toBe(1);

      // Reconnect: only fn2 should run
      mockNetInfoListener?.({ isConnected: true });

      // Wait for flush
      await new Promise((r) => setTimeout(r, 50));

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it("queues multiple entries with different keys", async () => {
      const { mutationQueue } = loadFreshQueue();

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      await mutationQueue.enqueue(
        "key-a",
        jest.fn().mockResolvedValue({ ok: true, data: "a" }),
      );
      await mutationQueue.enqueue(
        "key-b",
        jest.fn().mockResolvedValue({ ok: true, data: "b" }),
      );

      expect(mutationQueue.size()).toBe(2);
    });
  });

  describe("flush on reconnect", () => {
    it("flushes all entries FIFO when connectivity is restored", async () => {
      const { mutationQueue } = loadFreshQueue();
      const callOrder: string[] = [];

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      const fnA = jest.fn().mockImplementation(async () => {
        callOrder.push("a");
        return { ok: true, data: "a" };
      });
      const fnB = jest.fn().mockImplementation(async () => {
        callOrder.push("b");
        return { ok: true, data: "b" };
      });

      await mutationQueue.enqueue("key-a", fnA);
      await mutationQueue.enqueue("key-b", fnB);

      expect(mutationQueue.size()).toBe(2);

      // Reconnect
      mockNetInfoListener?.({ isConnected: true });

      await new Promise((r) => setTimeout(r, 50));

      expect(fnA).toHaveBeenCalledTimes(1);
      expect(fnB).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["a", "b"]); // FIFO
      expect(mutationQueue.size()).toBe(0);
    });

    it("stops flushing if connectivity drops mid-flush", async () => {
      const { mutationQueue } = loadFreshQueue();

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      const fnA = jest.fn().mockImplementation(async () => {
        // Simulate network dropping during flush of first entry
        mockNetInfoListener?.({ isConnected: false });
        return { ok: true, data: "a" };
      });
      const fnB = jest.fn().mockResolvedValue({ ok: true, data: "b" });

      await mutationQueue.enqueue("key-a", fnA);
      await mutationQueue.enqueue("key-b", fnB);

      // Reconnect to trigger flush
      mockNetInfoListener?.({ isConnected: true });

      await new Promise((r) => setTimeout(r, 50));

      // fnA ran, but fnB was skipped because isConnected went false
      expect(fnA).toHaveBeenCalledTimes(1);
      expect(fnB).not.toHaveBeenCalled();
      // key-b should still be queued
      expect(mutationQueue.size()).toBe(1);
    });

    it("handles errors during flush silently (does not re-queue)", async () => {
      const { mutationQueue } = loadFreshQueue();
      const consoleWarn = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      const fnFail = jest.fn().mockRejectedValue(new Error("Server error"));
      const fnOk = jest.fn().mockResolvedValue({ ok: true, data: "ok" });

      await mutationQueue.enqueue("key-fail", fnFail);
      await mutationQueue.enqueue("key-ok", fnOk);

      mockNetInfoListener?.({ isConnected: true });

      await new Promise((r) => setTimeout(r, 50));

      expect(fnFail).toHaveBeenCalledTimes(1);
      expect(fnOk).toHaveBeenCalledTimes(1);
      expect(mutationQueue.size()).toBe(0);

      consoleWarn.mockRestore();
    });

    it("does not flush concurrently (flushing guard)", async () => {
      const { mutationQueue } = loadFreshQueue();

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      let flushCount = 0;
      const slowFn = jest.fn().mockImplementation(async () => {
        flushCount++;
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true, data: "slow" };
      });

      await mutationQueue.enqueue("key-slow", slowFn);

      // Trigger two reconnects rapidly
      mockNetInfoListener?.({ isConnected: true });
      mockNetInfoListener?.({ isConnected: true });

      await new Promise((r) => setTimeout(r, 100));

      // Should only have flushed once
      expect(flushCount).toBe(1);
    });
  });

  describe("clear", () => {
    it("clears all entries without running them", async () => {
      const { mutationQueue } = loadFreshQueue();

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      const fn = jest.fn();
      await mutationQueue.enqueue("key-cleared", fn);

      expect(mutationQueue.size()).toBe(1);

      mutationQueue.clear();

      expect(mutationQueue.size()).toBe(0);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("subscribe (listener)", () => {
    it("notifies listeners when entries are added", async () => {
      const { mutationQueue } = loadFreshQueue();
      const listener = jest.fn();

      mutationQueue.subscribe(listener);

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      await mutationQueue.enqueue("key-1", jest.fn());

      expect(listener).toHaveBeenCalled();
    });

    it("notifies listeners when entries are flushed", async () => {
      const { mutationQueue } = loadFreshQueue();
      const listener = jest.fn();

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      await mutationQueue.enqueue(
        "key-1",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );

      mutationQueue.subscribe(listener);
      listener.mockClear();

      mockNetInfoListener?.({ isConnected: true });

      await new Promise((r) => setTimeout(r, 50));

      expect(listener).toHaveBeenCalled();
    });

    it("returns an unsubscribe function", async () => {
      const { mutationQueue } = loadFreshQueue();
      const listener = jest.fn();

      const unsub = mutationQueue.subscribe(listener);
      unsub();

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      await mutationQueue.enqueue("key-1", jest.fn());

      expect(listener).not.toHaveBeenCalled();
    });

    it("notifies listeners on clear", async () => {
      const { mutationQueue } = loadFreshQueue();
      const listener = jest.fn();

      await mutationQueue.enqueue(
        "warmup",
        jest.fn().mockResolvedValue({ ok: true, data: null }),
      );
      mockNetInfoListener?.({ isConnected: false });

      await mutationQueue.enqueue("key-1", jest.fn());

      mutationQueue.subscribe(listener);
      listener.mockClear();

      mutationQueue.clear();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe("isQueuedResult", () => {
    it("returns true for a QueuedResult shape", () => {
      const { isQueuedResult } = loadFreshQueue();
      expect(isQueuedResult({ queued: true, key: "abc" })).toBe(true);
    });

    it("returns false for non-queued values", () => {
      const { isQueuedResult } = loadFreshQueue();
      expect(isQueuedResult(null)).toBe(false);
      expect(isQueuedResult(undefined)).toBe(false);
      expect(isQueuedResult({ queued: false })).toBe(false);
      expect(isQueuedResult({ id: "abc" })).toBe(false);
      expect(isQueuedResult("string")).toBe(false);
    });
  });
});
