# 013 Video Integration — Demo Runbook

> Sequential runbook for taking the repo cold and reaching the green light:
> full **record → upload → slice → analyze → merge → view** loop in the web
> app, against a local Supabase backend.

---

## §0 Goal

By the end of this runbook you will have:

- Two demo athletes signed in (web + a second browser, or web + mobile).
- A live session, a challenge, an accepted match.
- A short recording (5-15 s) uploaded to local Storage.
- Chunks analyzed one-by-one (gray → amber-pulse → green strip).
- `match_videos.status='analyzed'` and the **Summary / Timeline / Techniques / Tips**
  tabs rendering in the web viewer.

That is the green light.

---

## §1 Prereqs

| Tool             | Version            | Notes                                                                   |
| ---------------- | ------------------ | ----------------------------------------------------------------------- |
| Docker           | running            | Required by `supabase start`.                                           |
| Supabase CLI     | 2.72+              | `brew install supabase/tap/supabase`                                    |
| ffmpeg           | 4.4+               | Used by the manual slicer in §7.                                        |
| Node.js          | 20.x or 22.x       | Mobile uses Expo 54.                                                    |
| `GEMINI_API_KEY` | live key           | Set in `jr_be/supabase/.env`. Edge functions read **`GEMINI_API_KEY`**, not `GOOGLE_GENERATIVE_AI_API_KEY`. |
| Browsers         | 2 sessions         | Two browser profiles, or one browser + iOS simulator/device.            |

Optional: Supabase Studio open at http://127.0.0.1:54323 to peek at rows
during the demo.

---

## §2 Start the backend (jr_be)

### 2.1 Start Supabase

```bash
cd /Users/msponagle/code/EloRated/jr_be
supabase start
# wait until you see "supabase local development setup is running"
```

This brings up Postgres (`127.0.0.1:54322`), PostgREST/Realtime/Storage
(`127.0.0.1:54321`), Edge Functions, and Studio (`127.0.0.1:54323`).

### 2.2 Verify the chunked-video schema is current

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "\dt public.video_chunks public.video_chunk_analyses public.match_videos"
```

All three tables must be present. If `video_chunks` is missing, run
`supabase db reset` to replay all migrations.

### 2.3 Seed two demo athletes + a session

```bash
cd /Users/msponagle/code/EloRated/jr_be
./scripts/seed-demo.sh
```

The script prints two athlete credentials and the seeded `sessions.id`:

```
demo-blue@elorated.dev   Demo!Pass123
demo-red@elorated.dev    Demo!Pass123
session_id: <uuid>
```

Both athletes share a gym and the session is `status='open'`.

### 2.4 Serve the edge functions

```bash
cd /Users/msponagle/code/EloRated/jr_be
supabase functions serve --no-verify-jwt --env-file ./supabase/.env \
  video-analyze-chunk video-merge-analysis
```

The functions read `Deno.env.get("GEMINI_API_KEY")` from
`./supabase/.env`. `Deno.cron(...)` is a no-op locally; the pg_cron sweeps
(`finalize-pending-merges`, `request-pending-video-slices`,
`reap-stuck-analyzing-chunks`) run regardless.

---

## §3 Start the web app

### 3.1 Install (first time only)

```bash
cd /Users/msponagle/code/EloRated/jits_web
npm install
```

### 3.2 Configure `apps/web/.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<copy from `supabase status` output>
```

### 3.3 Run dev server

```bash
cd /Users/msponagle/code/EloRated/jits_web
npm run dev:web
# → http://localhost:4983
```

### 3.4 Note: dev mode only

`npm run dev:web` bypasses a pre-existing `createSessionTemplate`
typecheck error. **`npm run build:web` does NOT work yet** — out of
scope for this demo.

---

## §4 Sign in (two sessions)

Open two browser sessions/profiles (or one web + one mobile via Expo Go
pointing at `127.0.0.1:54321`).

- **Session A:** `demo-blue@elorated.dev` / `Demo!Pass123`
- **Session B:** `demo-red@elorated.dev` / `Demo!Pass123`

If either is prompted with profile setup, finish it. This flips the
athlete `status` from `pending` → `active` (required for lobby
visibility).

---

## §5 Join the session lobby

Both athletes navigate to the seeded session (from §2.3). Confirm both
appear in the lobby roster before continuing.

---

## §6 Send a challenge → accept → record

1. **Blue** clicks **Red**'s tile, sends a challenge.
2. **Red** sees the incoming-challenge sheet → **Accept**.
3. Both route into the match flow.
   - **Red** (the accepter) sees the **timekeeper-live** step with the recorder.
   - **Blue** sees **fighter-live** (read-only timer, no recorder).
4. **Red** presses **Start**, records ~5-15 s, presses **End**.
5. The wizard waits for the upload to complete (status pill shows
   "Uploading…"), then advances to **Match Recorded**.

A `match_videos` row appears in Studio at `status='ready'` within a few
seconds.

---

## §7 Drive the slicer manually

The Cloud Run slicer doesn't run locally. Slice the uploaded video by
hand from `jr_be`.

```bash
cd /Users/msponagle/code/EloRated/jr_be

# Find the new match_videos.id and storage_path:
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "SELECT id, storage_path, status FROM match_videos ORDER BY created_at DESC LIMIT 3;"

