# 013 Video Integration — Frontend Checklist

> **Backend contract lives in
> [`jr_be/specs/013-chunked-video-pipeline/INTEGRATION.md`](../../../jr_be/specs/013-chunked-video-pipeline/INTEGRATION.md).**
> This document tracks FE-side deltas to align.

---

## §1 Pointer

The backend (jr_be) has shipped the full chunked-video pipeline: storage
bucket, slicer worker, chunk-analyze + merge-analysis Edge Functions,
RLS-gated chunk tables, and the realtime publication wiring. **Read the BE
contract first.** It is the authoritative source for column lists, status
state machine, RLS policy names, edge function visibility, realtime filters,
and storage path conventions. This FE doc only enumerates the deltas FE needs
to land to wire the demo end-to-end.

The six clarifications FE raised in Round 1 are resolved in §8 of the BE
contract. Highlights that affect FE code directly:

- **`uploaded_by` MUST be set explicitly** to the current athlete's
  `athletes.id`. The DB does not auto-fill it. Use the cached
  `getCurrentAthlete()` result.
- **One video per (match_id, uploaded_by)** — there is a unique constraint.
  Retries must `UPDATE` (preferred) or `DELETE`+`INSERT` the existing row.
- **No `error_message` column on `match_videos`.** Surface errors via the
  new `get_video_progress.latest_error_message` aggregate.
- **2 GiB client-side limit; local Storage caps at 500 MiB and returns 413.**
  Handle the local rejection with a clear "local dev limit" message.
- **All chunk error_message fields ship through realtime.** They are
  pre-scrubbed by the BE writers; safe to render to participants.

---

## §2 FE deltas (file-by-file checklist)

> Paths are repo-relative to `jits_web/`. Line numbers reflect the FE tree
> at the time this doc was written; treat them as anchors, not exact edits.

- [ ] **Regenerate `database.ts`.**
  ```bash
  cd jits_web
  supabase gen types typescript --linked > packages/shared/src/types/database.ts
  ```
  Run against the **linked** remote project (so the new `chunk_count`,
  `chunks_completed`, `requested_tier`, `slice_*_at`, `merge_*_at`,
  `merge_strategy`, `source_chunk_count`, `dedup_dropped_count` columns and
  the `video_chunks` / `video_chunk_analyses` tables land in the type tree).
  Regenerate again after BE Round 3 ships `get_video_progress`.

- [ ] **Fix upload path in `apps/web/hooks/use-video-recorder.ts:28`.**
  Replace the current `matches/${matchId}/${Date.now()}.webm` path with the
  canonical convention:
  ```ts
  const path =
    `${matchId}/${currentAthleteId}/${Date.now()}.webm`;
  // bucket is "match-videos" — supabase.storage.from("match-videos").upload(path, blob)
  ```
  Note: the storage_path stored in `match_videos.storage_path` is the
  full key (no bucket prefix). The slicer worker parses
  `<match_id>/<uploader>/<ts>.<ext>` and derives the chunks subdir from it.

- [ ] **Fix upload path in `apps/mobile/lib/video/upload-recording.ts:17`.**
  Update `buildVideoPath`:
  ```ts
  export function buildVideoPath(
    matchId: string,
    uploaderAthleteId: string,
    ext = "mp4",
  ): string {
    return `${matchId}/${uploaderAthleteId}/${Date.now()}.${ext}`;
  }
  ```
  Update every call site in `apps/mobile/lib/video/` to pass
  `uploaderAthleteId` (resolved from AuthProvider).

- [ ] **Add an `INSERT match_videos` helper in
      `packages/shared/src/api/mutations.ts`.**
  After the storage PUT succeeds, FE must INSERT the parent row so the
  slicer trigger fires. Helper signature:
  ```ts
  export async function createMatchVideo(
    supabase: Client,
    params: {
      matchId: string;
      uploaderAthleteId: string;
      storagePath: string;
      durationSeconds?: number;
      fileSizeBytes?: number;
      cameraAngle?: string;
      athleteLeftId?: string;
      requestedTier?: 'standard' | 'premium';   // default 'standard'
    },
  ): Promise<{ id: string }>;
  ```
  Body: `supabase.from('match_videos').insert({ …, status: 'ready' })`.
  Required INSERT fields per the BE contract §2.1 + §8.1: `match_id`,
  `uploaded_by`, `storage_path`, `status='ready'`. Everything else is
  optional. Also export `upsertMatchVideo` that catches `23505` and falls
  back to `UPDATE` (per BE contract §8.6).

