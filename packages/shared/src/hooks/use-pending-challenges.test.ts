// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePendingChallenges } from "./use-pending-challenges";

// ---------------------------------------------------------------------------
// Mock Supabase client with query builder + channel
// ---------------------------------------------------------------------------

type PostgresChangesHandler = (payload: {
  new: Record<string, unknown>;
}) => void;

function createMockChannel() {
  const pgHandlers: { event: string; handler: PostgresChangesHandler }[] = [];
  let statusCallback: ((status: string) => void) | undefined;

  const channel = {
    on(
      type: string,
      opts: { event: string; schema?: string; table?: string; filter?: string },
      handler: PostgresChangesHandler,
    ) {
      if (type === "postgres_changes") {
        pgHandlers.push({ event: opts.event, handler });
      }
      return channel;
    },
    subscribe(cb?: (status: string) => void) {
      statusCallback = cb;
      return channel;
    },
  };

  return {
    channel,
    pgHandlers,
    /** Simulate a channel status change reported to the subscribe callback. */
    emitStatus(status: string) {
      statusCallback?.(status);
    },
    /** Simulate a postgres_changes event by matching event type. */
    simulateChange(event: "INSERT" | "UPDATE", row: Record<string, unknown>) {
      for (const h of pgHandlers) {
        if (h.event === event) {
          h.handler({ new: row });
        }
      }
    },
  };
}

