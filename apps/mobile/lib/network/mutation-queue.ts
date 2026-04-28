import NetInfo from "@react-native-community/netinfo";
import type { Result } from "@jits/shared/api/errors";

/**
 * In-memory mutation queue for critical writes that must not be lost during
 * a brief network blip (user backgrounded the app on a flaky connection
 * mid-match, etc.).
 *
 * Scope (Phase 5 B1): only `recordMatchResult` and `confirmMatchResult` are
 * intended to use this queue. Other mutations should fail fast and surface
 * a toast.
 *
 * Persistence is intentionally NOT implemented in B1 -- the queue is wiped
 * if the process is killed. Persisting to AsyncStorage / SecureStore is a
 * follow-up if real-world telemetry shows this matters.
 *
 * Behavior:
 * - When connected: runs the function immediately and returns its `Result`.
 * - When offline: stashes the function under a stable key (later enqueues
 *   for the same key REPLACE the previous one -- last write wins for a
 *   given match/result) and returns a pending-style result. The pending
 *   result is `{ ok: true, data: { queued: true } }` cast through the
 *   user's `Result<T>` shape -- callers check `data` for the `queued`
 *   marker via `isQueuedResult`.
 *
 * The queue subscribes to NetInfo and flushes FIFO on reconnect.
 */

type QueuedFn<T> = () => Promise<Result<T>>;

type QueueEntry = {
  key: string;
  fn: QueuedFn<unknown>;
  /** Resolver for the promise returned by `enqueue`. */
  resolve: (result: Result<unknown>) => void;
};

/** Sentinel returned when a mutation is queued for offline replay. */
export type QueuedResult = { queued: true; key: string };

export function isQueuedResult(value: unknown): value is QueuedResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { queued?: unknown }).queued === true
  );
}

class MutationQueue {
  private entries = new Map<string, QueueEntry>();
  private flushing = false;
  private subscribed = false;
  /** Cached connectivity. Optimistic default so first call doesn't queue. */
  private isConnected = true;
  /** Listeners notified whenever the queue size changes. */
  private listeners = new Set<() => void>();

  private ensureSubscribed() {
    if (this.subscribed) return;
    this.subscribed = true;

    NetInfo.fetch().then((state) => {
      this.isConnected = state.isConnected ?? true;
    });

    NetInfo.addEventListener((state) => {
      const next = state.isConnected ?? true;
      const wasOffline = !this.isConnected;
      this.isConnected = next;
      if (wasOffline && next) {
        // Reconnected -- drain the queue.
        void this.flush();
      }
    });
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Don't let a misbehaving listener break the queue.
      }
    }
  }

  /**
   * Subscribe to queue size changes. Returns an unsubscribe function.
   * Used by the queued-status banner so the UI can react when entries
   * are added (offline write) or drained (reconnect flush).
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Run `fn` immediately if online, otherwise queue under `key` and return
   * a `QueuedResult` so the UI can show a "saved offline" affordance.
   *
   * If a previous queued entry exists for `key`, it is replaced and its
   * resolver is settled with the same queued sentinel (last write wins).
   */
  async enqueue<T>(key: string, fn: QueuedFn<T>): Promise<Result<T | QueuedResult>> {
    this.ensureSubscribed();

    if (this.isConnected) {
      try {
        return (await fn()) as Result<T | QueuedResult>;
      } catch {
        // Rare: fn threw rather than returning Result. Re-queue defensively.
      }
    }

    return new Promise<Result<T | QueuedResult>>((resolve) => {
      // Replace any prior pending entry for this key.
      const prior = this.entries.get(key);
      if (prior) {
        prior.resolve({ ok: true, data: { queued: true, key } });
      }
      this.entries.set(key, {
        key,
        fn: fn as QueuedFn<unknown>,
        resolve: resolve as (result: Result<unknown>) => void,
      });
      this.notifyListeners();
      // Resolve the caller right away with a queued sentinel so UI can move on.
      resolve({ ok: true, data: { queued: true, key } });
    });
  }

  /**
   * Drain the queue in FIFO order. Each entry's `fn` is awaited; the result
   * is logged but not surfaced (the original caller already saw a queued
   * result). If the network drops mid-flush, remaining entries stay queued
   * and will be retried on the next reconnect.
   */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const keys = Array.from(this.entries.keys());
      for (const key of keys) {
        if (!this.isConnected) break;
        const entry = this.entries.get(key);
        if (!entry) continue;
        this.entries.delete(key);
        this.notifyListeners();
        try {
          await entry.fn();
        } catch (err) {
          // Silent: the original caller has already seen QueuedResult and
          // moved on. Future iteration could surface a toast here.
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn(`[mutation-queue] flush failed for ${key}`, err);
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Current queued count (testing/debug). */
  size(): number {
    return this.entries.size;
  }

  /** Clear without running. Useful for sign-out. */
  clear(): void {
    for (const entry of this.entries.values()) {
      entry.resolve({ ok: true, data: { queued: true, key: entry.key } });
    }
    this.entries.clear();
    this.notifyListeners();
  }
}

/** Singleton instance. */
export const mutationQueue = new MutationQueue();
