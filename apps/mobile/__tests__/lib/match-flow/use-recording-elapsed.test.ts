/**
 * The REC readout counts recording time, not match time: it starts when the
 * recorder first reaches `recording`, keeps counting while the match clock is
 * paused (the camera keeps recording) and holds its value after the stop.
 */
import { act, renderHook } from "@testing-library/react-native";
import { useRecordingElapsed } from "@/lib/match-flow/use-recording-elapsed";
import type { RecordingState } from "@/lib/video/use-video-recorder";

beforeEach(() => jest.useFakeTimers({ now: new Date("2026-09-26T12:00:00Z").getTime() }));
afterEach(() => jest.useRealTimers());

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

it("stays at 0 until recording starts, then counts whole seconds", () => {
  const { result, rerender } = renderHook(({ state }: { state: RecordingState }) => useRecordingElapsed(state), {
    initialProps: { state: "idle" as RecordingState },
  });
  advance(3_000);
  expect(result.current).toBe(0);

  rerender({ state: "recording" });
  expect(result.current).toBe(0);
  advance(2_000);
  expect(result.current).toBe(2);
  advance(134_000);
  expect(result.current).toBe(136);
});

it("keeps counting regardless of the match clock (it only watches the recorder)", () => {
  const { result } = renderHook(() => useRecordingElapsed("recording"));
  advance(10_000);
  expect(result.current).toBe(10);
});

it("holds the last value after recording stops", () => {
  const { result, rerender } = renderHook(({ state }: { state: RecordingState }) => useRecordingElapsed(state), {
    initialProps: { state: "recording" as RecordingState },
  });
  advance(5_000);
  rerender({ state: "stopping" });
  advance(10_000);
  expect(result.current).toBe(5);
  rerender({ state: "uploading" });
  advance(10_000);
  expect(result.current).toBe(5);
});