function createMockSupabase(
  mockChannel: ReturnType<typeof createMockChannel>,
  initialChallenges: Record<string, unknown>[] = [],
) {
  let channelCount = 0;
  const selectSingleCalls: string[] = [];

  // Query builder for `.from("challenges").select(...)`
  const challengeQueryBuilder = {
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: initialChallenges }),
  };

  // Query builder for `.from("athletes").select("display_name").eq(...).single()`
  const athleteQueryBuilder = {
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { display_name: "Looked Up Name" },
    }),
  };

  return {
    from(table: string) {
      if (table === "athletes") {
        return {
          select() {
            return athleteQueryBuilder;
          },
        };
      }
      // challenges table
      return {
        select() {
          return challengeQueryBuilder;
        },
      };
    },
    channel(name: string) {
      channelCount++;
      return mockChannel.channel;
    },
    removeChannel: vi.fn(),
    challengeQueryBuilder,
    athleteQueryBuilder,
    get channelCount() {
      return channelCount;
    },
    selectSingleCalls,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePendingChallenges", () => {
  let mockChannel: ReturnType<typeof createMockChannel>;

  beforeEach(() => {
    mockChannel = createMockChannel();
  });

  it("fetches initial challenges and returns count", async () => {
    const initialData = [
      {
        id: "ch-1",
        created_at: "2026-04-25T12:00:00Z",
        expires_at: "2026-04-26T12:00:00Z",
        match_type: "ranked",
        challenger: { display_name: "Alice" },
      },
      {
        id: "ch-2",
        created_at: "2026-04-25T13:00:00Z",
        expires_at: "2026-04-26T13:00:00Z",
        match_type: "casual",
        challenger: { display_name: "Bob" },
      },
    ];

    const mockSupabase = createMockSupabase(mockChannel, initialData);

    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    await waitFor(() => {
      expect(result.current.count).toBe(2);
    });

    expect(result.current.challenges[0].challengerName).toBe("Alice");
    expect(result.current.challenges[1].challengerName).toBe("Bob");
  });

  it("starts with empty challenges", () => {
    const mockSupabase = createMockSupabase(mockChannel, []);

    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    // Synchronously, before fetch resolves
    expect(result.current.count).toBe(0);
    expect(result.current.challenges).toEqual([]);
  });

  it("subscribes to postgres_changes for INSERT and UPDATE", () => {
    const mockSupabase = createMockSupabase(mockChannel, []);

    renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    const events = mockChannel.pgHandlers.map((h) => h.event);
    expect(events).toContain("INSERT");
    expect(events).toContain("UPDATE");
  });

  it("appends a new challenge on INSERT with name lookup", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);

    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(result.current.count).toBe(0);
    });

    // Simulate INSERT
    await mockChannel.simulateChange("INSERT", {
      id: "ch-new",
      challenger_id: "c-1",
      opponent_id: "athlete-1",
      status: "pending",
      match_type: "ranked",
      created_at: "2026-04-25T14:00:00Z",
      expires_at: "2099-12-31T23:59:59Z",
    });

    await waitFor(() => {
      expect(result.current.count).toBe(1);
    });

    expect(result.current.challenges[0].id).toBe("ch-new");
    expect(result.current.challenges[0].challengerName).toBe("Looked Up Name");
  });

  it("ignores INSERT for non-pending challenges", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);

    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    await waitFor(() => {
      expect(result.current.count).toBe(0);
    });

    // Simulate INSERT with status != "pending"
    await mockChannel.simulateChange("INSERT", {
      id: "ch-declined",
      challenger_id: "c-1",
      opponent_id: "athlete-1",
      status: "declined",
      match_type: "ranked",
      created_at: "2026-04-25T14:00:00Z",
      expires_at: "2099-12-31T23:59:59Z",
    });

    // Give a tick for any async handling
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current.count).toBe(0);
  });

  it("ignores INSERT for expired challenges", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);

    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    await waitFor(() => {
      expect(result.current.count).toBe(0);
    });

    // Simulate INSERT with already expired date
    await mockChannel.simulateChange("INSERT", {
      id: "ch-expired",
      challenger_id: "c-1",
      opponent_id: "athlete-1",
      status: "pending",
      match_type: "ranked",
      created_at: "2026-04-25T14:00:00Z",
      expires_at: "2020-01-01T00:00:00Z",
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(result.current.count).toBe(0);
  });

  it("removes a challenge on UPDATE when status is no longer pending", async () => {
    const initialData = [
      {
        id: "ch-1",
        created_at: "2026-04-25T12:00:00Z",
        expires_at: "2026-04-26T12:00:00Z",
        match_type: "ranked",
        challenger: { display_name: "Alice" },
      },
    ];

    const mockSupabase = createMockSupabase(mockChannel, initialData);

    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    await waitFor(() => {
      expect(result.current.count).toBe(1);
    });

    // Simulate UPDATE: challenge accepted
    mockChannel.simulateChange("UPDATE", {
      id: "ch-1",
      status: "accepted",
    });

    await waitFor(() => {
      expect(result.current.count).toBe(0);
    });
  });

  it("cleans up channel on unmount", () => {
    const mockSupabase = createMockSupabase(mockChannel, []);

    const { unmount } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    unmount();

    expect(mockSupabase.removeChannel).toHaveBeenCalled();
  });

  it("handles null challenger display_name in initial fetch", async () => {
    const initialData = [
      {
        id: "ch-1",
        created_at: "2026-04-25T12:00:00Z",
        expires_at: "2026-04-26T12:00:00Z",
        match_type: "ranked",
        challenger: null,
      },
    ];

    const mockSupabase = createMockSupabase(mockChannel, initialData);

    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    await waitFor(() => {
      expect(result.current.count).toBe(1);
    });

    expect(result.current.challenges[0].challengerName).toBe("Unknown");
  });

  it("refetch re-reads the server list, dropping rows that left pending while realtime was down", async () => {
    const row = (id: string, name: string) => ({
      id,
      created_at: "2026-04-25T12:00:00Z",
      expires_at: "2099-12-31T23:59:59Z",
      match_type: "ranked",
      challenger: { display_name: name },
    });
    const mockSupabase = createMockSupabase(mockChannel, [row("ch-1", "Alice")]);

    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(1));

    // Server side: ch-1 was withdrawn and ch-2 arrived, with no realtime event.
    mockSupabase.challengeQueryBuilder.order.mockResolvedValueOnce({ data: [row("ch-2", "Bob")] });
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-2"]);
  });

  it("a slow earlier read never overwrites a later one", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    let resolveSlow: (v: unknown) => void = () => {};
    mockSupabase.challengeQueryBuilder.order
      .mockReturnValueOnce(new Promise((r) => (resolveSlow = r)))
      .mockResolvedValueOnce({ data: [] });
    await act(async () => {
      const slow = result.current.refetch();
      await result.current.refetch();
      resolveSlow({
        data: [
          {
            id: "stale",
            created_at: "2026-04-25T12:00:00Z",
            expires_at: "2099-12-31T23:59:59Z",
            match_type: "ranked",
            challenger: { display_name: "Old" },
          },
        ],
      });
      await slow;
    });

    expect(result.current.count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Realtime events interleaved with full reads (refetch runs on foreground,
  // panel open and pull-to-refresh, so these overlap routinely).
  // -------------------------------------------------------------------------

  const readRow = (id: string, name = "Alice") => ({
    id,
    created_at: "2026-04-25T12:00:00Z",
    expires_at: "2099-12-31T23:59:59Z",
    match_type: "ranked",
    challenger: { display_name: name },
  });
  const insertPayload = (id: string) => ({
    id,
    challenger_id: "c-1",
    opponent_id: "athlete-1",
    status: "pending",
    match_type: "ranked",
    created_at: "2026-04-25T14:00:00Z",
    expires_at: "2099-12-31T23:59:59Z",
  });
  function deferred<T>() {
    let resolve: (v: T) => void = () => {};
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }
  async function flush() {
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  }

  it("an INSERT for an id already listed does not list it twice", async () => {
    const mockSupabase = createMockSupabase(mockChannel, [readRow("ch-1")]);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(1));

    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-1"));
    });
    await flush();

    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-1"]);
  });

  it("a refetch that lands during an INSERT's name lookup leaves the row listed once", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    const lookup = deferred<unknown>();
    mockSupabase.athleteQueryBuilder.single.mockReturnValueOnce(lookup.promise);
    mockSupabase.challengeQueryBuilder.order.mockResolvedValue({ data: [readRow("ch-1")] });

    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-1"));
      await result.current.refetch();
    });
    expect(result.current.count).toBe(1);

    lookup.resolve({ data: { display_name: "Looked Up Name" } });
    await flush();

    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-1"]);
  });

  it("an INSERT whose lookup resolves after a newer read dropped the row does not bring it back", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    // No read in flight when the INSERT arrives; its lookup is held open.
    const lookup = deferred<unknown>();
    mockSupabase.athleteQueryBuilder.single.mockReturnValueOnce(lookup.promise);
    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-x"));
    });

    // A read that started after the event does not list it (it left pending,
    // and its UPDATE was lost), so that read is authoritative for the row.
    mockSupabase.challengeQueryBuilder.order.mockResolvedValue({ data: [] });
    await act(async () => {
      await result.current.refetch();
    });
    const before = result.current.challenges;

    lookup.resolve({ data: { display_name: "Looked Up Name" } });
    await flush();

    expect(result.current.challenges).toEqual([]);
    // No state update at all: the same array is still returned.
    expect(result.current.challenges).toBe(before);
  });

  it("an INSERT lookup resolving after a read that started before the event adds the row, newest first", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    // A read starts before the INSERT, so its snapshot may predate it.
    const early = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order.mockReturnValueOnce(early.promise);
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.refetch();
    });

    // The INSERT (created 2026-04-25T14:00Z) arrives with its lookup held; the
    // read it starts never resolves.
    const lookup = deferred<unknown>();
    mockSupabase.athleteQueryBuilder.single.mockReturnValueOnce(lookup.promise);
    mockSupabase.challengeQueryBuilder.order.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-x"));
    });

    // The early read lists a NEWER row but not the INSERT's.
    const newer = { ...readRow("ch-newer"), created_at: "2026-04-26T09:00:00Z" };
    await act(async () => {
      early.resolve({ data: [newer] });
      await pending;
    });
    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-newer"]);

    lookup.resolve({ data: { display_name: "Looked Up Name" } });
    await flush();

    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-newer", "ch-x"]);
  });

  it("an INSERT lookup that resolves after athleteId changed never touches the new athlete's list", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => {
        renders++;
        return usePendingChallenges(mockSupabase as never, id);
      },
      { initialProps: { id: "athlete-1" } },
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    const lookup = deferred<unknown>();
    mockSupabase.athleteQueryBuilder.single.mockReturnValueOnce(lookup.promise);
    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-a1"));
    });

    // athlete-2's first read stays in flight, so no newer read has applied
    // and only the athlete check can stop the stale INSERT.
    mockSupabase.challengeQueryBuilder.order.mockReturnValue(new Promise(() => {}));
    rerender({ id: "athlete-2" });
    await flush();
    const rendersBefore = renders;

    lookup.resolve({ data: { display_name: "Looked Up Name" } });
    await flush();

    expect(result.current.challenges).toEqual([]);
    // The stale INSERT set no state (an update would re-render).
    expect(renders).toBe(rendersBefore);
  });

  it("an INSERT during an in-flight refetch is not dropped when the older read resolves", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    // The in-flight read's snapshot predates the INSERT; any read that starts
    // after it sees the row.
    const stale = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue({ data: [readRow("ch-new", "Looked Up Name")] });

    let pendingRefetch: Promise<void> = Promise.resolve();
    await act(async () => {
      pendingRefetch = result.current.refetch();
    });
    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-new"));
    });
    await flush();
    expect(result.current.count).toBe(1);

    await act(async () => {
      stale.resolve({ data: [] });
      await pendingRefetch;
    });
    await flush();

    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-new"]);
  });

  it("an UPDATE to accepted during an in-flight refetch is not undone by the older read", async () => {
    const mockSupabase = createMockSupabase(mockChannel, [readRow("ch-1")]);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(1));

    const stale = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue({ data: [] });

    let pendingRefetch: Promise<void> = Promise.resolve();
    await act(async () => {
      pendingRefetch = result.current.refetch();
    });
    await act(async () => {
      mockChannel.simulateChange("UPDATE", { id: "ch-1", status: "accepted" });
    });
    expect(result.current.count).toBe(0);

    await act(async () => {
      stale.resolve({ data: [readRow("ch-1")] });
      await pendingRefetch;
    });
    await flush();

    expect(result.current.count).toBe(0);
  });

  it("a row realtime saw leave pending is never brought back by a later read", async () => {
    const mockSupabase = createMockSupabase(mockChannel, [readRow("ch-1")]);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(1));

    await act(async () => {
      mockChannel.simulateChange("UPDATE", { id: "ch-1", status: "declined" });
    });
    // A lagging replica still reports it pending.
    mockSupabase.challengeQueryBuilder.order.mockResolvedValue({ data: [readRow("ch-1")] });
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.count).toBe(0);
  });

  it("an UPDATE during an INSERT's name lookup keeps the row out", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    const lookup = deferred<unknown>();
    mockSupabase.athleteQueryBuilder.single.mockReturnValueOnce(lookup.promise);

    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-1"));
      mockChannel.simulateChange("UPDATE", { id: "ch-1", status: "cancelled" });
    });
    lookup.resolve({ data: { display_name: "Looked Up Name" } });
    await flush();

    expect(result.current.count).toBe(0);
  });

  it("a failed newer read does not discard an older read that succeeds", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const mount = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order
      .mockReturnValueOnce(mount.promise)
      .mockResolvedValueOnce({ data: null, error: { message: "network" } });
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );

    // The INSERT lands while the mount read is in flight: it starts read 2,
    // which fails.
    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-new"));
    });
    await flush();
    expect(mockSupabase.challengeQueryBuilder.order).toHaveBeenCalledTimes(2);
    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-new"]);

    await act(async () => {
      mount.resolve({ data: [readRow("ch-1"), readRow("ch-2")] });
    });
    await flush();

    // The mount rows are listed, and the realtime row its snapshot predates
    // is kept.
    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-new", "ch-1", "ch-2"]);
  });

  it("an older read that resolves after a newer one succeeded is dropped", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    const slow = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ data: [readRow("ch-1")] });
    await act(async () => {
      const first = result.current.refetch();
      await result.current.refetch();
      slow.resolve({ data: [readRow("ch-old")] });
      await first;
    });

    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-1"]);
  });

  it("a rejected read resolves refetch and keeps the current list", async () => {
    const mockSupabase = createMockSupabase(mockChannel, [readRow("ch-1")]);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(1));

    mockSupabase.challengeQueryBuilder.order.mockRejectedValueOnce(new Error("aborted"));
    await act(async () => {
      await expect(result.current.refetch()).resolves.toBeUndefined();
    });

    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-1"]);

    // The in-flight counter was released: a later event does not re-read.
    const reads = mockSupabase.challengeQueryBuilder.order.mock.calls.length;
    await act(async () => {
      mockChannel.simulateChange("UPDATE", { id: "ch-1", status: "accepted" });
    });
    await flush();
    expect(mockSupabase.challengeQueryBuilder.order.mock.calls.length).toBe(reads);
  });

  it("a realtime event with no read in flight does not trigger a re-read", async () => {
    const mockSupabase = createMockSupabase(mockChannel, [readRow("ch-1")]);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(1));
    const reads = mockSupabase.challengeQueryBuilder.order.mock.calls.length;

    await act(async () => {
      mockChannel.simulateChange("UPDATE", { id: "ch-1", status: "accepted" });
    });
    await flush();

    expect(mockSupabase.challengeQueryBuilder.order.mock.calls.length).toBe(reads);
  });
  // -------------------------------------------------------------------------
  // Channel rejoin, ordering and athlete changes
  // -------------------------------------------------------------------------

  it("re-reads the list on the first SUBSCRIBED, catching an INSERT committed before the join", async () => {
    const mockSupabase = createMockSupabase(mockChannel, [readRow("ch-1")]);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(1));
    const reads = mockSupabase.challengeQueryBuilder.order.mock.calls.length;

    // ch-gap committed after the mount read's snapshot but before the channel
    // joined, so realtime never delivers it; only a later read sees it.
    mockSupabase.challengeQueryBuilder.order.mockResolvedValue({
      data: [readRow("ch-1"), readRow("ch-gap", "Gap")],
    });
    await act(async () => {
      mockChannel.emitStatus("SUBSCRIBED");
    });
    await flush();
    expect(mockSupabase.challengeQueryBuilder.order.mock.calls.length).toBe(reads + 1);
    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-1", "ch-gap"]);
  });

  it("re-reads the list when the channel rejoins", async () => {
    const mockSupabase = createMockSupabase(mockChannel, [readRow("ch-1")]);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await act(async () => {
      mockChannel.emitStatus("SUBSCRIBED");
    });
    await waitFor(() => expect(result.current.count).toBe(1));
    const reads = mockSupabase.challengeQueryBuilder.order.mock.calls.length;

    // The challenger cancelled during the drop; the rejoin read drops it.
    mockSupabase.challengeQueryBuilder.order.mockResolvedValue({ data: [] });
    await act(async () => {
      mockChannel.emitStatus("CHANNEL_ERROR");
      mockChannel.emitStatus("SUBSCRIBED");
    });
    await flush();
    expect(mockSupabase.challengeQueryBuilder.order.mock.calls.length).toBe(reads + 1);
    expect(result.current.count).toBe(0);
  });

  it("a re-read that finds the same list keeps the same array (no re-render)", async () => {
    const mockSupabase = createMockSupabase(mockChannel, [readRow("ch-1"), readRow("ch-2", "Bob")]);
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return usePendingChallenges(mockSupabase as never, "athlete-1");
    });
    await waitFor(() => expect(result.current.count).toBe(2));
    const before = result.current.challenges;
    const rendersBefore = renders;

    // A foreground re-sync and the rejoin both read the same list.
    await act(async () => {
      await result.current.refetch();
      mockChannel.emitStatus("SUBSCRIBED");
    });
    await flush();

    expect(result.current.challenges).toBe(before);
    expect(renders).toBe(rendersBefore);
  });

  it("a realtime row cancelled during a drop is dropped by a superseded rejoin read even when the newer read fails", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(mockSupabase.challengeQueryBuilder.order).toHaveBeenCalledTimes(1));
    await flush();

    // X arrives by realtime with no read in flight.
    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-x"));
    });
    await flush();
    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-x"]);

    // The socket drops; the challenger cancels X (never delivered). On rejoin
    // the re-read starts, then another realtime event lands while it is in
    // flight, starting a newer read that fails.
    const rejoin = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order
      .mockReturnValueOnce(rejoin.promise)
      .mockResolvedValueOnce({ data: null, error: { message: "network" } });
    await act(async () => {
      mockChannel.emitStatus("SUBSCRIBED");
    });
    await act(async () => {
      mockChannel.simulateChange("UPDATE", { id: "ch-other", status: "declined" });
    });
    await flush();

    await act(async () => {
      rejoin.resolve({ data: [readRow("ch-y", "Yan")] });
    });
    await flush();

    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-y"]);
  });

  it("orders rows with a malformed created_at deterministically (no NaN comparator)", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(mockSupabase.challengeQueryBuilder.order).toHaveBeenCalledTimes(1));
    await flush();

    const older = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order
      .mockReturnValueOnce(older.promise)
      .mockReturnValue(new Promise(() => {}));
    let p1: Promise<void> = Promise.resolve();
    await act(async () => {
      p1 = result.current.refetch();
    });
    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-rt"));
    });
    await flush();

    const bad = { ...readRow("ch-bad"), created_at: "not a date" };
    const newest = { ...readRow("ch-newest"), created_at: "2026-04-26T09:00:00Z" };
    await act(async () => {
      older.resolve({ data: [newest, bad] });
      await p1;
    });
    await flush();

    // The malformed row sorts as the oldest.
    expect(result.current.challenges.map((c) => c.id)).toEqual(["ch-newest", "ch-rt", "ch-bad"]);
  });

  it("a superseded read merged with realtime rows keeps the list newest first", async () => {
    const mockSupabase = createMockSupabase(mockChannel, []);
    const { result } = renderHook(() =>
      usePendingChallenges(mockSupabase as never, "athlete-1"),
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    // Older read (seq 1) and newer read (seq 2) both pending. The older one
    // resolves first and is applied as superseded, merging the realtime row.
    const older = deferred<unknown>();
    const newer = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    let p1: Promise<void> = Promise.resolve();
    let p2: Promise<void> = Promise.resolve();
    await act(async () => {
      p1 = result.current.refetch();
      p2 = result.current.refetch();
    });
    // Realtime INSERT (created 2026-04-25T14:00Z) lands while both are in flight.
    mockSupabase.challengeQueryBuilder.order.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      mockChannel.simulateChange("INSERT", insertPayload("ch-rt"));
    });
    await flush();

    const newest = { ...readRow("ch-newest"), created_at: "2026-04-26T09:00:00Z" };
    await act(async () => {
      older.resolve({ data: [newest, readRow("ch-old")] });
      await p1;
    });
    await flush();

    expect(result.current.challenges.map((c) => c.id)).toEqual([
      "ch-newest",
      "ch-rt",
      "ch-old",
    ]);
    newer.resolve({ data: null });
    await act(async () => {
      await p2;
    });
  });

  it("a read started for a previous athlete never applies after athleteId changes", async () => {
    const mockSupabase = createMockSupabase(mockChannel, [readRow("a1-ch")]);
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePendingChallenges(mockSupabase as never, id),
      { initialProps: { id: "athlete-1" } },
    );
    await waitFor(() => expect(result.current.count).toBe(1));

    const oldRead = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order.mockReturnValueOnce(oldRead.promise);
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.refetch();
    });

    const newRead = deferred<unknown>();
    mockSupabase.challengeQueryBuilder.order.mockReturnValueOnce(newRead.promise);
    // The previous athlete's list does not carry over, not even for the
    // first render with the new id (before any effect runs).
    const seen: number[] = [];
    rerender({ id: "athlete-2" });
    seen.push(result.current.count);
    await flush();
    expect(seen).toEqual([0]);
    expect(result.current.count).toBe(0);

    await act(async () => {
      oldRead.resolve({ data: [readRow("a1-stale")] });
      await pending;
    });
    await flush();
    expect(result.current.challenges.map((c) => c.id)).toEqual([]);

    await act(async () => {
      newRead.resolve({ data: [readRow("a2-ch")] });
    });
    await flush();
    expect(result.current.challenges.map((c) => c.id)).toEqual(["a2-ch"]);
  });
});
