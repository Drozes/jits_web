// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionMatchTimer } from "./use-session-match-timer";
import type { TimerSyncEvent } from "./use-session-match-timer";

const DURATION = 300; // 5-minute match
const STARTED_AT = "2026-04-25T12:00:00Z";
const STARTED_AT_MS = new Date(STARTED_AT).getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(STARTED_AT_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSessionMatchTimer", () => {
  describe("initial state (idle, not started)", () => {
    it("returns zero elapsed and full remaining when not started", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: null,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      expect(result.current.elapsed).toBe(0);
      expect(result.current.remaining).toBe(DURATION);
      expect(result.current.running).toBe(false);
      expect(result.current.paused).toBe(false);
      expect(result.current.formatted).toBe("05:00");
      expect(result.current.percentComplete).toBe(0);
    });
  });

  describe("running state", () => {
    it("starts running when startedAt is provided", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      expect(result.current.running).toBe(true);
      expect(result.current.paused).toBe(false);
    });

    it("increments elapsed as time passes", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      expect(result.current.elapsed).toBe(0);

      // Advance 10 seconds
      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(result.current.elapsed).toBe(10);
      expect(result.current.remaining).toBe(290);
    });

    it("formats remaining time correctly", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      // Advance 1 minute 30 seconds
      act(() => {
        vi.advanceTimersByTime(90_000);
      });

      expect(result.current.formatted).toBe("03:30");
    });

    it("calculates percent complete", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      // Advance 150 seconds (50%)
      act(() => {
        vi.advanceTimersByTime(150_000);
      });

      expect(result.current.percentComplete).toBe(50);
    });

    it("clamps remaining to zero when elapsed exceeds duration", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      act(() => {
        vi.advanceTimersByTime(400_000);
      });

      expect(result.current.remaining).toBe(0);
      expect(result.current.percentComplete).toBe(100);
    });
  });

  describe("paused state", () => {
    it("freezes elapsed at the pause timestamp when paused via broadcast", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      // Advance 60 seconds then pause
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      const pausedAt = new Date(STARTED_AT_MS + 60_000).toISOString();
      act(() => {
        result.current.syncFromBroadcast({ type: "paused", pausedAt } as TimerSyncEvent);
      });

      expect(result.current.elapsed).toBe(60);
      expect(result.current.paused).toBe(true);
      expect(result.current.running).toBe(true);

      // Advancing real time should not change elapsed (timer stops when paused)
      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(result.current.elapsed).toBe(60);
    });

    it("uses pausedAt as anchor when initialized in paused state", () => {
      const pausedAt = new Date(STARTED_AT_MS + 60_000).toISOString();

      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt,
          totalPausedDuration: 0,
        }),
      );

      // When initialized with pausedAt, running is false (!!startedAt && !pausedAt)
      // but elapsed is still computed from the pausedAt anchor
      expect(result.current.elapsed).toBe(60);
      expect(result.current.running).toBe(false);

      // Advancing real time does not change elapsed since not running
      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(result.current.elapsed).toBe(60);
    });
  });

  describe("syncFromBroadcast", () => {
    it("handles 'started' event", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: null,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      expect(result.current.running).toBe(false);

      act(() => {
        result.current.syncFromBroadcast({ type: "started", startedAt: STARTED_AT });
      });

      expect(result.current.running).toBe(true);
      expect(result.current.paused).toBe(false);
    });

    it("handles 'paused' event", () => {
      const pausedAt = new Date(STARTED_AT_MS + 30_000).toISOString();
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      act(() => {
        result.current.syncFromBroadcast({
          type: "paused",
          pausedAt,
        } as TimerSyncEvent);
      });

      expect(result.current.paused).toBe(true);
      expect(result.current.elapsed).toBe(30);
    });

    it("handles 'resumed' event and preserves elapsed correctly", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      // Run for 30 seconds then pause
      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      const pausedAt = new Date(STARTED_AT_MS + 30_000).toISOString();
      act(() => {
        result.current.syncFromBroadcast({ type: "paused", pausedAt } as TimerSyncEvent);
      });

      expect(result.current.paused).toBe(true);
      expect(result.current.elapsed).toBe(30);

      // Wait 10 seconds while paused, then resume (total paused = 10)
      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      act(() => {
        result.current.syncFromBroadcast({
          type: "resumed",
          totalPausedDuration: 10,
        });
      });

      expect(result.current.paused).toBe(false);
      // After resume: Date.now() = STARTED_AT_MS + 40_000
      // elapsed = floor((40000) / 1000) - 10 = 30
      expect(result.current.elapsed).toBe(30);

      // Time continues after resume
      act(() => {
        vi.advanceTimersByTime(5_000);
      });

      expect(result.current.elapsed).toBe(35);
    });

    it("handles 'ended' event", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: STARTED_AT,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      expect(result.current.running).toBe(true);

      act(() => {
        result.current.syncFromBroadcast({ type: "ended" });
      });

      expect(result.current.running).toBe(false);
      expect(result.current.paused).toBe(false);
    });
  });

  describe("format edge cases", () => {
    it("formats zero seconds as 05:00 (full duration remaining)", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: DURATION,
          startedAt: null,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      expect(result.current.formatted).toBe("05:00");
    });

    it("pads single-digit minutes and seconds", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: 65, // 1:05 total
          startedAt: null,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      expect(result.current.formatted).toBe("01:05");
    });

    it("returns 0 percent for zero-duration matches", () => {
      const { result } = renderHook(() =>
        useSessionMatchTimer({
          durationSeconds: 0,
          startedAt: null,
          pausedAt: null,
          totalPausedDuration: 0,
        }),
      );

      expect(result.current.percentComplete).toBe(0);
    });
  });
});