# Slice it (90s segments, 5s overlap):
./scripts/test-video/manual-slice.sh .tmp/julia_1_compressed.mp4 <video_id> 90 5
```

For demo speed prefer the smaller `slim_compressed.mp4` if it's in
`.tmp/`. (You're not actually slicing the recorded WebM here — the
manual slicer feeds canned chunks into the chunk-analyze pipeline so
the FE can render real progress against a known-good source.)

---

## §8 Watch the analysis happen

Back in the web app at the **Match Recorded** step, the chunk strip should:

1. Start gray (`queued`).
2. Transition to amber-pulse (`analyzing`) one chunk at a time.
3. Turn green (`completed`). The **Timeline** and **Techniques** tabs start
   showing entries as each chunk lands.
4. Once all chunks complete, the merger fires; `status` flips to
   `'analyzed'`; the viewer renders the unified **Summary / Timeline /
   Techniques / Tips** tabs via `get_video_analysis(videoId)`.

That's the green light.

---

## §9 Smoke checks (sanity)

```bash
# Progress aggregate (BE Round 3 RPC; falls back to manual aggregate in the hook if missing):
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "SELECT public.get_video_progress('<video_id>');"

# Per-chunk status:
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "SELECT idx, status, start_s, end_s, LEFT(COALESCE(error_message,''),80) AS err
        FROM video_chunks WHERE video_id='<video_id>' ORDER BY idx;"
```

Realtime: open Studio → **Realtime** and confirm the
`match_videos:id=eq.<videoId>` and `video_chunks:video_id=eq.<videoId>`
subscriptions are open while the viewer is mounted.

---

## §10 Known caveats (YELLOW — don't block GREEN)

- **No Cloud Run slicer locally** — use the §7 manual workaround.
- **Push delivery doesn't work locally** — VAPID/Expo creds unset; non-blocking.
- **Chat throttle (010 T021) is broken in production** — not exercised by this demo.
- **Mobile viewer is a stub for v1** — web-only viewer for the demo.
- **Referee role** exists in schema, no UI/RPC. Out of scope.
- **Local Storage cap is 500 MiB** — record shorter clips. Production cap is 2 GiB.
- **One video per (match_id, uploaded_by).** Retries `UPDATE` via `upsertMatchVideo`.
- **`npm run build:web` is broken** (`createSessionTemplate` typecheck) — dev only.

---

## §11 Troubleshooting

| Symptom                                       | Likely cause                                                        | Fix                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recorder doesn't appear after accepting       | `match_participants.timekeeper_id` not equal to accepter's athlete id | Check the match row in Studio; the accepter must be the timekeeper.                                                                                |
| "Uploading…" stuck                            | Edge functions not served, or `GEMINI_API_KEY` missing              | Confirm §2.4 is running; re-check `jr_be/supabase/.env`. Note the var is `GEMINI_API_KEY`, **not** `GOOGLE_GENERATIVE_AI_API_KEY`.                  |
| Chunks stay gray indefinitely                 | `manual-slice.sh` wasn't run                                        | Run §7 with the new `video_id`.                                                                                                                    |
| 413 on upload                                 | File > 500 MiB local cap                                            | Record a shorter clip.                                                                                                                             |
| Empty lobby                                   | Athletes are `status='pending'`                                     | Finish profile setup, or `psql -c "UPDATE athletes SET status='active' WHERE id='<id>';"`.                                                          |
| Viewer says "waiting for slicer…" forever     | `chunk_count` is `NULL` on `match_videos`                            | The slicer never wrote chunks. Re-run §7 and check `SELECT count(*) FROM video_chunks WHERE video_id='<id>';`.                                     |
| `23505` on re-upload                          | Unique `(match_id, uploaded_by)` constraint                          | Expected — the FE catches this and UPDATEs via `upsertMatchVideo`. If forcing a fresh slice, DELETE the `match_videos` row in Studio first.        |
| `42883`/`404` from `get_video_progress`        | RPC not deployed locally (BE Round 3)                                | Hook falls back to a manual aggregate; nothing to do. Re-pull jr_be migrations if you need the RPC itself.                                         |

---

## §12 Where the new code lives (reference)

| Concern                                                       | File                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Storage path helper + `createMatchVideo` + `upsertMatchVideo` | `packages/shared/src/api/mutations.ts`                                |
| Realtime progress hook                                        | `packages/shared/src/hooks/use-video-progress.ts`                     |
| Generated DB types                                            | `packages/shared/src/types/database.ts`                               |
| Web recorder (path fix + INSERT wiring)                       | `apps/web/hooks/use-video-recorder.ts`                                |
| Mobile upload helper                                          | `apps/mobile/lib/video/upload-recording.ts`                           |
| Web `VideoAnalysisViewer`                                     | `apps/web/components/domain/video-analysis-viewer.tsx`                |
| Feature flags (`timekeeperEnabled`)                           | `apps/web/lib/feature-flags.ts`                                       |
| Backend contract (source of truth)                            | `jr_be/specs/013-chunked-video-pipeline/INTEGRATION.md`               |
| Reference vanilla-JS viewer                                   | `jr_be/scripts/test-video/viewer/app.js`                              |
