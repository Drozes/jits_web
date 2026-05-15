"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { pauseMatch, resumeMatch } from "@jits/shared/api/mutations";
import { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import { useVideoRecorder } from "@/hooks/use-video-recorder";

interface TimekeeperLiveStepProps {
  onNext: (data?: { videoId?: string }) => void;
  matchId: string;
  durationSeconds: number;
  startedAt: string;
  pausedAt: string | null;
  totalPausedDuration: number;
  /**
   * Current athlete's `athletes.id` (NOT auth_user_id). Required by
   * `useVideoRecorder` to set `match_videos.uploaded_by` per BE
   * contract §2.1 + §8.1 (RLS keys on `auth_athlete_id()`).
   */
  currentAthleteId: string;
}

export function TimekeeperLiveStep({ onNext, matchId, durationSeconds, startedAt, pausedAt, totalPausedDuration, currentAthleteId }: TimekeeperLiveStepProps) {
  const endedRef = useRef(false);
  const advancedRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [endRequested, setEndRequested] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const timer = useSessionMatchTimer({ durationSeconds, startedAt, pausedAt, totalPausedDuration });
  const sync = useSessionMatchSync({ supabase, matchId });
  const video = useVideoRecorder(matchId, currentAthleteId);

  // Auto-start camera
  useEffect(() => { video.startRecording(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wake lock
  useEffect(() => {
    navigator.wakeLock?.request("screen").then((l) => { wakeLockRef.current = l; }).catch(() => {});
    return () => { wakeLockRef.current?.release(); };
  }, []);

  async function handlePauseResume() {
    if (timer.paused) {
      const res = await resumeMatch(supabase, matchId);
      if (res.ok) {
        timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: res.data.total_paused_duration });
        sync.broadcastTimerResumed(res.data.total_paused_duration);
      }
    } else {
      const res = await pauseMatch(supabase, matchId);
      if (res.ok) {
        timer.syncFromBroadcast({ type: "paused", pausedAt: res.data.paused_at });
        sync.broadcastTimerPaused(res.data.paused_at);
      }
    }
  }

  function handleEnd() {
    if (endedRef.current) return;
    endedRef.current = true;
    video.stopRecording();
    sync.broadcastMatchEnded();
    setEndRequested(true);
  }

  useEffect(() => {
    if (timer.remaining === 0 && timer.running && !endedRef.current) handleEnd();
  }, [timer.remaining, timer.running]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gate advancement on upload completion so the recorder hook stays
  // mounted until `recorder.onstop` fires and the upload+INSERT resolve.
  // Unmounting mid-upload would orphan the blob and prevent any
  // downstream step from observing `videoId`.
  useEffect(() => {
    if (!endRequested || advancedRef.current) return;
    // "idle" can occur when camera access was denied (no recorder ever
    // started) — advance anyway so the match flow isn't stuck.
    const terminal =
      video.uploadStatus === "done" ||
      video.uploadStatus === "error" ||
      video.uploadStatus === "idle";
    if (terminal) {
      advancedRef.current = true;
      onNext(video.videoId ? { videoId: video.videoId } : undefined);
    }
  }, [endRequested, video.uploadStatus, video.videoId, onNext]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Camera viewfinder (top 60%) */}
      <div className="relative flex-[3] bg-black overflow-hidden">
        <video ref={video.videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-1.5">
          <p className="text-3xl font-mono font-bold tabular-nums text-white">{timer.formatted}</p>
        </div>
        {video.uploadStatus === "uploading" && (
          <div className="absolute top-3 right-3"><Loader2 className="h-5 w-5 animate-spin text-white" /></div>
        )}
      </div>

      {/* Controls (bottom 40%) */}
      <div className="flex-[2] flex flex-col items-center justify-center gap-3 px-4 py-4">
        {video.error && <p className="text-xs text-amber-500">{video.error}</p>}
        {endRequested && video.uploadStatus === "uploading" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Uploading video…
          </p>
        )}
        <div className="flex gap-3 w-full max-w-sm">
          <Button variant="outline" size="lg" className="flex-1" onClick={handlePauseResume} disabled={endRequested}>
            {timer.paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
            {timer.paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="destructive" size="lg" className="flex-1" onClick={handleEnd} disabled={endRequested}>
            {endRequested ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
            {endRequested ? "Finishing…" : "End Match"}
          </Button>
        </div>
      </div>
    </div>
  );
}
