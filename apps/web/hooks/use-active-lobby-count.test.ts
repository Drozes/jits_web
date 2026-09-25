import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  LOBBY_RESOLVE_DEBOUNCE_MS,
  LOBBY_RESOLVE_TTL_MS,
  useActiveLobbyCount,
} from "./use-active-lobby-count";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = uuid(0);
const A = uuid(1);
const B = uuid(2);
const GHOST = uuid(99); // well-formed, but no such athlete

type Result = { data: { id: string }[] | null; error: { message: string } | null };
const db = vi.hoisted(() => ({
  active: new Set<string>(),
  queries: [] as string[][],
  fail: false,
  // When set, the next query waits on this instead of answering at once.
  hold: null as null | Promise<void>,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      let ids: string[] = [];
      const q = {
        select: () => q,
        in: (_: string, v: string[]) => {
          ids = v;
          db.queries.push(v);
          return q;
        },
        eq: async (): Promise<Result> => {
          const gate = db.hold;
          db.hold = null;
          const snapshot = new Set(db.active);
          if (gate) await gate;
          return db.fail
            ? { data: null, error: { message: "boom" } }
            : { data: ids.filter((id) => snapshot.has(id)).map((id) => ({ id })), error: null };
        },
      };
      return q;
    },
  }),
}));

async function settle(ms = LOBBY_RESOLVE_DEBOUNCE_MS + 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  db.active = new Set([ME, A, B]);
  db.queries = [];
  db.fail = false;
  db.hold = null;
});
afterEach(() => vi.useRealTimers());

describe("useActiveLobbyCount", () => {
  it("excludes self, non-UUID keys and ids that are not active athletes", async () => {
    const { result } = renderHook(() =>
      useActiveLobbyCount(new Set([ME, A, GHOST, "not-a-uuid"]), ME),
    );
    expect(result.current).toBe(0); // nothing counts before it resolves
    await settle();
    expect(result.current).toBe(1);
    // The malformed key never reaches the database.
    expect(db.queries).toEqual([[A, GHOST]]);
  });

  it("caches resolved ids and only queries unseen ones", async () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useActiveLobbyCount(ids, ME),
      { initialProps: { ids: new Set([A, GHOST]) } },
    );
    await settle();
    rerender({ ids: new Set([A, GHOST, B]) });
    await settle();
    expect(result.current).toBe(2);
    expect(db.queries).toEqual([[A, GHOST], [B]]);

    rerender({ ids: new Set([A, GHOST]) });
    await settle();
    expect(result.current).toBe(1); // B left presence
    expect(db.queries).toHaveLength(2);
  });

  it("re-resolves after the TTL, so a deactivated athlete drops out", async () => {
    const { result } = renderHook(() => useActiveLobbyCount(new Set([A]), ME));
    await settle();
    expect(result.current).toBe(1);
    db.active.delete(A);
    await settle(LOBBY_RESOLVE_TTL_MS * 1.5); // expiry tick
    await settle(); // debounce, then the re-lookup
    expect(result.current).toBe(0);
    expect(db.queries).toEqual([[A], [A]]);
  });

  it("debounces bursts of presence syncs into one query", async () => {
    const { rerender } = renderHook(
      ({ ids }) => useActiveLobbyCount(ids, ME),
      { initialProps: { ids: new Set([A]) } },
    );
    rerender({ ids: new Set([A, B]) });
    await settle();
    expect(db.queries).toEqual([[A, B]]);
  });

  it("a later sync does not cancel an in-flight lookup", async () => {
    let release!: () => void;
    db.hold = new Promise<void>((r) => (release = r));
    const { result, rerender } = renderHook(
      ({ ids }) => useActiveLobbyCount(ids, ME),
      { initialProps: { ids: new Set([A]) } },
    );
    await settle(); // request for A is now in flight, held
    rerender({ ids: new Set([A, GHOST]) }); // churn while waiting
    await settle();
    await act(async () => release());
    expect(result.current).toBe(1);
  });

  it("drops a slow response once a newer one has landed", async () => {
    let release!: () => void;
    db.hold = new Promise<void>((r) => (release = r));
    const { result, rerender } = renderHook(
      ({ ids }) => useActiveLobbyCount(ids, ME),
      { initialProps: { ids: new Set([A]) } },
    );
    await settle(); // #1 for [A] held; A is active in its snapshot
    db.active.delete(A);
    rerender({ ids: new Set([A, B]) });
    await settle(); // #2 for [A, B] answers at once: only B active
    expect(result.current).toBe(1);
    await act(async () => release()); // #1 lands late and must be ignored
    expect(result.current).toBe(1);
  });

  it("counts nothing and caches nothing when the lookup fails", async () => {
    db.fail = true;
    const { result, rerender } = renderHook(
      ({ ids }) => useActiveLobbyCount(ids, ME),
      { initialProps: { ids: new Set([A]) } },
    );
    await settle();
    expect(result.current).toBe(0);
    db.fail = false;
    rerender({ ids: new Set([A]) });
    await settle();
    expect(result.current).toBe(1);
  });
});
