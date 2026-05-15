import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// ---------------------------------------------------------------------------
// Public types — wire-compatible with BE contract
// jr_be/specs/013-chunked-video-pipeline/INTEGRATION.md §3.4 + §5
// ---------------------------------------------------------------------------

export type VideoProgressStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "slicing"
  | "analyzing"
  | "merging"
  | "analyzed"
  | "failed"
  | "deleted";

export type VideoChunkStatus =
  | "queued"
  | "uploading"
  | "ready"
  | "analyzing"
  | "completed"
  | "failed";

export interface VideoProgressChunk {
  chunk_id: string;
  idx: number;
  start_s: number;
  end_s: number;
  status: VideoChunkStatus;
  has_analysis: boolean;
}

export interface VideoProgress {
  video_id: string;
  status: VideoProgressStatus;
  chunk_count: number | null;
  chunks_completed: number;
  failed_chunk_count: number;
  requested_tier: "standard" | "premium";
  slice_started_at: string | null;
  slice_completed_at: string | null;
  merge_started_at: string | null;
  merge_completed_at: string | null;
  latest_error_message: string | null;
  chunks: VideoProgressChunk[];
}

export interface UseVideoProgressResult {
  /** Latest snapshot. `null` until first load completes. */
  data: VideoProgress | null;
  /** Set during the initial load. */
  loading: boolean;
  /** Set if the most recent RPC/fallback fetch errored. */
  error: string | null;
  /** True while running in degraded mode (RPC missing — Realtime-only). */
  rpcMissing: boolean;
  /** Force a fresh fetch (debounced internally). */
  refresh: () => void;
}

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 200;

/**
 * Detect the PostgREST "function does not exist" error so we can fall
 * back to Realtime-only mode pre-Round-3. The driver surfaces this as
 * `error.code === '42883'` (Postgres undefined_function) or a 404
 * status. We treat both as "RPC missing".
 */
function isRpcMissingError(err: { code?: string; message?: string; status?: number } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42883" || err.code === "PGRST202") return true;
  if (err.status === 404) return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("not found");
}

/**
 * Build a snapshot from raw table rows when the RPC isn't available.
 * Used pre-Round-3 (the `get_video_progress` migration hasn't shipped).
 * Mirrors the BE SQL sketch at §3.4 but in JS — best-effort, RLS-gated
 * SELECTs only.
 */
async function fetchVideoProgressViaTables(
  supabase: Client,
  videoId: string,
): Promise<VideoProgress | null> {
  const { data: video, error: videoErr } = await supabase
    .from("match_videos")
    .select(
      "id, status, chunk_count, chunks_completed, requested_tier, slice_started_at, slice_completed_at, merge_started_at, merge_completed_at",
    )
    .eq("id", videoId)
    .maybeSingle();

  if (videoErr || !video) return null;

  const { data: chunkRows } = await supabase
    .from("video_chunks")
    .select("id, idx, start_s, end_s, status, error_message, updated_at")
    .eq("video_id", videoId)
    .order("idx", { ascending: true });

  const chunkIds = (chunkRows ?? []).map((c) => c.id);
  const completedChunkIds = new Set<string>();
  let latestAnalysisErr: { message: string; ts: string } | null = null;
  if (chunkIds.length > 0) {
    const { data: analyses } = await supabase
      .from("video_chunk_analyses")
      .select("chunk_id, status, error_message, completed_at, created_at")
      .in("chunk_id", chunkIds);
    for (const a of analyses ?? []) {
      if (a.status === "completed") completedChunkIds.add(a.chunk_id);
      if (a.error_message) {
        const ts = a.completed_at ?? a.created_at ?? "";
        if (!latestAnalysisErr || ts > latestAnalysisErr.ts) {
          latestAnalysisErr = { message: a.error_message, ts };
        }
      }
    }
  }

  const chunks: VideoProgressChunk[] = (chunkRows ?? []).map((c) => ({
    chunk_id: c.id,
    idx: c.idx,
    start_s: Number(c.start_s),
    end_s: Number(c.end_s),
    status: c.status as VideoChunkStatus,
    has_analysis: completedChunkIds.has(c.id),
  }));

  let failedChunkCount = 0;
  let latestChunkErr: { message: string; ts: string } | null = null;
  for (const c of chunkRows ?? []) {
    if (c.status === "failed") failedChunkCount += 1;
    if (c.error_message) {
      const ts = c.updated_at ?? "";
      if (!latestChunkErr || ts > latestChunkErr.ts) {
        latestChunkErr = { message: c.error_message, ts };
      }
    }
  }

  let latestErrorMessage: string | null = null;
  if (latestChunkErr && latestAnalysisErr) {
    latestErrorMessage = latestChunkErr.ts > latestAnalysisErr.ts ? latestChunkErr.message : latestAnalysisErr.message;
  } else if (latestChunkErr) {
    latestErrorMessage = latestChunkErr.message;
  } else if (latestAnalysisErr) {
    latestErrorMessage = latestAnalysisErr.message;
  }

  return {
    video_id: video.id,
    status: video.status as VideoProgressStatus,
    chunk_count: video.chunk_count,
    chunks_completed: video.chunks_completed,
    failed_chunk_count: failedChunkCount,
    requested_tier: (video.requested_tier ?? "standard") as "standard" | "premium",
    slice_started_at: video.slice_started_at,
    slice_completed_at: video.slice_completed_at,
    merge_started_at: video.merge_started_at,
    merge_completed_at: video.merge_completed_at,
    latest_error_message: latestErrorMessage,
    chunks,
  };
}

