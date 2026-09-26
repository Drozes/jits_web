"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getMatchVideoPlaybackResult,
  type MatchDetailVideo,
} from "@jits/shared/api/queries";
import type { DomainErrorCode } from "@jits/shared/api/errors";
import { formatVideoDuration } from "@jits/shared/utils";
import { initialVideoPhase, type VideoCardPhase } from "./match-video-state";
import { CARD_PANELS, CardAction, CardPanel, Poster } from "./match-video-card-parts";

interface MatchVideoCardProps {
  video: MatchDetailVideo;
  /** Signed server-side for the first paint; null when not signed or failed. */
  initialUrl: string | null;
  initialError: DomainErrorCode | null;
  /** The one Signal Red Watch on the page. */
  primary: boolean;
}

// MediaError.MEDIA_ERR_DECODE: the file itself is bad, a fresh URL won't help.
const MEDIA_ERR_DECODE = 3;
/** Hard cap on silent re-signs per mount, whatever playback does in between. */
export const MAX_SILENT_RESIGNS = 2;
/** Seconds past the resume point that count as real progress. */
const PROGRESS_SECONDS = 2;

export function MatchVideoCard({ video, initialUrl, initialError, primary }: MatchVideoCardProps) {
  const supabase = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<VideoCardPhase>(() =>
    initialVideoPhase(video, initialUrl, initialError),
  );
  const [url, setUrl] = useState<string | null>(initialUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  // A silent re-sign spends the budget; only real progress past the resume
  // point refunds it, so a file that fails at the same spot cannot loop.
  const budgetSpentRef = useRef(false);
  const silentResignsRef = useRef(0);
  const progressFloorRef = useRef(0);
  const resumeAtRef = useRef(0);

  // iOS Safari ignores autoPlay on a freshly mounted element unless play() is
  // called; the Watch tap is the user gesture that allows it.
  useEffect(() => {
    if (phase !== "playing") return;
    try {
      videoRef.current?.play()?.catch(() => {});
    } catch {
      // Environments without media playback (jsdom) throw synchronously.
    }
  }, [phase]);

  async function sign() {
    const res = await getMatchVideoPlaybackResult(supabase, video.id);
    if (!res.ok) {
      setPhase(res.error.code === "VIDEO_FILE_MISSING" ? "missing" : "error");
    } else if (!res.data) {
      setPhase("absent");
    } else {
      setUrl(res.data.url);
      setPhase("playing");
    }
  }

  function start() {
    if (url && phase === "idle") {
      setPhase("playing");
      return;
    }
    setPhase("signing");
    void sign();
  }

  function onVideoError() {
    const el = videoRef.current;
    if (
      budgetSpentRef.current ||
      silentResignsRef.current >= MAX_SILENT_RESIGNS ||
      el?.error?.code === MEDIA_ERR_DECODE
    ) {
      setPhase("error");
      return;
    }
    // Most likely the 1h signed URL expired mid-session: re-sign, keep the
    // element mounted (fullscreen survives), and resume where it was.
    budgetSpentRef.current = true;
    silentResignsRef.current += 1;
    progressFloorRef.current = el?.currentTime ?? 0;
    resumeAtRef.current = progressFloorRef.current;
    void sign();
  }

  function onTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    if (e.currentTarget.currentTime > progressFloorRef.current + PROGRESS_SECONDS) {
      budgetSpentRef.current = false;
    }
  }

  function onRetry() {
    budgetSpentRef.current = false;
    start();
  }

  const panel = CARD_PANELS[phase];
  const duration = formatVideoDuration(video.duration_seconds);

  return (
    <div
      data-testid={`match-video-card-${video.id}`}
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      <div className="relative aspect-video w-full bg-black">
        {phase === "playing" && url ? (
          <video
            ref={videoRef}
            src={url}
            controls
            playsInline
            autoPlay
            preload="metadata"
            poster={video.poster_url ?? undefined}
            className="h-full w-full"
            onError={onVideoError}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={(e) => {
              if (resumeAtRef.current > 0) {
                e.currentTarget.currentTime = resumeAtRef.current;
                resumeAtRef.current = 0;
              }
            }}
          />
        ) : panel ? (
          <CardPanel {...panel} primary={primary} onRetry={onRetry} />
        ) : (
          <Poster url={video.poster_url} signing={phase === "signing"} />
        )}
      </div>

      <div className="flex flex-col" style={{ gap: "var(--space-2)", padding: "var(--space-3) var(--space-4)" }}>
        <div className="flex items-baseline justify-between" style={{ gap: "var(--space-3)" }}>
          <span className="font-heading font-bold" style={{ color: "var(--text-primary)" }}>
            {video.angle_label}
          </span>
          {duration && <span className="font-mono tabular-nums text-xs text-muted-foreground">{duration}</span>}
        </div>
        <CardAction video={video} phase={phase} primary={primary} onWatch={start} />
      </div>
    </div>
  );
}
