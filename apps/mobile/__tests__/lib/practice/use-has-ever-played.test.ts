/**
 * The any-match-ever read behind Home's practice offer: counts non-cancelled
 * participations, and a failed read counts as played (never nag).
 *
 * Source: apps/mobile/lib/practice/use-has-ever-played.ts
 */
import { renderHook, waitFor } from "@testing-library/react-native";

const mockResult: { count: number | null; error: unknown } = { count: 0, error: null };
const mockCalls: { method: string; args: unknown[] }[] = [];
jest.mock("@/lib/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "neq"]) {
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

it("false with no participations, excluding cancelled matches", async () => {
  const { result } = renderHook(() => useHasEverPlayed("a1"));
  await waitFor(() => expect(result.current).toBe(false));
  expect(mockCalls).toContainEqual({ method: "eq", args: ["athlete_id", "a1"] });
  expect(mockCalls).toContainEqual({ method: "neq", args: ["matches.status", "cancelled"] });
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