- [ ] **Resolve `uploaded_by` via the cached current athlete id.**
  Both web (`useCurrentAthlete()` or whatever the AuthProvider exposes) and
  mobile (`AuthProvider.athlete.id`) already load this on session boot
  via `getCurrentAthlete()` (`packages/shared/src/api/queries.ts:82`). Pass
  that id into the `createMatchVideo` helper as `uploaderAthleteId`. **Do
  not** call `supabase.rpc('auth_athlete_id')` per upload — it adds a
  round-trip for no benefit. Only use the RPC as a fallback in
  pre-AuthProvider code paths (deep links, etc.).

- [ ] **Add `useVideoProgress(videoId)` hook in
      `packages/shared/src/hooks/use-video-progress.ts`.**
  Reads via `supabase.rpc('get_video_progress', { p_video_id: videoId })`
  on mount and on every realtime event from §5 of the BE contract. Returns
  the `VideoProgress` shape documented at BE §3.4. Memoize on `videoId`.
  Note: until BE Round 3 ships, this RPC returns 42883 (function does not
  exist). Gate the hook behind a feature flag or stub the response shape
  until the migration lands.

- [ ] **Subscribe to `match_videos` + `video_chunks` realtime inside
      `useVideoProgress`.**
  Three channels per BE §5:
    - `match_videos:id=eq.<videoId>`
    - `video_chunks:video_id=eq.<videoId>`
    - `video_chunk_analyses:chunk_id=in.(<list>)` — derive the list from
      the latest `chunks` array returned by `get_video_progress`; resubscribe
      when new chunks appear.
  On every event, re-run `get_video_progress` (debounced ≈200 ms) to refresh
  aggregates. The chunk-analysis channel is optional for v1 if the
  per-chunk `has_analysis` flag in `get_video_progress.chunks` is enough.

- [ ] **Build `VideoAnalysisViewer` component in
      `packages/shared/src/components/video-analysis-viewer/`.**
  Port from `jr_be/scripts/test-video/viewer/` (vanilla JS reference impl).
  Component receives `{ videoId: string }` and:
    - Streams the source video via a signed URL from `match-videos/<…>`.
    - Renders the position timeline, scoring moments, technique tags,
      and recommendations from `get_video_analysis(videoId)`.
    - Subscribes via `useVideoProgress(videoId)` to show
      live progress while `status` is not yet `'analyzed'`.

- [ ] **Show progressive per-chunk results during analysis.**
  While `status ∈ {slicing, analyzing, merging}`:
    - Render a chunk strip (e.g., 8 segments for a 12-min video). Color each
      segment by `chunks[i].status`:
        * `queued` / `uploading` / `ready` → gray
        * `analyzing` → pulsing accent color
        * `completed` → green
        * `failed` → red, click to surface `latest_error_message`
    - For each `completed` chunk where `has_analysis = true`, fetch
      `video_chunk_analyses` row by `chunk_id` (RLS-gated) and render its
      `summary` / `positions` / `scoring_moments` inline. This is the
      "progressive UX" the BE contract enables; do not wait for the merge to
      render insights.
    - When `status` transitions to `'analyzed'`, swap the per-chunk view
      for the merged `get_video_analysis(videoId)` payload.

- [ ] **Show 2 GiB size limit + handle local 500 MiB rejection gracefully.**
  - Pre-flight check before the storage PUT: if `file.size >
    2 * 1024 * 1024 * 1024`, reject in the UI with
    `"Videos must be under 2 GB."`.
  - After the storage PUT: if the SDK returns a `413 Payload too large`
    AND the Supabase URL is a `localhost`/`127.0.0.1` origin, render
    `"Local development cap is 500 MiB — production cap is 2 GiB. Use a
    shorter clip while testing."`.
  - In all other 4xx/5xx storage errors, surface the SDK error message as-is.

