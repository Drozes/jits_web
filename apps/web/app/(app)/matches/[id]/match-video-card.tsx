"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  getMatchVideoPlaybackResult,
  type MatchDetailVideo,
} from "@jits/shared/api/queries";
import type { DomainErrorCode } from "@jits/shared/api/errors";
import { formatVideoDuration } from "@jits/shared/utils";
import { initialVideoPhase, watchLabel, type VideoCardPhase } from "./match-video-state";

interface MatchVideoCardProps {
  video: MatchDetailVideo;
  /** Signed server-side for the first paint; null when not signed or failed. */
  initialUrl: string | null;
  initialError: DomainErrorCode | null;
  /** The one Signal Red Watch on the page. */
  primary: boolean;
}

const PANELS: Partial<Record<VideoCardPhase, { title: string; body: string; retry: boolean }>> = {
  absent: {
    title: "Video unavailable",
    body: "This recording was removed or you don't have access to it.",
    retry: false,
  },
  missing: {
    title: "Video file not found",
    body: "The upload didn't finish, so this recording can't be played.",
    retry: false,
  },
  error: {
    title: "Couldn't play this video",
    body: "The link may have expired or your connection dropped.",
    retry: true,
  },
};

// MediaError.MEDIA_ERR_DECODE: the file itself is bad, a fresh URL won't help.
const MEDIA_ERR_DECODE = 3;

export function MatchVideoCard({ video, initialUrl, initialError, primary }: MatchVideoCardProps) {
  const supabase = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<VideoCardPhase>(() =>
    initialVideoPhase(video, initialUrl, initialError),
  );
  const [url, setUrl] = useState<string | null>(initialUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  // One silent re-sign per stretch without successful playback.
  const resignedRef = useRef(false);
  const resumeAtRef = useRef(0);

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
    if (resignedRef.current || el?.error?.code === MEDIA_ERR_DECODE) {
      setPhase("error");
      return;
    }
    // Most likely the 1h signed URL expired mid-session: re-sign once, keep
    // the element mounted (fullscreen survives), and resume where it was.
    resignedRef.current = true;
    resumeAtRef.current = el?.currentTime ?? 0;
    void sign();
  }

  function onRetry() {
    resignedRef.current = false;
    start();
  }

  const panel = PANELS[phase];
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
            onPlaying={() => {
              resignedRef.current = false;
            }}
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

function Poster({ url, signing }: { url: string | null; signing: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center" style={{ background: "var(--bg-elevated-hover)" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" data-testid="match-video-poster" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <PlayCircle data-testid="match-video-placeholder" className="h-10 w-10 text-muted-foreground" aria-hidden />
      )}
      {signing && (
        <div className="absolute inset-0 grid place-items-center bg-black/50" role="status" aria-label="Loading video">
          <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden />
        </div>
      )}
    </div>
  );
}

function CardPanel({
  title,
  body,
  retry,
  primary,
  onRetry,
}: {
  title: string;
  body: string;
  retry: boolean;
  primary: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center text-center px-6" style={{ background: "var(--bg-elevated-hover)" }}>
      <p className="font-heading font-bold" style={{ color: "var(--text-primary)" }}>{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      {retry && (
        <Button size="sm" variant={primary ? "default" : "outline"} className="mt-3 shadow-none rounded-[var(--radius-sm)]" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

function CardAction({
  video,
  phase,
  primary,
  onWatch,
}: {
  video: MatchDetailVideo;
  phase: VideoCardPhase;
  primary: boolean;
  onWatch: () => void;
}) {
  if (phase === "processing") {
    return (
      <>
        <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
          <span
            className="font-mono uppercase text-xs border text-amber-500 border-amber-500"
            style={{ padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-xs)" }}
          >
            {video.status === "uploading" ? "Uploading" : "Processing"}
          </span>
          <span className="text-xs text-muted-foreground">Still uploading. Refresh the page to check again.</span>
        </div>
        <Button variant="outline" disabled className="shadow-none rounded-[var(--radius-sm)]">
          Processing...
        </Button>
      </>
    );
  }
  if (phase !== "idle" && phase !== "signing") return null;
  return (
    <>
      {video.playability === "failed" && (
        <p className="text-xs text-muted-foreground">Processing failed. The original recording may still play.</p>
      )}
      <Button
        variant={primary ? "default" : "outline"}
        className="shadow-none rounded-[var(--radius-sm)]"
        aria-label={watchLabel(video)}
        disabled={phase === "signing"}
        onClick={onWatch}
      >
        Watch
      </Button>
    </>
  );
}
