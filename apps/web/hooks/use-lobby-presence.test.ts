import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLobbyIds, useLobbyPresence } from "./use-lobby-presence";

const rt = vi.hoisted(() => ({
  sync: null as null | (() => void),
  state: {} as Record<string, unknown[]>,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => {
      const ch = {
        on: (_t: string, _f: unknown, fn: () => void) => {
          rt.sync = fn;
          return ch;
        },
        subscribe: () => ch,
        presenceState: () => rt.state,
        track: vi.fn(),
        untrack: vi.fn(),
      };
      return ch;
    },
    removeChannel: vi.fn(),
  }),
}));

describe("useLobbyPresence", () => {
  it("clears the module-level lobby ids when the channel unmounts", () => {
    const ids = renderHook(() => useLobbyIds());
    const owner = renderHook(() => useLobbyPresence("me", false, false));
    rt.state = { a: [{}], b: [{}] };
    act(() => rt.sync!());
    expect([...ids.result.current]).toEqual(["a", "b"]);
    act(() => owner.unmount());
    expect(ids.result.current.size).toBe(0);
  });
});
