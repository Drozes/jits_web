import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const calls: unknown[][] = [];
let athleteRow: { platform_role: string } | null = null;
let readFails = false;
vi.mock("@jits/shared/api/queries", () => ({
  getCurrentAthlete: async (...a: unknown[]) => {
    calls.push(a);
    if (readFails) return Promise.reject(new Error("network"));
    return athleteRow;
  },
}));

import { useShowAnalysisLabels } from "./use-show-analysis-labels";

function client(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } } as never;
}

beforeEach(() => {
  calls.length = 0;
  athleteRow = null;
  readFails = false;
});

describe("useShowAnalysisLabels (jits-xfvd.18)", () => {
  it.each(["admin", "founder"])("is true for a %s", async (role) => {
    athleteRow = { platform_role: role };
    const c = client({ id: "u1" });
    const { result } = renderHook(() => useShowAnalysisLabels(c));
    await waitFor(() => expect(result.current).toBe(true));
    expect(calls[0][1]).toBe("u1");
  });

  it("starts hidden and stays hidden for a member", async () => {
    athleteRow = { platform_role: "member" };
    const c = client({ id: "u1" });
    const { result } = renderHook(() => useShowAnalysisLabels(c));
    expect(result.current).toBe(false);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(result.current).toBe(false);
  });

  it("is hidden when signed out", async () => {
    const c = client(null);
    const { result } = renderHook(() => useShowAnalysisLabels(c));
    await Promise.resolve();
    expect(result.current).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("fails closed when the athlete read fails", async () => {
    readFails = true;
    const c = client({ id: "u1" });
    const { result } = renderHook(() => useShowAnalysisLabels(c));
    await waitFor(() => expect(calls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBe(false);
  });
});
