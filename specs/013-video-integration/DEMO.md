# 013 Video Integration — Demo Runbook

> **Goal:** run the web app + mobile app locally against the local
> Supabase instance in `jr_be` and execute a full
> **upload → slice → analyze → merge → view** cycle end-to-end.
>
> **Scope:** what's in v1: storage upload, `match_videos` INSERT with
> `status='ready'`, slicer trigger via pg_net, chunked Gemini analysis,
> merger, and the React `VideoAnalysisViewer`. Out of scope: production
> deployment, push notifications, multi-angle UX.

---

## §0 Prerequisites

| Tool                          | Version                  | Notes                                                                |
| ----------------------------- | ------------------------ | -------------------------------------------------------------------- |
| Node.js                       | 20.x or 22.x             | Mobile uses Expo 54.                                                 |
| pnpm or npm (workspaces)      | npm 10+                  | `package.json` declares `workspaces`.                                |
| Supabase CLI                  | 2.72+                    | `brew install supabase/tap/supabase`                                 |
| Docker                        | running                  | Required by `supabase start`.                                        |
| ffmpeg                        | 4.4+                     | Used by the slicer worker (when run locally).                        |
| Google Cloud SDK (optional)   | for Cloud Run slicer     | Local fallback: skip the slicer; `cron_request_pending_video_slices` will re-poke. |
| Gemini API key                | live                     | Set as `GEMINI_API_KEY` in `jr_be/supabase/.env` (edge functions read this name).       |

You also need a working browser logged into Supabase Studio
(http://127.0.0.1:54323) to peek at rows during the demo.

---

## §1 Start the backend (jr_be)

```bash
cd /Users/msponagle/code/EloRated/jr_be
supabase start
# wait until you see "supabase local development setup is running"
```

This brings up:

- Postgres 15 at `127.0.0.1:54322`
- PostgREST at `127.0.0.1:54321/rest/v1`
- Realtime at `127.0.0.1:54321/realtime/v1`
- Storage at `127.0.0.1:54321/storage/v1` (bucket `match-videos`, 500 MiB cap locally)
- Edge Functions at `127.0.0.1:54321/functions/v1`
- Studio at `127.0.0.1:54323`

Verify the chunked-video schema is current:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "\dt public.video_chunks public.video_chunk_analyses public.match_videos"
```

You should see all three tables. If `video_chunks` is missing, run
`supabase db reset` to replay all 37 migrations.

### 1.1 Wire the Edge Functions

The chunk-analyze function needs the Gemini key. Edit `jr_be/supabase/.env`
and ensure `GEMINI_API_KEY=<your-key>` is set (this is the env var the
edge functions actually read — `Deno.env.get("GEMINI_API_KEY")` at
`video-analyze-chunk/index.ts:121` and `video-merge-analysis/index.ts:107`).
Then from `jr_be/`:

```bash
supabase functions serve --no-verify-jwt --env-file ./supabase/.env \
  video-analyze-chunk video-merge-analysis
```

`Deno.cron(...)` is a no-op locally (see BE contract §4). The pg_cron
sweeps (`finalize-pending-merges`, `request-pending-video-slices`,
`reap-stuck-analyzing-chunks`) run regardless.

### 1.2 Wire the slicer

The slicer worker lives in a separate Cloud Run service. For a local
demo, the simplest path is to set the slicer URL to a placeholder so the
DB trigger no-ops and rely on **manual `persist_video_chunks_and_finalize_slice` calls**
or a local slicer build. To skip the slicer entirely for a smoke test,
upload a video already pre-chunked.

If you have a local slicer running on port `8080`:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "ALTER SYSTEM SET app.settings.video_slicer_url = 'http://host.docker.internal:8080/slice';"
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "SELECT pg_reload_conf();"
```

---

## §2 Start the web app

```bash
cd /Users/msponagle/code/EloRated/jits_web
npm install      # one-time
npm run dev:web  # → http://127.0.0.1:4983
```

`.env.local` should have:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `supabase status` output>
```

Log in (or sign up) with a test account, then run through the profile
setup wizard so an `athletes` row is created and activated.

---

## §3 Start the mobile app (optional for the demo)

```bash
cd /Users/msponagle/code/EloRated/jits_web/apps/mobile
npm run ios    # or `npm run android`
```

`app.json` already points at `http://127.0.0.1:54321`. If you're running
on a real device, swap to the LAN IP of the dev machine.

---

## §4 Run the demo path

### 4.1 Set up a match

The video flow lives inside the **session → match → live** step. You
need:

1. Two active athletes (you + one other test account).
2. A session at a gym you both belong to.
3. A match between you, status `in_progress`.

The fastest path: have your test account create a session, have the
other account join, then create a match. (For a single-user fast path,
use Studio to flip both `auth.users` and `athletes` rows manually and
issue a `start_match_from_challenge` RPC.)

### 4.2 Record + upload

- Web: navigate to the match's **timekeeper-live** step (URL pattern
  `/session/[id]/match/[matchId]`). Recording auto-starts on entry.
  Press **End Match** to stop; the WebM blob uploads to
  `match-videos/<match_id>/<your_athlete_id>/<unix_ts>.webm`.
- Mobile: same flow via the in-app match wizard. MP4 output.

