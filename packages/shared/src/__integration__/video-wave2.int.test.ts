/**
 * OTA wave 2 end-to-end checks against a LOCAL Supabase stack running jr_be
 * `origin/development` migrations (wave A, `20261005100000`..`100700`).
 * Two real supabase-js clients sign in as two athletes; storage, triggers,
 * RLS, realtime and pg_net are the real ones. Never prod: the suite refuses
 * any URL that is not localhost.
 *
 * Run (see packages/shared/src/__integration__/README.md):
 *   VIDEO_IT_SUPABASE_URL=http://127.0.0.1:59421 \
 *   VIDEO_IT_ANON_KEY=... VIDEO_IT_SERVICE_KEY=... \
 *   VIDEO_IT_DB_CONTAINER=supabase_db_jr_be_w2it \
 *   npm run test:integration -w @jits/shared
 *
 * What this exercises is the shared data layer the mobile upload manager
 * calls (reserve / touch / land / abandon / preflight / intent and the
 * realtime filter the `useMatchVideosRealtime` hook uses), not the React
 * Native runtime: bytes go up with a plain Storage upload, not tus.
 */
import { execFileSync } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../types/database";
import { buildMatchVideoStoragePath, upsertMatchVideo } from "../api/mutations";
import {
  abandonMatchVideoUpload,
  canUploadMatchVideo,
  finalizeMatchVideoUpload,
  reserveMatchVideoUpload,
  setMatchRecordingIntent,
  touchMatchVideoUpload,
} from "../api/match-video-upload";
import { getMatchDetailView } from "../api/queries";

const URL_ = process.env.VIDEO_IT_SUPABASE_URL ?? "";
const ANON = process.env.VIDEO_IT_ANON_KEY ?? "";
const SERVICE = process.env.VIDEO_IT_SERVICE_KEY ?? "";
const DB = process.env.VIDEO_IT_DB_CONTAINER ?? "";
const ENABLED = Boolean(URL_ && ANON && SERVICE && DB);

if (ENABLED && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_)) {
  throw new Error(`video-wave2 integration refuses a non-local Supabase URL: ${URL_}`);
}

type Client = SupabaseClient<Database>;
const BUCKET = "match-videos";
const BYTES = new Uint8Array(2048).fill(7);

function sql(query: string): string {
  return execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], {
    input: query,
    encoding: "utf8",
  }).trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(fn: () => Promise<T | null | undefined | false>, ms: number, every = 100): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await sleep(every);
  }
  return null;
}

/** A local stand-in for the slicer: counts POST /slice per video id. */
function startSlicer(): Promise<{ port: number; hits: Map<string, number>; close: () => void }> {
  const hits = new Map<string, number>();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const id = (JSON.parse(body) as { video_id?: string }).video_id;
        if (id) hits.set(id, (hits.get(id) ?? 0) + 1);
      } catch {
        /* not ours */
      }
      res.writeHead(202).end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "0.0.0.0", () => {
      resolve({ port: (server.address() as AddressInfo).port, hits, close: () => server.close() });
    });
  });
}

interface Athlete {
  client: Client;
  athleteId: string;
  email: string;
}

const RUN = `w2it${Date.now().toString(36)}`;

async function makeAthlete(admin: Client, key: string): Promise<Athlete> {
  const email = `${RUN}-${key}@test.local`;
  const password = "Wave2-integration-pw!";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `${key.toUpperCase()} ${RUN}` } });
  if (created.error) throw created.error;
  const authId = created.data.user!.id;
  const athleteId = sql(`
    UPDATE athletes SET current_weight = 180, primary_gym_id = (SELECT id FROM gyms LIMIT 1) WHERE auth_user_id = '${authId}';
    INSERT INTO video_upload_allowlist (athlete_id) SELECT id FROM athletes WHERE auth_user_id = '${authId}' ON CONFLICT DO NOTHING;
    SELECT id FROM athletes WHERE auth_user_id = '${authId}';`)
    .split("\n")
    .pop()!;
  const client = createClient<Database>(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { client, athleteId, email };
}

/** A fresh match between a and b, in_progress (so intents are accepted). */
function makeMatch(a: Athlete, b: Athlete): string {
  return sql(`
    WITH ch AS (
      INSERT INTO challenges (challenger_id, opponent_id, proposed_gym_id, match_type, status, challenger_weight, opponent_weight)
      VALUES ('${a.athleteId}', '${b.athleteId}', (SELECT id FROM gyms LIMIT 1), 'ranked', 'accepted', 180, 180) RETURNING id
    ), m AS (
      INSERT INTO matches (challenge_id, gym_id, initiated_by_athlete_id, match_type, duration_seconds, status, started_at)
      SELECT id, (SELECT id FROM gyms LIMIT 1), '${a.athleteId}', 'ranked', 600, 'in_progress', now() FROM ch RETURNING id
    ), p AS (
      INSERT INTO match_participants (match_id, athlete_id, role, elo_before)
      SELECT m.id, x.id, 'competitor', 1000 FROM m, (VALUES ('${a.athleteId}'::uuid), ('${b.athleteId}'::uuid)) AS x(id) RETURNING match_id
    )
    SELECT DISTINCT match_id FROM p;`);
}

