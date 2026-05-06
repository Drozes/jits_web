// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePendingChallenges } from "./use-pending-challenges";

// ---------------------------------------------------------------------------
// Mock Supabase client with query builder + channel
// ---------------------------------------------------------------------------

type PostgresChangesHandler = (payload: {
  new: Record<string, unknown>;
}) => void;

function createMockChannel() {
  const pgHandlers: { event: string; handler: PostgresChangesHandler }[] = [];

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
    subscribe() {
      return channel;
    },
  };

  return {
    channel,
    pgHandlers,
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
});
