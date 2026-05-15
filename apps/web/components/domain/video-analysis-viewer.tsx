"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useVideoProgress, type VideoProgress } from "@jits/shared/hooks/use-video-progress";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types (mirror BE `get_video_analysis` return shape — see jr_be
// `supabase/migrations/20260313100000_video_rpcs.sql:280-365`).
// ---------------------------------------------------------------------------

interface PositionEntry {
  position?: string;
  timestamp_s?: number;
  duration_s?: number;
}

interface ScoringMoment {
  type?: string;
  description?: string;
  timestamp_s?: number;
  athlete_id?: string;
}

interface Recommendation {
  athlete_id?: string;
  text?: string;
  category?: string;
}

interface TechniqueTag {
  id: string;
  technique_name: string;
  category: string | null;
  athlete_id: string | null;
  timestamp_start: number;
  timestamp_end: number | null;
  confidence: number | null;
  source: string;
}

interface VideoAnalysisPayload {
  analysis: {
    id: string;
    video_id: string;
    summary: string | null;
    positions: PositionEntry[] | null;
    scoring_moments: ScoringMoment[] | null;
    recommendations: Recommendation[] | null;
    biomechanical_timeline: Array<Record<string, unknown>> | null;
    model_used: string | null;
    analysis_tier: string | null;
    tokens_used: number | null;
    cost_cents: number | null;
    completed_at: string | null;
    merge_strategy?: string | null;
    source_chunk_count?: number | null;
    dedup_dropped_count?: number | null;
  } | null;
  technique_tags: TechniqueTag[];
}

interface VideoAnalysisViewerProps {
  videoId: string;
  /**
   * Optional. When provided, used as the `<video>` element's src. If
   * omitted, the viewer fetches `match_videos.storage_path` and builds
   * a signed URL.
   */
  videoSrc?: string;
  /** Optional title rendered above the player. */
  title?: string;
}

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function chunkBgClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "analyzing":
      return "bg-amber-400 animate-pulse";
    case "failed":
      return "bg-rose-500";
    case "ready":
    case "uploading":
      return "bg-zinc-400/70";
    default:
      return "bg-zinc-300/60";
  }
}

/**
 * VideoAnalysisViewer
 *
 * Renders a `match_videos` row's playback + analysis. Lifecycle:
 *
 * 1. While `status !== 'analyzed'`, show the live chunk strip driven
 *    by `useVideoProgress` (BE §3.4 + §5). For each completed chunk,
 *    callers can drill into per-chunk analyses (v1: just the strip).
 * 2. Once `status === 'analyzed'`, swap to the merged
 *    `get_video_analysis(videoId)` payload — summary, positions,
 *    scoring moments, technique tags, recommendations.
 *
 * Mirrors the vanilla-JS reference viewer at
 * `jr_be/scripts/test-video/viewer/app.js`. Port focuses on parity for
 * summary + timeline + technique tags; biomechanics is rendered as a
 * raw JSON dump in v1 (the BE has structured shape but the UX design
 * is deferred to feature-011).
 */