function rowsFor(matchId: string, athleteId: string): { id: string; status: string; storage_path: string }[] {
  const out = sql(`SELECT id || '|' || status || '|' || coalesce(storage_path, '') FROM match_videos WHERE match_id = '${matchId}' AND uploaded_by = '${athleteId}';`);
  return out
    ? out.split("\n").map((l) => {
        const [id, status, storage_path] = l.split("|");
        return { id, status, storage_path };
      })
    : [];
}

function objectExists(key: string): boolean {
  return sql(`SELECT count(*) FROM storage.objects WHERE bucket_id = '${BUCKET}' AND name = '${key}';`) === "1";
}

async function put(c: Client, key: string): Promise<void> {
  const { error } = await c.storage.from(BUCKET).upload(key, BYTES, { contentType: "video/mp4", upsert: true });
  if (error) throw error;
}

async function waitStatus(id: string, wanted: (s: string) => boolean, ms = 10_000): Promise<string | null> {
  return until(async () => {
    const s = sql(`SELECT status FROM match_videos WHERE id = '${id}';`);
    return wanted(s) ? s : null;
  }, ms);
}

describe.skipIf(!ENABLED)("OTA wave 2 against a local stack (jits-n2im.11/.12/.14, review B1/M1)", () => {
  let admin: Client;
  let a: Athlete;
  let b: Athlete;
  let slicer: Awaited<ReturnType<typeof startSlicer>>;

  beforeAll(async () => {
    slicer = await startSlicer();
    admin = createClient<Database>(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    // Uploads on, a high cap, and a slicer URL that reaches this process.
    sql(`
      UPDATE feature_flags SET enabled = true WHERE key = 'video_upload_enabled';
      DELETE FROM vault.secrets WHERE name IN ('app.settings.video_slicer_url', 'app.settings.video_upload_daily_cap');
      SELECT vault.create_secret('http://host.docker.internal:${slicer.port}/slice', 'app.settings.video_slicer_url');
      SELECT vault.create_secret('1000', 'app.settings.video_upload_daily_cap');`);
    a = await makeAthlete(admin, "a");
    b = await makeAthlete(admin, "b");
  });

  afterAll(async () => {
    sql(`DELETE FROM vault.secrets WHERE name IN ('app.settings.video_slicer_url', 'app.settings.video_upload_daily_cap');`);
    await a?.client.removeAllChannels();
    await b?.client.removeAllChannels();
    slicer?.close();
  });

  it("(a) the opponent sees A's 'uploading' row within 2 s, over realtime", async () => {
    // Warm-up, not timed: a local realtime starts its replication stream on
    // the first postgres_changes subscription, which takes seconds once
    // (always warm in prod). Wait until one event goes through end to end.
    const warm = makeMatch(a, b);
    let warmed = false;
    await new Promise<void>((resolve) => {
      b.client
        .channel(`it-warm-${warm}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_videos", filter: `match_id=eq.${warm}` }, () => {
          warmed = true;
        })
        .subscribe((s) => {
          if (s === "SUBSCRIBED") resolve();
        });
    });
    const warmKey = buildMatchVideoStoragePath(warm, a.athleteId);
    const warmRes = await reserveMatchVideoUpload(a.client, { matchId: warm, uploaderAthleteId: a.athleteId, storagePath: warmKey, fileSizeBytes: BYTES.length });
    const warmId = warmRes.ok ? warmRes.data.id : "";
    for (let i = 0; i < 30 && !warmed; i++) {
      await touchMatchVideoUpload(a.client, { videoId: warmId, bytesConfirmed: i + 1 });
      await sleep(1000);
    }
    expect(warmed).toBe(true);

    const matchId = makeMatch(a, b);
    let seenAt = 0;
    const joined = new Promise<void>((resolve) => {
      b.client
        .channel(`it-a-${matchId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_videos", filter: `match_id=eq.${matchId}` }, () => {
          if (!seenAt) seenAt = Date.now();
        })
        .subscribe((s) => {
          if (s === "SUBSCRIBED") resolve();
        });
    });
    await joined;
    await sleep(500);

    const key = buildMatchVideoStoragePath(matchId, a.athleteId);
    const t0 = Date.now();
    const reserved = await reserveMatchVideoUpload(a.client, {
      matchId,
      uploaderAthleteId: a.athleteId,
      storagePath: key,
      fileSizeBytes: BYTES.length,
      recordStartedAt: new Date(Date.now() - 60_000).toISOString(),
      recordDurationMs: 60_000,
    });
    expect(reserved.ok && reserved.data.outcome).toBe("reserved");
    const event = await until(async () => seenAt || null, 2_000, 20);
    expect(event).not.toBeNull();
    expect(seenAt - t0).toBeLessThanOrEqual(2_000);
    console.log(`[video-wave2 it] reservation to opponent realtime INSERT: ${seenAt - t0} ms`);

    // And the RPC the hook refetches shows it to B, with the heartbeat %.
    const id = reserved.ok ? reserved.data.id : "";
    const touched = await touchMatchVideoUpload(a.client, { videoId: id, bytesConfirmed: 1024, bytesTotal: BYTES.length, transport: "tus" });
    expect(touched.ok && touched.data.updated).toBe(true);
    const view = await getMatchDetailView(b.client, matchId, b.athleteId);
    expect(view.ok).toBe(true);
    const row = view.ok ? view.data.videos.find((v) => v.id === id) : undefined;
    expect(row).toMatchObject({ status: "uploading", is_mine: false, upload_bytes_confirmed: 1024, upload_bytes_total: BYTES.length, upload_in_flight: true });
  });

  it("(b) intent rows exist for both athletes after the face-off", async () => {
    const matchId = makeMatch(a, b);
    expect((await setMatchRecordingIntent(a.client, matchId, true)).ok).toBe(true);
    expect((await setMatchRecordingIntent(b.client, matchId, false)).ok).toBe(true);
    // Last write wins.
    expect((await setMatchRecordingIntent(b.client, matchId, true)).ok).toBe(true);
    const rows = sql(`SELECT athlete_id || ':' || intends_to_record || ':' || role FROM match_recording_intents WHERE match_id = '${matchId}' ORDER BY athlete_id;`)
      .split("\n")
      .sort();
    expect(rows).toEqual([`${a.athleteId}:true:competitor`, `${b.athleteId}:true:competitor`].sort());
    // Each athlete can read them (RLS: the match's participants).
    const { data } = await b.client.from("match_recording_intents").select("athlete_id").eq("match_id", matchId);
    expect((data ?? []).length).toBe(2);
  });

  it("(c) B1: a re-record never touches the landed video; discarding it keeps the old one", async () => {
    const matchId = makeMatch(a, b);
    // Clip 1 lands for real.
    const key1 = buildMatchVideoStoragePath(matchId, a.athleteId);
    const r1 = await reserveMatchVideoUpload(a.client, { matchId, uploaderAthleteId: a.athleteId, storagePath: key1, fileSizeBytes: BYTES.length });
    expect(r1.ok).toBe(true);
    const id1 = r1.ok ? r1.data.id : "";
    await put(a.client, key1);
    expect(await waitStatus(id1, (s) => s !== "uploading")).not.toBeNull();

    // Clip 2: the preflight says duplicate with a landed status...
    const pre = await canUploadMatchVideo(a.client, matchId, BYTES.length);
    expect(pre.ok && pre.data).toMatchObject({ allowed: false, reason: "duplicate", existingVideoId: id1 });
    expect(pre.ok && pre.data.existingStatus).not.toBe("uploading");
    // ...and the reservation defers instead of re-pathing.
    await sleep(5);
    const key2 = buildMatchVideoStoragePath(matchId, a.athleteId);
    const r2 = await reserveMatchVideoUpload(a.client, { matchId, uploaderAthleteId: a.athleteId, storagePath: key2, fileSizeBytes: BYTES.length });
    expect(r2.ok && r2.data).toMatchObject({ outcome: "deferred", id: id1, storagePath: key1 });

    // The athlete discards clip 2 (wave 1 order: nothing was written, no
    // abandon to send). The old video is exactly as it was.
    const rows = rowsFor(matchId, a.athleteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: id1, storage_path: key1 });
    expect(rows[0].status).not.toBe("uploading");
    expect(rows[0].status).not.toBe("failed");
    expect(objectExists(key1)).toBe(true);

    // Had clip 2 landed instead, the wave 1 order replaces the row only now.
    await put(a.client, key2);
    const replaced = await upsertMatchVideo(a.client, { matchId, uploaderAthleteId: a.athleteId, storagePath: key2, fileSizeBytes: BYTES.length });
    expect(replaced.ok && replaced.data.id).toBe(id1);
    expect(rowsFor(matchId, a.athleteId)[0]).toMatchObject({ storage_path: key2 });
  });

  it("(d) M1: after the server flip a newer reservation cannot take the row over; its key stays live", async () => {
    const matchId = makeMatch(a, b);
    const keyA = buildMatchVideoStoragePath(matchId, a.athleteId);
    const rA = await reserveMatchVideoUpload(a.client, { matchId, uploaderAthleteId: a.athleteId, storagePath: keyA, fileSizeBytes: BYTES.length });
    const idA = rA.ok ? rA.data.id : "";
    await put(a.client, keyA);
    // The storage trigger flips it (no client PATCH yet).
    expect(await waitStatus(idA, (s) => s !== "uploading")).not.toBeNull();

    // The superseding recording reserves: deferred, row untouched.
    await sleep(5);
    const keyB = buildMatchVideoStoragePath(matchId, a.athleteId);
    const rB = await reserveMatchVideoUpload(a.client, { matchId, uploaderAthleteId: a.athleteId, storagePath: keyB, fileSizeBytes: BYTES.length });
    expect(rB.ok && rB.data.outcome).toBe("deferred");
    expect(rowsFor(matchId, a.athleteId)[0]).toMatchObject({ id: idA, storage_path: keyA });
    // So keyA must survive (the manager never deletes it); and the old run's
    // late land PATCH is a harmless no-op that reads "landed".
    expect(objectExists(keyA)).toBe(true);
    const late = await finalizeMatchVideoUpload(a.client, { videoId: idA, storagePath: keyA });
    expect(late.ok && late.data.outcome).toBe("landed");

    // Contrast: while the row is still 'uploading', a newer reservation DOES
    // take it over and reports the key it moved off (the manager deletes
    // that orphan only then).
    const m2 = makeMatch(a, b);
    const k1 = buildMatchVideoStoragePath(m2, a.athleteId);
    await reserveMatchVideoUpload(a.client, { matchId: m2, uploaderAthleteId: a.athleteId, storagePath: k1, fileSizeBytes: BYTES.length });
    await sleep(5);
    const k2 = buildMatchVideoStoragePath(m2, a.athleteId);
    const over = await reserveMatchVideoUpload(a.client, { matchId: m2, uploaderAthleteId: a.athleteId, storagePath: k2, fileSizeBytes: BYTES.length });
    expect(over.ok && over.data).toMatchObject({ outcome: "reserved", storagePath: k2, previousStoragePath: k1 });
  });

  it("(e) a kill right after the last byte: one row, 'ready', exactly one slicer dispatch", async () => {
    const matchId = makeMatch(a, b);
    const key = buildMatchVideoStoragePath(matchId, a.athleteId);
    const r = await reserveMatchVideoUpload(a.client, { matchId, uploaderAthleteId: a.athleteId, storagePath: key, fileSizeBytes: BYTES.length });
    const id = r.ok ? r.data.id : "";
    // A reservation dispatches nothing.
    await sleep(1500);
    expect(slicer.hits.get(id) ?? 0).toBe(0);

    // The last byte lands; the process dies before persisting the phase.
    await put(a.client, key);
    expect(await waitStatus(id, (s) => s !== "uploading")).not.toBeNull();

    // Relaunch: the job is still "bytes" without... or with the id. Both
    // resumes converge: the same-key reservation echoes the row (no
    // second row), and the land PATCH is a no-op.
    const again = await reserveMatchVideoUpload(a.client, { matchId, uploaderAthleteId: a.athleteId, storagePath: key, fileSizeBytes: BYTES.length });
    expect(again.ok && again.data).toMatchObject({ id, outcome: "reserved", storagePath: key });
    expect(again.ok && again.data.status).not.toBe("uploading");
    const land = await finalizeMatchVideoUpload(a.client, { videoId: id, storagePath: key });
    expect(land.ok && land.data.outcome).toBe("landed");

    expect(rowsFor(matchId, a.athleteId)).toHaveLength(1);
    const dispatched = await until(async () => (slicer.hits.get(id) ?? 0) >= 1, 15_000, 200);
    expect(dispatched).toBe(true);
    await sleep(3000);
    expect(slicer.hits.get(id)).toBe(1);
  });

  it("abandon on a reserved row: failed / upload_abandoned by failure_code, idempotent", async () => {
    const matchId = makeMatch(a, b);
    const key = buildMatchVideoStoragePath(matchId, a.athleteId);
    const r = await reserveMatchVideoUpload(a.client, { matchId, uploaderAthleteId: a.athleteId, storagePath: key, fileSizeBytes: BYTES.length });
    const id = r.ok ? r.data.id : "";
    expect(await abandonMatchVideoUpload(a.client, id)).toEqual({ ok: true, data: { status: "failed", abandoned: true } });
    expect(await abandonMatchVideoUpload(a.client, id)).toEqual({ ok: true, data: { status: "failed", abandoned: true } });
    expect(sql(`SELECT failure_code FROM match_videos WHERE id = '${id}';`)).toBe("upload_abandoned");
    // The opponent cannot abandon it.
    expect((await abandonMatchVideoUpload(b.client, id)).ok).toBe(false);
  });
});
