/**
 * The any-match-ever read behind Home's practice offer: counts competitor
 * participations in matches that started (never a pending or cancelled one),
 * re-reads when the refresh key moves, and a failed read counts as played
 * (never nag).
 *
 * Source: apps/mobile/lib/practice/use-has-ever-played.ts
 */
import { renderHook, waitFor } from "@testing-library/react-native";

const mockResult: { count: number | null; error: unknown } = { count: 0, error: null };
const mockCalls: { method: string; args: unknown[] }[] = [];
jest.mock("@/lib/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "in"]) {
    chain[m] = (...args: unknown[]) => {
      mockCalls.push({ method: m, args });
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(mockResult).then(resolve);
  return { supabase: chain };
});

import { useHasEverPlayed } from "@/lib/practice/use-has-ever-played";

beforeEach(() => {
  mockCalls.length = 0;
  mockResult.count = 0;
  mockResult.error = null;
});

it("is null with no athlete and does not read", () => {
  const { result } = renderHook(() => useHasEverPlayed(null));
  expect(result.current).toBeNull();
  expect(mockCalls).toHaveLength(0);
});

it("false with no participations, counting only started matches as a competitor", async () => {
  const { result } = renderHook(() => useHasEverPlayed("a1"));
  await waitFor(() => expect(result.current).toBe(false));
  const select = mockCalls.find((c) => c.method === "select");
  expect(String(select?.args[0])).toContain("matches!inner(");
  expect(mockCalls).toContainEqual({ method: "from", args: ["match_participants"] });
  expect(mockCalls).toContainEqual({ method: "eq", args: ["athlete_id", "a1"] });
  expect(mockCalls).toContainEqual({ method: "eq", args: ["role", "competitor"] });
  const statusFilter = mockCalls.find((c) => c.method === "in");
  expect(statusFilter?.args[0]).toBe("matches.status");
  expect([...(statusFilter?.args[1] as string[])].sort()).toEqual(
    ["completed", "disputed", "in_progress", "voided"],
  );
  // A match that never started (pending at a blocked or abandoned face-off,
  // or cancelled) is not played.
  expect(statusFilter?.args[1]).not.toContain("pending");
  expect(statusFilter?.args[1]).not.toContain("cancelled");
});

it("re-reads when the refresh key moves, so a first match flips it", async () => {
  const { result, rerender } = renderHook(({ k }: { k: number }) => useHasEverPlayed("a1", k), {
    initialProps: { k: 0 },
  });
  await waitFor(() => expect(result.current).toBe(false));
  const readsBefore = mockCalls.filter((c) => c.method === "from").length;
  // Same key: no new read.
  rerender({ k: 0 });
  expect(mockCalls.filter((c) => c.method === "from").length).toBe(readsBefore);
  // The athlete plays a first match and leaves it: the key moves.
  mockResult.count = 1;
  rerender({ k: 1 });
  await waitFor(() => expect(result.current).toBe(true));
  expect(mockCalls.filter((c) => c.method === "from").length).toBe(readsBefore + 1);
});

it("true with any participation", async () => {
  mockResult.count = 3;
  const { result } = renderHook(() => useHasEverPlayed("a1"));
  await waitFor(() => expect(result.current).toBe(true));
});

it("a failed read counts as played", async () => {
  mockResult.count = null;
  mockResult.error = { message: "offline" };
  const { result } = renderHook(() => useHasEverPlayed("a1"));
  await waitFor(() => expect(result.current).toBe(true));
});
