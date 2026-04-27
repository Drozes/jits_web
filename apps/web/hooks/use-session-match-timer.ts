"use client";

import { useState, useEffect, useCallback } from "react";

export type TimerSyncEvent =
  | { type: "started"; startedAt: string }
  | { type: "paused"; pausedAt: string }
  | { type: "resumed"; totalPausedDuration: number }
  | { type: "ended" };

interface UseSessionMatchTimerParams {
  durationSeconds: number;
  startedAt: string | null;
  pausedAt: string | null;
  totalPausedDuration: number;
}

interface UseSessionMatchTimerReturn {
  elapsed: number;
  remaining: number;
  running: boolean;
  paused: boolean;
  formatted: string;
  percentComplete: number;
  syncFromBroadcast: (event: TimerSyncEvent) => void;
}

function calcElapsed(
  startedAt: string | null,
  pausedAt: string | null,
  totalPaused: number,
): number {
  if (!startedAt) return 0;
  const anchor = pausedAt ? new Date(pausedAt).getTime() : Date.now();
  return Math.max(0, Math.floor((anchor - new Date(startedAt).getTime()) / 1000) - totalPaused);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function useSessionMatchTimer(params: UseSessionMatchTimerParams): UseSessionMatchTimerReturn {
  const [startedAt, setStartedAt] = useState(params.startedAt);
  const [pausedAt, setPausedAt] = useState(params.pausedAt);
  const [totalPaused, setTotalPaused] = useState(params.totalPausedDuration);
  const [running, setRunning] = useState(!!params.startedAt && !params.pausedAt);
  const [tick, setTick] = useState(0);

  const paused = running && !!pausedAt;
  const elapsed = calcElapsed(startedAt, pausedAt, totalPaused);
  const remaining = Math.max(0, params.durationSeconds - elapsed);
  void tick; // consumed to trigger re-render

  useEffect(() => {
    if (!running || paused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running, paused]);

  const syncFromBroadcast = useCallback((event: TimerSyncEvent) => {
    switch (event.type) {
      case "started":
        setStartedAt(event.startedAt);
        setPausedAt(null);
        setRunning(true);
        break;
      case "paused":
        setPausedAt(event.pausedAt);
        break;
      case "resumed":
        setPausedAt(null);
        setTotalPaused(event.totalPausedDuration);
        break;
      case "ended":
        setRunning(false);
        setPausedAt(null);
        break;
    }
  }, []);

  return {
    elapsed,
    remaining,
    running,
    paused,
    formatted: formatTime(remaining),
    percentComplete: params.durationSeconds > 0 ? Math.min(100, Math.round((elapsed / params.durationSeconds) * 100)) : 0,
    syncFromBroadcast,
  };
}
