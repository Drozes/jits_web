import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useArenaLive } from "./use-arena-live";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const mutations = vi.hoisted(() => ({ toggleMatchPreferences: vi.fn() }));
vi.mock("@jits/shared/api/mutations", () => mutations);
const lobby = vi.hoisted(() => ({ joinLobby: vi.fn(), leaveLobby: vi.fn() }));
vi.mock("@/hooks/use-lobby-presence", () => lobby);

beforeEach(() => {
  vi.clearAllMocks();
  mutations.toggleMatchPreferences.mockResolvedValue({ ok: true, data: null });
});

describe("useArenaLive", () => {
  it("goes live: writes the flag, joins the lobby, refreshes", async () => {
    const { result } = renderHook(() =>
      useArenaLive({ athleteId: "me", initialLive: false }),
    );
    await act(() => result.current.toggle());
    expect(result.current.isLive).toBe(true);
    expect(mutations.toggleMatchPreferences).toHaveBeenCalledWith({}, "me", {
      lookingForCasual: false,
      lookingForRanked: true,
    });
    expect(lobby.joinLobby).toHaveBeenCalledWith({
      athlete_id: "me",
      looking_for_casual: false,
      looking_for_ranked: true,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("goes offline and leaves the lobby", async () => {
    const { result } = renderHook(() =>
      useArenaLive({ athleteId: "me", initialLive: true }),
    );
    await act(() => result.current.goOffline());
    expect(result.current.isLive).toBe(false);
    expect(lobby.leaveLobby).toHaveBeenCalled();
  });

  it("rolls back going live: clears saving, reconciles presence, no refresh", async () => {
    mutations.toggleMatchPreferences.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "x" },
    });
    const { result } = renderHook(() =>
      useArenaLive({ athleteId: "me", initialLive: false }),
    );
    await act(() => result.current.toggle());
    expect(result.current.isLive).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(toastError).toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    // A rejoin during the write tracked from the optimistic value; untrack.
    expect(lobby.leaveLobby).toHaveBeenCalled();
    expect(lobby.joinLobby).not.toHaveBeenCalled();
  });

  it("rolls back going offline by re-joining the lobby", async () => {
    mutations.toggleMatchPreferences.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "x" },
    });
    const { result } = renderHook(() =>
      useArenaLive({ athleteId: "me", initialLive: true }),
    );
    await act(() => result.current.goOffline());
    expect(result.current.isLive).toBe(true);
    expect(lobby.joinLobby).toHaveBeenCalled();
    expect(lobby.leaveLobby).not.toHaveBeenCalled();
  });

  it("treats a thrown write like a failed one", async () => {
    mutations.toggleMatchPreferences.mockRejectedValue(new Error("net"));
    const { result } = renderHook(() =>
      useArenaLive({ athleteId: "me", initialLive: false }),
    );
    await act(() => result.current.toggle());
    expect(result.current.isLive).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it("goes offline for a match and back live after it (mirrors mobile)", async () => {
    const { result, rerender } = renderHook(
      ({ inMatch }) => useArenaLive({ athleteId: "me", initialLive: true, inMatch }),
      { initialProps: { inMatch: false } },
    );
    await act(async () => rerender({ inMatch: true }));
    expect(result.current.isLive).toBe(false);
    expect(lobby.leaveLobby).toHaveBeenCalled();
    expect(mutations.toggleMatchPreferences).toHaveBeenLastCalledWith({}, "me", {
      lookingForCasual: false,
      lookingForRanked: false,
    });
    // No refresh mid-match.
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => rerender({ inMatch: false }));
    expect(result.current.isLive).toBe(true);
    expect(lobby.joinLobby).toHaveBeenCalled();
  });

  it("does not go live after a match the athlete entered offline", async () => {
    const { result, rerender } = renderHook(
      ({ inMatch }) => useArenaLive({ athleteId: "me", initialLive: false, inMatch }),
      { initialProps: { inMatch: false } },
    );
    await act(async () => rerender({ inMatch: true }));
    await act(async () => rerender({ inMatch: false }));
    expect(result.current.isLive).toBe(false);
    expect(mutations.toggleMatchPreferences).not.toHaveBeenCalled();
  });

  it("re-syncs from initialLive after another device changed the flag", async () => {
    const { result, rerender } = renderHook(
      ({ initialLive }) => useArenaLive({ athleteId: "me", initialLive }),
      { initialProps: { initialLive: false } },
    );
    await act(async () => rerender({ initialLive: true }));
    expect(result.current.isLive).toBe(true);
    expect(lobby.joinLobby).toHaveBeenCalled();
    expect(mutations.toggleMatchPreferences).not.toHaveBeenCalled();

    await act(async () => rerender({ initialLive: false }));
    expect(result.current.isLive).toBe(false);
    expect(lobby.leaveLobby).toHaveBeenCalled();
  });

  it("ignores a second tap while the write is in flight", async () => {
    let resolve!: (v: unknown) => void;
    mutations.toggleMatchPreferences.mockReturnValue(
      new Promise((r) => (resolve = r)),
    );
    const { result } = renderHook(() =>
      useArenaLive({ athleteId: "me", initialLive: false }),
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.toggle();
    });
    await act(() => result.current.toggle());
    await act(async () => {
      resolve({ ok: true, data: null });
      await first;
    });
    expect(mutations.toggleMatchPreferences).toHaveBeenCalledOnce();
    expect(result.current.isLive).toBe(true);
  });

  it("goLive is a no-op when already live", async () => {
    const { result } = renderHook(() =>
      useArenaLive({ athleteId: "me", initialLive: true }),
    );
    await act(() => result.current.goLive());
    expect(mutations.toggleMatchPreferences).not.toHaveBeenCalled();
  });

  it("queues a match-entry offline request behind an in-flight go-live", async () => {
    let finish!: (v: unknown) => void;
    mutations.toggleMatchPreferences.mockReturnValueOnce(
      new Promise((r) => (finish = r)),
    );
    const { result, rerender } = renderHook(
      ({ inMatch }) => useArenaLive({ athleteId: "me", initialLive: false, inMatch }),
      { initialProps: { inMatch: false } },
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.toggle();
    });
    await act(async () => rerender({ inMatch: true }));
    expect(mutations.toggleMatchPreferences).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ ok: true, data: null });
      await first;
    });
    expect(mutations.toggleMatchPreferences).toHaveBeenCalledTimes(2);
    expect(mutations.toggleMatchPreferences).toHaveBeenLastCalledWith({}, "me", {
      lookingForCasual: false,
      lookingForRanked: false,
    });
    expect(result.current.isLive).toBe(false);
  });

  it("defers an external change seen during a match, then applies it on exit", async () => {
    const { result, rerender } = renderHook(
      ({ initialLive, inMatch }) => useArenaLive({ athleteId: "me", initialLive, inMatch }),
      { initialProps: { initialLive: false, inMatch: true } },
    );
    // Another device went live while this tab was mid-match.
    await act(async () => rerender({ initialLive: true, inMatch: true }));
    expect(result.current.isLive).toBe(false);
    expect(lobby.joinLobby).not.toHaveBeenCalled();

    await act(async () => rerender({ initialLive: true, inMatch: false }));
    expect(result.current.isLive).toBe(true);
    expect(lobby.joinLobby).toHaveBeenCalled();
    expect(mutations.toggleMatchPreferences).not.toHaveBeenCalled();
  });

  it("treats a mid-match refresh echoing our own offline write as no change", async () => {
    const { result, rerender } = renderHook(
      ({ initialLive, inMatch }) => useArenaLive({ athleteId: "me", initialLive, inMatch }),
      { initialProps: { initialLive: true, inMatch: false } },
    );
    await act(async () => rerender({ initialLive: true, inMatch: true }));
    expect(result.current.isLive).toBe(false);
    // A page refresh mid-match brings back the false we just wrote.
    await act(async () => rerender({ initialLive: false, inMatch: true }));
    await act(async () => rerender({ initialLive: false, inMatch: false }));
    // Still restored: the match is what took them down.
    expect(result.current.isLive).toBe(true);
    expect(mutations.toggleMatchPreferences).toHaveBeenLastCalledWith({}, "me", {
      lookingForCasual: false,
      lookingForRanked: true,
    });
  });

  it("does not revert its own write when the refresh echoes it", async () => {
    const { result, rerender } = renderHook(
      ({ initialLive }) => useArenaLive({ athleteId: "me", initialLive }),
      { initialProps: { initialLive: false } },
    );
    await act(() => result.current.toggle());
    await act(async () => rerender({ initialLive: true }));
    expect(result.current.isLive).toBe(true);
    expect(mutations.toggleMatchPreferences).toHaveBeenCalledTimes(1);
  });

  it("applies web-live, then mobile-off, then mobile-on (echo consumed once)", async () => {
    const { result, rerender } = renderHook(
      ({ initialLive }) => useArenaLive({ athleteId: "me", initialLive }),
      { initialProps: { initialLive: false } },
    );
    await act(() => result.current.toggle()); // this tab goes live
    await act(async () => rerender({ initialLive: true })); // our echo
    expect(result.current.isLive).toBe(true);
    await act(async () => rerender({ initialLive: false })); // mobile off
    expect(result.current.isLive).toBe(false);
    await act(async () => rerender({ initialLive: true })); // mobile on again
    expect(result.current.isLive).toBe(true);
    expect(mutations.toggleMatchPreferences).toHaveBeenCalledTimes(1);
  });

  it("does not restore live after a match if the in-flight go-live failed", async () => {
    let finish!: (v: unknown) => void;
    mutations.toggleMatchPreferences.mockReturnValueOnce(
      new Promise((r) => (finish = r)),
    );
    const { result, rerender } = renderHook(
      ({ inMatch }) => useArenaLive({ athleteId: "me", initialLive: false, inMatch }),
      { initialProps: { inMatch: false } },
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.toggle();
    });
    await act(async () => rerender({ inMatch: true }));
    await act(async () => {
      finish({ ok: false, error: { code: "UNKNOWN", message: "x" } });
      await first;
    });
    expect(result.current.isLive).toBe(false);
    await act(async () => rerender({ inMatch: false }));
    expect(result.current.isLive).toBe(false);
    // Only the failed go-live was ever written.
    expect(mutations.toggleMatchPreferences).toHaveBeenCalledTimes(1);
  });
});
