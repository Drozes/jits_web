/**
 * Review M3: the Film Room phase reads are shared between the Film Room
 * screen and the Profile preview, run only while a surface is focused and
 * the app is active, re-read only moving matches with a backoff, stop for a
 * match stuck past its film window, and keep each card's phase object while
 * nothing about it changed.
 */
const mockGet = jest.fn();
let mockFocused = true;
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@jits/shared/api/match-video-status", () => ({ ...jest.requireActual("@jits/shared/api/match-video-status"), getMatchVideoStatus: (...a: unknown[]) => mockGet(...a) }));
jest.mock("@/lib/video/use-upload-announcements", () => ({ useIsScreenFocused: () => mockFocused }));

import { act, renderHook } from "@testing-library/react-native";
import {
  __resetFilmRoomPhasesForTests,
  isMoving,
  phaseBackoffMs,
  refreshMatchPhases,
  useFilmRoomPhases,
} from "@/lib/film-room/use-film-room-phases";
import { iso, statusFixture } from "../../support/match-video-status-fixture";

const T0 = Date.parse("2026-10-05T20:30:00Z");
const items = [
  { match_id: "11111111-1111-4111-8111-111111111111", completed_at: new Date(T0 - 3600_000).toISOString() },
  { match_id: "22222222-2222-4222-8222-222222222222", completed_at: new Date(T0 - 7200_000).toISOString() },
];
const [A, B] = items.map((i) => i.match_id);

function doc(over: Record<string, unknown>) {
  return { ok: true, data: statusFixture({ server_now: new Date(Date.now()).toISOString(), ...over }) };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  __resetFilmRoomPhasesForTests();
  mockGet.mockReset();
  mockFocused = true;
});
afterEach(() => jest.useRealTimers());

describe("useFilmRoomPhases", () => {
  it("backs off 30 s, 60 s, 120 s ... 5 min", () => {
    expect([0, 1, 2, 3, 10].map(phaseBackoffMs)).toEqual([30_000, 60_000, 120_000, 240_000, 300_000]);
  });

  it("stops for a match stuck past its film window, and for a settled one", () => {
    const stuck = statusFixture({ phase: "building", phase_reason: null, film_window_until: iso(T0 - 1) });
    expect(isMoving(stuck, 0, T0)).toBe(false);
    expect(isMoving(statusFixture({ phase: "ready", phase_reason: null }), 0, T0)).toBe(false);
    expect(isMoving(statusFixture({}), 0, T0)).toBe(true);
  });

  it("reads nothing while unfocused", async () => {
    mockFocused = false;
    mockGet.mockResolvedValue(doc({}));
    renderHook(() => useFilmRoomPhases(items, null, null));
    await flush();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("two surfaces share one cache: one read per match", async () => {
    mockGet.mockResolvedValue(doc({}));
    renderHook(() => useFilmRoomPhases(items, null, null));
    renderHook(() => useFilmRoomPhases(items, null, null));
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(new Set(mockGet.mock.calls.map((c) => c[1]))).toEqual(new Set([A, B]));
  });

  it("re-reads only moving matches, backing off while nothing changes, and not while unfocused", async () => {
    mockGet.mockImplementation(async (_sb: unknown, id: string) => (id === A ? doc({}) : doc({ phase: "ready", phase_reason: null })));
    const { rerender } = renderHook(({ f }: { f: boolean }) => {
      mockFocused = f;
      return useFilmRoomPhases(items, null, null);
    }, { initialProps: { f: true } });
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await flush();
    // Only A (moving) is re-read.
    expect(mockGet.mock.calls.slice(2).map((c) => c[1])).toEqual([A]);
    // Unchanged: the next read waits 60 s, not 30 s.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(3);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(4);
    // Unfocused: no more reads.
    rerender({ f: false });
    await act(async () => {
      jest.advanceTimersByTime(600_000);
    });
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(4);
  });

  it("keeps each card's phase object while nothing about it changed (memoised posters skip ticks)", async () => {
    mockGet.mockImplementation(async (_sb: unknown, id: string) =>
      id === A
        ? doc({ phase: "waiting_for_angle", phase_reason: null, wait_deadline_at: iso(T0 + 300_000) })
        : doc({ phase: "building", phase_reason: null }),
    );
    const { result } = renderHook(() => useFilmRoomPhases(items, null, null));
    await flush();
    const first = result.current;
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current[B]).toBe(first[B]);
    expect(result.current[A]).not.toBe(first[A]);
  });

  it("a refresh restarts the backoff", async () => {
    mockGet.mockResolvedValue(doc({}));
    renderHook(() => useFilmRoomPhases(items.slice(0, 1), null, null));
    await flush();
    act(() => refreshMatchPhases([A]));
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