/**
 * Subscribe to live progress for a `match_videos` row.
 *
 * Initial snapshot: `get_video_progress` RPC (BE §3.4). If the RPC is
 * missing (pre-Round-3 migration), falls back to a manual aggregate
 * over `match_videos` + `video_chunks` + `video_chunk_analyses` and
 * sets `rpcMissing=true`.
 *
 * Realtime: subscribes to BE §5 channels —
 *   - `match_videos:id=eq.<videoId>`
 *   - `video_chunks:video_id=eq.<videoId>`
 * On every event, schedules a debounced refresh (≈200 ms) to recompute
 * aggregates. The chunk-analyses channel is omitted v1; the parent
 * `chunks_completed` counter is bumped by a DB trigger so we'll observe
 * it via the `match_videos` channel anyway.
 *
 * Returns `null` data until the first fetch resolves. Re-running with a
 * new `videoId` tears down the prior subscription.
 */
export function useVideoProgress(
  supabase: Client,
  videoId: string | null,
): UseVideoProgressResult {
  const [data, setData] = useState<VideoProgress | null>(null);
  const [loading, setLoading] = useState<boolean>(!!videoId);
  const [error, setError] = useState<string | null>(null);
  const [rpcMissing, setRpcMissing] = useState<boolean>(false);

  // Track the latest videoId so debounced callbacks ignore stale runs.
  const versionRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rpcMissingRef = useRef(false);
  rpcMissingRef.current = rpcMissing;

  const fetchSnapshot = useCallback(
    async (vId: string, myVersion: number) => {
      if (!rpcMissingRef.current) {
        // The `rpcMissing` fallback path remains valuable during the
        // rollout window: a deploy may briefly run with the function
        // missing (PostgREST 42883/PGRST202) or a stale schema cache.
        // Falling back to direct table SELECTs lets the UI degrade
        // gracefully until PostgREST picks the new function up.
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "get_video_progress",
          { p_video_id: vId },
        );
        if (myVersion !== versionRef.current) return;
        if (!rpcErr && rpcData) {
          setData(rpcData as unknown as VideoProgress);
          setError(null);
          setLoading(false);
          return;
        }
        if (rpcErr && isRpcMissingError(rpcErr)) {
          setRpcMissing(true);
          rpcMissingRef.current = true;
        } else if (rpcErr) {
          // Non-missing error — surface it but still attempt fallback.
          setError(rpcErr.message ?? "Failed to load video progress");
        }
      }

      // Fallback path: manual aggregate.
      try {
        const snapshot = await fetchVideoProgressViaTables(supabase, vId);
        if (myVersion !== versionRef.current) return;
        if (snapshot) {
          setData(snapshot);
          setError(null);
        }
      } catch (err) {
        if (myVersion !== versionRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (myVersion === versionRef.current) setLoading(false);
      }
    },
    [supabase],
  );

  const scheduleRefresh = useCallback(
    (vId: string) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      const myVersion = versionRef.current;
      debounceTimerRef.current = setTimeout(() => {
        void fetchSnapshot(vId, myVersion);
      }, DEBOUNCE_MS);
    },
    [fetchSnapshot],
  );

  // Stable refresh handle for callers (cancels pending debounce).
  const refresh = useCallback(() => {
    if (!videoId) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    void fetchSnapshot(videoId, versionRef.current);
  }, [videoId, fetchSnapshot]);

  useEffect(() => {
    if (!videoId) {
      setData(null);
      setLoading(false);
      return;
    }
    versionRef.current += 1;
    const myVersion = versionRef.current;
    setLoading(true);
    setError(null);
    void fetchSnapshot(videoId, myVersion);

    const channel: RealtimeChannel = supabase
      .channel(`video_progress:${videoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_videos", filter: `id=eq.${videoId}` },
        () => scheduleRefresh(videoId),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_chunks", filter: `video_id=eq.${videoId}` },
        () => scheduleRefresh(videoId),
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [supabase, videoId, fetchSnapshot, scheduleRefresh]);

  return useMemo(
    () => ({ data, loading, error, rpcMissing, refresh }),
    [data, loading, error, rpcMissing, refresh],
  );
}
