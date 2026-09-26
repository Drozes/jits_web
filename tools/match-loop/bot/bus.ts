import { ExpectationTimeout } from "../lib/util";

interface Stamped<T> {
  at: number;
  seq: number;
  value: T;
}

interface Waiter<T> {
  pred: (v: T) => boolean;
  since: number;
  resolve: (v: T) => void;
}

/**
 * Append-only event log with waiters. `waitFor` first scans the backlog
 * (events at or after `since`), so an event that landed before the caller
 * started waiting is never missed by the harness itself; whether the APP
 * would have missed it is a separate question the bot models with step
 * channel lifetimes.
 */
export class Bus<T> {
  readonly items: Stamped<T>[] = [];
  private waiters: Waiter<T>[] = [];
  private seq = 0;

  push(value: T): void {
    const item = { at: Date.now(), seq: this.seq++, value };
    this.items.push(item);
    const ready = this.waiters.filter((w) => item.seq >= w.since && w.pred(value));
    this.waiters = this.waiters.filter((w) => !ready.includes(w));
    for (const w of ready) w.resolve(value);
  }

  /** Sequence number to pass as `since` to only see future events. */
  mark(): number {
    return this.seq;
  }

  find(pred: (v: T) => boolean, since: number): T | undefined {
    return this.items.find((i) => i.seq >= since && pred(i.value))?.value;
  }

  /**
   * `since` is REQUIRED: pass `mark()` taken before the action whose effect
   * you await (so a stale event cannot satisfy the wait), or 0 deliberately
   * when any event in this bus's lifetime counts.
   */
  waitFor(what: string, pred: (v: T) => boolean, timeoutMs: number, since: number): Promise<T> {
    const hit = this.find(pred, since);
    if (hit !== undefined) return Promise.resolve(hit);
    const p = new Promise<T>((resolve, reject) => {
      const waiter: Waiter<T> = {
        pred,
        since,
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new ExpectationTimeout(what, timeoutMs, this.items.slice(-10).map((i) => i.value)));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
    // Mark the promise handled so a wait that nobody awaits any more (the
    // scenario already failed or moved on) cannot crash the whole run with an
    // unhandled rejection. Callers that do await it still get the rejection.
    p.catch(() => undefined);
    return p;
  }
}