- [ ] **Set `'self'` / `'timekeeper'` correctly.**
  When the recording flow is the participant's own device, set
  `recording_type='self'` and `recorded_by=uploaded_by`. When a third party
  (gym timekeeper) records, set `recording_type='timekeeper'` and
  `recorded_by=<that-athlete-id>`. Both fields are FE-optional but improve
  audit trails.

---

## §3 Acceptance criteria (UX-level)

The end-to-end demo should show:

- A logged-in athlete records or selects a video for a match they're a
  participant in.
- The Storage PUT succeeds and the `match_videos` row appears with
  `status='ready'` (visible in Studio).
- Within ≤ 60 s the DB trigger fires the slicer; `chunk_count` populates and
  `status` transitions to `'slicing'` → `'analyzing'`.
- The chunk strip renders live: chunks pulse `analyzing` → flip green
  one-by-one as Gemini completes them.
- For each completed chunk, the FE shows a summary card with the chunk's
  position timeline and any scoring moments — *before* the merge runs.
- When the final chunk lands, `status='merging'` then `'analyzed'`. The
  merged `video_analyses` row + `technique_tags` render via
  `get_video_analysis`.
- If any chunk fails, the strip shows red on that segment and the merged
  view surfaces `latest_error_message`. The video still completes once
  retries land (or the reaper marks it failed after 10 min).
- Re-upload after a failure: existing row updates in place; the slicer
  re-fires; old chunks are dropped or replaced (BE-owned behavior).
- 2 GiB+ files are rejected client-side; local 500 MiB+ files surface the
  local-dev caveat copy.

---

## §4 Test plan

### Manual smoke (per environment)

- [ ] Web: record 30 s clip → upload → row appears in `match_videos` →
      chunks fan out → analysis appears.
- [ ] Web: try a 10 min recording (~80 MB) → at least 6 chunks → progressive
      cards stream in.
- [ ] Mobile (iOS): record clip → upload via streaming path → same flow.
- [ ] Mobile (Android): same as iOS.
- [ ] Retry: simulate a slicer failure (set
      `app.settings.video_slicer_url = ''` locally) → row sits in `ready` →
      cron sweep picks it up after 1 min → analysis proceeds.
- [ ] Failure surfacing: kill a chunk mid-analyze → `failed` chunk shows in
      strip, `latest_error_message` renders.
- [ ] Privacy: log in as a non-participant → 403 on the realtime channel
      (no events received) and 0 rows from `get_match_videos`.
- [ ] Size limit: try a 600 MiB file locally → 413 → "local dev cap" copy.
- [ ] Size limit: try a 2.5 GiB file → client-side reject, no upload attempt.

### Automated tests to add

- [ ] Unit test for `createMatchVideo` / `upsertMatchVideo` mutations
      (mocked supabase client, verify the INSERT/UPDATE payload shape and
      the 23505 → UPDATE fallback path).
- [ ] Unit test for `useVideoProgress` hook (mocked realtime channels +
      RPC, verify aggregate recomputation on events).
- [ ] Playwright happy-path: record → upload → render analyzed view
      (mock the slicer + Gemini with deterministic fixtures).
- [ ] Playwright failure-path: simulate a chunk failure event → strip
      shows red.

---

## §5 Out of scope for v1 demo

| Item                                       | Why deferred                                                          |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `start_video_upload` server-side helper    | BE P1. Until shipped, FE composes paths client-side per BE §1.2.      |
| `storage_path` DB CHECK                    | BE P2. FE convention is the contract for now.                          |
| Tier toggle UI (`standard` vs `premium`)   | Product decision; v1 defaults `'standard'`.                            |
| Multi-angle sync (`primary_video_id`)      | Schema in place; UX is feature-011 follow-on.                          |
| Production bucket limit set to 2 GiB       | Manual ops step on the linked project; not codified.                   |
| Real-time editing of technique tags        | feature-011 continuation; v1 view is read-only.                        |
| Scouting report UI fed by `get_scouting_*` | Out of scope for the chunked-video demo specifically.                  |
| HLS / adaptive bitrate playback            | Phase 2+ (`platform = 'mux' | 'cloudflare'`); v1 uses signed URLs.    |