You'll see the `match_videos` row appear in Studio at `status='ready'`
within a few seconds. The slicer trigger fires immediately (or the
1-min pg_cron sweep does, if the slicer URL isn't set).

### 4.3 Watch the chunked pipeline

The viewer is mounted automatically on the **Match Recorded** step
(`apps/web/.../steps/match-recorded-step.tsx`) when a `videoId` is
threaded through from the timekeeper-live upload. The wizard
(`match-flow-wizard.tsx`) captures the id from `TimekeeperLiveStep.onNext`
and passes it down.

To embed the viewer on any other page that knows the `video_id`:

```tsx
import { VideoAnalysisViewer } from "@/components/domain/video-analysis-viewer";

<VideoAnalysisViewer videoId={videoId} title="Match analysis" />;
```

Behavior:

1. While `status ∈ {ready, slicing}` — placeholder "waiting for slicer…" bar.
2. When the slicer reports `chunk_count` — the strip lights up with one
   segment per chunk, gray (`ready`) initially.
3. As chunks flow through `analyzing → completed`, the segments turn
   amber (pulsing) then emerald.
4. Failed chunks turn red; the latest scrubbed error message shows
   below the strip (sourced from `get_video_progress.latest_error_message`,
   which until BE Round 3 ships falls back to a manual aggregate
   computed in the hook).
5. When the final chunk lands, the merger fires (`status='merging'`);
   ~30 s later `status='analyzed'` and the **Summary / Timeline /
   Techniques / Tips** tabs render via `get_video_analysis(videoId)`.

### 4.4 Sanity checks (Studio queries)

```sql
-- Parent row + chunk count
SELECT id, status, chunk_count, chunks_completed,
       slice_started_at, slice_completed_at,
       merge_started_at, merge_completed_at
  FROM match_videos
 ORDER BY created_at DESC LIMIT 5;

-- Per-chunk status
SELECT idx, status, start_s, end_s, chunks_completed_at,
       LEFT(COALESCE(error_message, ''), 80) AS err
  FROM video_chunks
 WHERE video_id = '<your-video-id>'
 ORDER BY idx;

-- Merged analysis (only when status='analyzed')
SELECT merge_strategy, source_chunk_count, dedup_dropped_count,
       LEFT(summary, 200) AS summary_preview
  FROM video_analyses
 WHERE video_id = '<your-video-id>' AND status = 'completed';
```

---

## §5 Known caveats

- **`get_video_progress` RPC isn't deployed locally yet.** The hook
  detects the 42883/404 from PostgREST and falls back to a manual
  aggregate over `match_videos` + `video_chunks` + `video_chunk_analyses`.
  The fallback is RLS-gated and produces the same shape as the RPC.
  This is the **Round 3 deliverable** per the BE contract §3.4.
- **Local storage is capped at 500 MiB.** Uploads larger than that
  return HTTP 413 and the FE renders the "local development cap" copy.
  Production cap is 2 GiB; the FE pre-flights at the 2 GiB boundary.
- **Slicer cron sweep runs every 5 min.** If you don't have a slicer
  worker reachable from Postgres, expect a 1-5 minute delay before the
  trigger retry fires. Faster: invoke `request_video_slice(video_id)`
  manually via `psql`.
- **`Deno.cron` is a no-op in `supabase functions serve`.** The merger
  + chunk-reaper rely on the pg_cron sweeps locally.
- **One video per (match_id, uploaded_by).** Retrying after a failure
  hits `23505`; the FE catches this and UPDATEs the existing row back
  to `'ready'` via `upsertMatchVideo`. To force a re-slice with a brand
  new file, DELETE the row first.

---

## §6 Where the new code lives

| Concern                                      | File                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Storage path helper + `createMatchVideo` + `upsertMatchVideo` | `packages/shared/src/api/mutations.ts`                                                |
| Realtime progress hook                       | `packages/shared/src/hooks/use-video-progress.ts`                                     |
| Generated DB types (chunks + new columns)    | `packages/shared/src/types/database.ts`                                               |
| Web recorder (path fix + INSERT wiring)      | `apps/web/hooks/use-video-recorder.ts`                                                |
| Mobile upload helper (path fix + INSERT)     | `apps/mobile/lib/video/upload-recording.ts`                                           |
| Mobile recorder (uploaderAthleteId plumbing) | `apps/mobile/lib/video/use-video-recorder.ts`                                         |
| Web `VideoAnalysisViewer` component          | `apps/web/components/domain/video-analysis-viewer.tsx`                                |
| Backend contract (source of truth)           | `jr_be/specs/013-chunked-video-pipeline/INTEGRATION.md`                               |
| Reference vanilla-JS viewer                  | `jr_be/scripts/test-video/viewer/app.js`                                              |

---

## §7 Smoke test checklist

Tick these off in order; if any step fails, fix before moving on.

- [ ] `supabase start` succeeds; Studio loads.
- [ ] `\dt public.video_chunks` returns one row.
- [ ] `npm run dev:web` boots without TS errors related to video code.
- [ ] You can log in, run profile setup, and reach a match's live step.
- [ ] Pressing **End Match** uploads a blob and INSERTs a `match_videos`
      row at `status='ready'` (visible in Studio).
- [ ] The viewer renders the chunk strip with `chunk_count` segments.
- [ ] Chunks turn green one-by-one.
- [ ] `status='analyzed'` flips and the merged analysis tabs render.
- [ ] Refreshing the page rebuilds state from `get_video_analysis`.
- [ ] Re-uploading the same match (after the first finishes) UPDATEs
      the existing row instead of throwing `23505`.

When all boxes are ticked, the demo is reproducible and the team is
clear to record a screencast.
