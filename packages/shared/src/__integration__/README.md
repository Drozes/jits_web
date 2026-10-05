# Local-stack integration suites

`*.int.test.ts` files here run against a LOCAL Supabase with jr_be
`origin/development` migrations applied. They are never part of `npm test`
(excluded in `vitest.config.ts`) and skip themselves when the env below is
missing. They refuse any non-localhost URL, so they cannot touch prod.

## video-wave2.int.test.ts (OTA wave 2, jits-n2im.11/.12/.14, review B1/M1)

Two supabase-js clients sign in as two athletes (created through the local
admin API) and drive the shared data layer: reserve, heartbeat, land,
abandon, preflight, recording intent, and the realtime filter that
`useMatchVideosRealtime` uses. Storage, the landing trigger, RLS, realtime
and pg_net are real. A tiny HTTP server in the test stands in for the slicer
(the suite points the Vault secret `app.settings.video_slicer_url` at it via
`host.docker.internal`) and counts dispatches per video.

Not exercised: the React Native runtime and the upload manager itself (bytes
go up with a plain Storage upload, not tus); those are covered by the jest
suites in `apps/mobile`.

### Run

Start an isolated stack from a jr_be worktree at `origin/development`, with
its own `project_id` and ports so it never collides with another stack, for
example `project_id = "jr_be_w2it"` and ports 594xx in `supabase/config.toml`
(a local edit, not committed), then:

```bash
supabase start -x studio,imgproxy,inbucket,vector,logflare,edge-runtime,supavisor,postgres-meta
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
cd jits_web/packages/shared
VIDEO_IT_SUPABASE_URL="$API_URL" VIDEO_IT_ANON_KEY="$ANON_KEY" \
VIDEO_IT_SERVICE_KEY="$SERVICE_ROLE_KEY" VIDEO_IT_DB_CONTAINER=supabase_db_jr_be_w2it \
npm run test:integration
```

The suite seeds through `docker exec <db container> psql` (gyms, challenges,
matches, participants, the allowlist, `video_upload_enabled`, Vault secrets)
and leaves its athletes and matches behind (unique per run).
