import * as React from "react";
import type { RecordingState } from "@/lib/video/use-video-recorder";

/**
 * Seconds since the recorder first reached `recording`. This is the REC
 * readout, not the match clock: it starts a beat after the clock (camera
 * start latency) and keeps counting while the match clock is paused,
 * because the camera keeps recording. After recording ends it holds the
 * last value.
 */
export function useRecordingElapsed(state: RecordingState): number {
  const [elapsed, setElapsed] = React.useState(0);
  const startedAtRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (state !== "recording") return;
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
    const startedAt = startedAtRef.current;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state]);
  return elapsed;
}
