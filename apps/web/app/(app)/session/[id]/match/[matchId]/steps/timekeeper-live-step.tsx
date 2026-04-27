"use client";

import { useEffect, useRef } from "react";
import { Pause, Play, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { pauseMatch, resumeMatch } from "@jits/shared/api/mutations";
import { useSessionMatchTimer } from "@/hooks/use-session-match-timer";
import { useSessionMatchSync } from "@/hooks/use-session-match-sync";
import { useVideoRecorder } from "@/hooks/use-video-recorder";

interface TimekeeperLiveStepProps {
  onNext: () => void;
  matchId: string;
  durationSeconds: number;
  startedAt: string;
  pausedAt: string | null;
  totalPausedDuration: number;
}

export function TimekeeperLiveStep({ onNext, matchId, durationSeconds, startedAt, pausedAt, totalPausedDuration }: TimekeeperLiveStepProps) {
  const endedRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const timer = useSessionMatchTimer({ durationSeconds, startedAt, pausedAt, totalPausedDuration });
  const sync = useSessionMatchSync({ matchId });
  const video = useVideoRecorder(matchId);

  // Auto-start camera
  useEffect(() => { video.startRecording(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wake lock
  useEffect(() => {
    navigator.wakeLock?.request("screen").then((l) => { wakeLockRef.current = l; }).catch(() => {});
    return () => { wakeLockRef.current?.release(); };
  }, []);

  async function handlePauseResume() {
    const supabase = createClient();
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
    onNext();
  }

  useEffect(() => {
    if (timer.remaining === 0 && timer.running && !endedRef.current) handleEnd();
  }, [timer.remaining, timer.running]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="flex gap-3 w-full max-w-sm">
          <Button variant="outline" size="lg" className="flex-1" onClick={handlePauseResume}>
            {timer.paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
            {timer.paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="destructive" size="lg" className="flex-1" onClick={handleEnd}>
            <Square className="mr-2 h-4 w-4" />
            End Match
          </Button>
        </div>
      </div>
    </div>
  );
}
