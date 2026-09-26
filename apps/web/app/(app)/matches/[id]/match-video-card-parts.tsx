"use client";

import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { watchLabel, type VideoCardPhase } from "./match-video-state";

/** Presentational pieces of `MatchVideoCard`; all state lives in the card. */

export const CARD_PANELS: Partial<
  Record<VideoCardPhase, { title: string; body: string; retry: boolean }>
> = {
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

export function Poster({ url, signing }: { url: string | null; signing: boolean }) {
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

export function CardPanel({
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
    <div
      role="alert"
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
      style={{ background: "var(--bg-elevated-hover)" }}
    >
      <p className="font-heading font-bold" style={{ color: "var(--text-primary)" }}>{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      {retry && (
        <Button
          size="sm"
          variant={primary ? "default" : "outline"}
          className="mt-3 shadow-none rounded-[var(--radius-sm)]"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}

export function CardAction({
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
