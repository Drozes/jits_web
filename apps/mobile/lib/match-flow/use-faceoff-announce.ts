import * as React from "react";

interface FaceoffAnnounceParams {
  /** The face-off's channel is open (weight and ready steps). */
  active: boolean;
  meId: string;
  /** This side's state, as the other phone should see it. */
  recording: boolean;
  myWeighed: boolean;
  myReady: boolean;
  myWeight: number | null;
  /** Nothing is announced once the match started or this side is leaving. */
  startedRef: React.MutableRefObject<boolean>;
  cancelledRef: React.MutableRefObject<boolean>;
  /** How often the state is repeated until the match starts. */
  repeatMs: number;
  broadcastRecordingOptIn: (athleteId: string, on: boolean) => Promise<unknown>;
  broadcastWeighedIn: (athleteId: string, weight: number | null) => Promise<unknown>;
  broadcastReady: (athleteId: string) => Promise<unknown>;
}

/**
 * Says where this side of the face-off stands (recording choice, weighed in,
 * ready): on joining, on every change, and on a repeat until the match
 * starts. A broadcast sent before the other side's channel joined is simply
 * gone, and none of this state lives in the DB. Split out of
 * `use-faceoff.ts` (timekeeper mode ARCHITECTURE 2.3, "Announce").
 */
export function useFaceoffAnnounce(p: FaceoffAnnounceParams): void {
  const pRef = React.useRef(p);
  pRef.current = p;
  const { broadcastRecordingOptIn, broadcastWeighedIn, broadcastReady } = p;

  const announce = React.useCallback(() => {
    const s = pRef.current;
    if (!s.active || s.startedRef.current || s.cancelledRef.current) return;
    void broadcastRecordingOptIn(s.meId, s.recording);
    if (s.myWeighed) void broadcastWeighedIn(s.meId, s.myWeight);
    if (s.myReady) void broadcastReady(s.meId);
  }, [broadcastRecordingOptIn, broadcastWeighedIn, broadcastReady]);

  React.useEffect(() => {
    announce();
  }, [announce, p.recording, p.myWeighed, p.myReady, p.active]);

  React.useEffect(() => {
    if (!p.active) return;
    const id = setInterval(announce, p.repeatMs);
    return () => clearInterval(id);
  }, [p.active, p.repeatMs, announce]);
}