export function VideoAnalysisViewer({ videoId, videoSrc, title }: VideoAnalysisViewerProps) {
  const supabase = useMemo(() => createClient(), []);
  const progress = useVideoProgress(supabase, videoId);

  const [analysis, setAnalysis] = useState<VideoAnalysisPayload | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [resolvedVideoSrc, setResolvedVideoSrc] = useState<string | null>(videoSrc ?? null);

  // Resolve the playback URL if the caller didn't pass one.
  useEffect(() => {
    if (videoSrc) {
      setResolvedVideoSrc(videoSrc);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("match_videos")
        .select("storage_path")
        .eq("id", videoId)
        .maybeSingle();
      if (cancelled || !data?.storage_path) return;
      const { data: signed } = await supabase
        .storage
        .from("match-videos")
        .createSignedUrl(data.storage_path, 60 * 60); // 1h
      if (!cancelled && signed?.signedUrl) setResolvedVideoSrc(signed.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [supabase, videoId, videoSrc]);

  // Fetch the merged analysis once status flips to 'analyzed', or on mount
  // if we landed here after the merge already completed.
  const status = progress.data?.status;
  useEffect(() => {
    if (status !== "analyzed") return;
    let cancelled = false;
    setAnalysisLoading(true);
    setAnalysisError(null);
    (async () => {
      const { data, error } = await supabase.rpc("get_video_analysis", { p_video_id: videoId });
      if (cancelled) return;
      if (error) {
        setAnalysisError(error.message ?? "Failed to load analysis");
      } else {
        setAnalysis(data as unknown as VideoAnalysisPayload);
      }
      setAnalysisLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, videoId, status]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title ?? "Match analysis"}</CardTitle>
        {progress.data && (
          <Badge variant={status === "analyzed" ? "default" : "secondary"}>
            {status ?? "loading"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Player */}
        <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
          {resolvedVideoSrc ? (
            <video
              src={resolvedVideoSrc}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
              Loading video…
            </div>
          )}
        </div>

        {/* Progress / chunk strip */}
        <ChunkStrip progress={progress.data} loading={progress.loading} />

        {/* Latest error message — if any */}
        {progress.data?.latest_error_message && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-600">
            <strong className="font-semibold">Last error:</strong>{" "}
            {progress.data.latest_error_message}
          </div>
        )}

        {/* Merged analysis tabs */}
        {status === "analyzed" && (
          <AnalysisTabs payload={analysis} loading={analysisLoading} error={analysisError} />
        )}

        {/* Pre-analyzed state hint */}
        {status && status !== "analyzed" && !progress.loading && (
          <p className="text-xs text-muted-foreground">
            Analysis in progress. The merged report will appear here automatically once all chunks finish.
          </p>
        )}

        <RefreshFooter onClick={progress.refresh} rpcMissing={progress.rpcMissing} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChunkStrip({
  progress,
  loading,
}: {
  progress: VideoProgress | null;
  loading: boolean;
}) {
  if (loading && !progress) {
    return <div className="h-6 w-full animate-pulse rounded bg-muted" />;
  }
  if (!progress) return null;
  if (!progress.chunk_count || progress.chunks.length === 0) {
    // Pre-slicer state — show a single placeholder bar.
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-2 flex-1 rounded bg-muted" />
        <span>waiting for slicer…</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-2 w-full overflow-hidden rounded">
        {progress.chunks.map((c) => (
          <div
            key={c.chunk_id}
            title={`#${c.idx}  ${formatTime(c.start_s)}-${formatTime(c.end_s)}  [${c.status}]`}
            className={cn("h-full flex-1 border-r border-background last:border-r-0", chunkBgClass(c.status))}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>
          {progress.chunks_completed}/{progress.chunk_count ?? "?"} chunks done
          {progress.failed_chunk_count > 0 ? ` • ${progress.failed_chunk_count} failed` : ""}
        </span>
        <span>{progress.requested_tier}</span>
      </div>
    </div>
  );
}

function RefreshFooter({ onClick, rpcMissing }: { onClick: () => void; rpcMissing: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>
        {rpcMissing ? "Realtime-only (RPC pending)" : "Live"}
      </span>
      <Button variant="ghost" size="sm" onClick={onClick}>
        Refresh
      </Button>
    </div>
  );
}

function AnalysisTabs({
  payload,
  loading,
  error,
}: {
  payload: VideoAnalysisPayload | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <p className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (loading || !payload) {
    return <div className="h-32 w-full animate-pulse rounded bg-muted" />;
  }
  const analysis = payload.analysis;
  if (!analysis) {
    return <p className="text-sm text-muted-foreground">No analysis available yet.</p>;
  }

  const positions = analysis.positions ?? [];
  const moments = analysis.scoring_moments ?? [];
  const recs = analysis.recommendations ?? [];
  const tags = payload.technique_tags ?? [];

  return (
    <Tabs defaultValue="summary" className="w-full">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="timeline">Timeline ({positions.length})</TabsTrigger>
        <TabsTrigger value="techniques">Techniques ({tags.length})</TabsTrigger>
        <TabsTrigger value="recommendations">Tips ({recs.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="space-y-3 pt-3">
        {analysis.summary
          ? analysis.summary.split(/\n\n+/).map((p, i) => (
              <p key={i} className="text-sm leading-relaxed">{p.trim()}</p>
            ))
          : <p className="text-sm text-muted-foreground">No summary.</p>}
        <div className="flex flex-wrap gap-1 pt-2">
          {analysis.model_used && <Badge variant="outline">model: {analysis.model_used}</Badge>}
          {analysis.analysis_tier && <Badge variant="outline">tier: {analysis.analysis_tier}</Badge>}
          {analysis.merge_strategy && <Badge variant="outline">{analysis.merge_strategy}</Badge>}
          {analysis.source_chunk_count != null && (
            <Badge variant="outline">{analysis.source_chunk_count} chunks</Badge>
          )}
          {analysis.dedup_dropped_count != null && analysis.dedup_dropped_count > 0 && (
            <Badge variant="outline">dedup: -{analysis.dedup_dropped_count}</Badge>
          )}
          {analysis.tokens_used != null && (
            <Badge variant="outline">{analysis.tokens_used.toLocaleString()} tokens</Badge>
          )}
        </div>
      </TabsContent>

      <TabsContent value="timeline" className="space-y-3 pt-3">
        <PositionBar positions={positions} moments={moments} />
        <ul className="space-y-1.5">
          {moments.map((m, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span className="w-12 font-mono text-xs text-muted-foreground">
                {formatTime(m.timestamp_s)}
              </span>
              <span className="font-medium">{m.type ?? "event"}</span>
              <span className="text-muted-foreground">{m.description}</span>
            </li>
          ))}
          {moments.length === 0 && (
            <li className="text-sm text-muted-foreground">No scoring moments recorded.</li>
          )}
        </ul>
      </TabsContent>

      <TabsContent value="techniques" className="pt-3">
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No technique tags.</p>
        ) : (
          <ul className="space-y-1.5">
            {tags.map((t) => (
              <li key={t.id} className="flex items-baseline gap-2 text-sm">
                <span className="w-16 font-mono text-xs text-muted-foreground">
                  {formatTime(t.timestamp_start)}
                  {t.timestamp_end != null ? `-${formatTime(t.timestamp_end)}` : ""}
                </span>
                <Badge variant="outline">{t.category ?? "tag"}</Badge>
                <span className="font-medium">{t.technique_name}</span>
                {t.confidence != null && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {Math.round(t.confidence * 100)}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="recommendations" className="space-y-2 pt-3">
        {recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recommendations.</p>
        ) : (
          recs.map((r, i) => (
            <div key={i} className="rounded border border-border bg-muted/40 p-2 text-sm">
              {r.category && <Badge className="mb-1" variant="outline">{r.category}</Badge>}
              <p>{r.text}</p>
            </div>
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}

function PositionBar({
  positions,
  moments,
}: {
  positions: PositionEntry[];
  moments: ScoringMoment[];
}) {
  if (positions.length === 0) return null;
  const last = positions[positions.length - 1];
  const total = Math.max((last?.timestamp_s ?? 0) + (last?.duration_s ?? 0), 1);
  return (
    <div className="relative h-6 w-full overflow-hidden rounded bg-muted">
      {positions.map((p, i) => {
        const left = ((p.timestamp_s ?? 0) / total) * 100;
        const width = ((p.duration_s ?? 1) / total) * 100;
        return (
          <div
            key={i}
            title={`${p.position ?? "unknown"} (${formatTime(p.timestamp_s)})`}
            className="absolute top-0 h-full bg-primary/70"
            style={{ left: `${left}%`, width: `${width}%`, opacity: 0.4 + (i % 5) * 0.1 }}
          >
            <span className="ml-1 truncate text-[9px] text-white">{p.position}</span>
          </div>
        );
      })}
      {moments.map((m, i) => {
        const left = ((m.timestamp_s ?? 0) / total) * 100;
        return (
          <div
            key={`m${i}`}
            title={`${m.type ?? "event"}: ${m.description ?? ""}`}
            className="absolute top-0 h-full w-0.5 bg-rose-500"
            style={{ left: `${left}%` }}
          />
        );
      })}
    </div>
  );
}
