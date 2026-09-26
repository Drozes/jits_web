/**
 * Seed a real, playable match video for a match the harness just finished
 * (E17, V-epic jits-5tj9.10). LOCAL stack only, no service role: the upload
 * and the `match_videos` row are written by the uploader athlete through a
 * publishable-key client, under the same storage and table RLS as the app.
 *
 * The fixture is committed at `fixtures/video/sample-3s.mp4` (~34 KB, H.264
 * Constrained Baseline + AAC, faststart, so AVPlayer on iOS plays it). It was
 * generated once with:
 *
 *   /opt/homebrew/bin/ffmpeg -f lavfi -i testsrc=size=320x240:rate=15 -f lavfi -i sine=frequency=440 -t 3 \
 *     -c:v libx264 -pix_fmt yuv420p -profile:v baseline -c:a aac -b:a 32k -movflags +faststart -shortest \
 *     tools/match-loop/fixtures/video/sample-3s.mp4
 *
 * Signing Blue in on a Node client does not touch the simulator's session.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@jits/shared/types/database";
import { buildMatchVideoStoragePath, upsertMatchVideo } from "@jits/shared/api/mutations";
import { assertBotKey, type Config } from "../config";
import { lit, psql, queryJson } from "./psql";
import { EnvError, HarnessError } from "./util";

export const VIDEO_BUCKET = "match-videos";
export const FIXTURE_VIDEO = join(__dirname, "../fixtures/video/sample-3s.mp4");
export const FIXTURE_DURATION_SECONDS = 3;

type Client = SupabaseClient<Database>;

export interface SeededVideo {
  who: "red" | "blue";
  matchId: string;
  athleteId: string;
  videoId: string;
  storagePath: string;
  /** Still signed in as the uploader, so cleanup runs under the same RLS. */
  client: Client;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * `<matchId>/<athleteId>/<unix_ms>.mp4`, built by the app's own helper. The
 * storage INSERT policy needs folder 1 to be a match UUID and folder 2 the
 * uploader's athlete id, so both are validated before anything is uploaded.
 */
export function seedVideoPath(matchId: string, athleteId: string): string {
  for (const [name, v] of [["matchId", matchId], ["athleteId", athleteId]] as const) {
    if (!new RegExp(`^${UUID}$`, "i").test(v)) throw new HarnessError(`seedVideoPath: ${name} is not a UUID: ${v}`);
  }
  const path = buildMatchVideoStoragePath(matchId, athleteId, "mp4");
  if (!new RegExp(`^${matchId}/${athleteId}/\\d+\\.mp4$`).test(path)) {
    throw new HarnessError(`buildMatchVideoStoragePath returned an unexpected key: ${path}`);
  }
  return path;
}

/**
 * A publishable-key client for the uploader. Applies the same key guard as
 * the rest of the harness (never an `sb_secret_` / service_role key) and
 * refuses anything but the local API, even though `loadConfig()` already did.
 */
export function seedClient(cfg: Config): Client {
  assertBotKey(cfg.publishableKey);
  const api = new URL(cfg.supabaseUrl);
  if (!["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "54321") {
    throw new EnvError(`REFUSING: video seed against ${cfg.supabaseUrl}, not the local stack`);
  }
  return createClient<Database>(cfg.supabaseUrl, cfg.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Sign in as `demo-<who>`, upload the fixture into the match, write the row. */
export async function seedMatchVideo(
  cfg: Config,
  password: string,
  who: "red" | "blue",
  matchId: string,
  athleteId: string,
): Promise<SeededVideo> {
  const client = seedClient(cfg);
  const { error: authError } = await client.auth.signInWithPassword({ email: cfg.emails[who], password });
  if (authError) throw new EnvError(`video seed sign-in failed for ${cfg.emails[who]}: ${authError.message}`);

  const bytes = readFileSync(FIXTURE_VIDEO);
  const storagePath = seedVideoPath(matchId, athleteId);
  const up = await client.storage.from(VIDEO_BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: false,
  });
  if (up.error) throw new HarnessError(`video seed upload (${who}) refused: ${up.error.message}`);

  const row = await upsertMatchVideo(client, {
    matchId,
    uploaderAthleteId: athleteId,
    storagePath,
    durationSeconds: FIXTURE_DURATION_SECONDS,
    fileSizeBytes: bytes.length,
  });
  if (!row.ok) {
    await client.storage.from(VIDEO_BUCKET).remove([storagePath]).catch(() => undefined);
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    if (isUploadRateLimited(row.error)) {
      throw new EnvError(
        `video seed (${who}) hit the backend upload cap (P0001 upload_rate_limited: ${UPLOAD_DAILY_CAP} per athlete per ` +
          `rolling 24h, counted from public.video_upload_events). E17 clears its own ledger rows; clear stale ones ` +
          `locally or wait for the window to roll.`,
      );
    }
    throw new HarnessError(`video seed row (${who}) refused: ${row.error.code} ${row.error.message}`);
  }
  return { who, matchId, athleteId, videoId: row.data.id, storagePath, client };
}

/** The backend default for `app.settings.video_upload_daily_cap` (jr_be 20260918020000). */
export const UPLOAD_DAILY_CAP = 10;

/** True for the BEFORE INSERT upload-cap trigger's P0001 HINT upload_rate_limited. */
export function isUploadRateLimited(error: { message?: string; raw?: { code?: string; hint?: string | null } | null }): boolean {
  return error.raw?.hint === "upload_rate_limited" || /upload limit reached/i.test(error.message ?? "");
}

/**
 * Remove what `seedMatchVideo` created, as the same uploader (the row and
 * storage DELETE policies allow the uploader's own folder). Returns what
 * could not be removed instead of throwing, so cleanup never masks the
 * scenario's real result. The upload-ledger row is NOT removed here (the
 * ledger is deny-all to clients); see `clearUploadLedger`.
 */
export async function removeSeededVideo(seed: SeededVideo): Promise<string[]> {
  const problems: string[] = [];
  try {
    const del = await seed.client.from("match_videos").delete().eq("id", seed.videoId).select("id");
    if (del.error) problems.push(`row ${seed.videoId}: ${del.error.message}`);
    else if ((del.data ?? []).length !== 1) problems.push(`row ${seed.videoId}: deleted ${(del.data ?? []).length} rows, expected 1`);
  } catch (e) {
    problems.push(`row ${seed.videoId}: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const rm = await seed.client.storage.from(VIDEO_BUCKET).remove([seed.storagePath]);
    if (rm.error) problems.push(`object ${seed.storagePath}: ${rm.error.message}`);
    else if ((rm.data ?? []).length === 0) problems.push(`object ${seed.storagePath}: not removed (0 objects)`);
  } catch (e) {
    problems.push(`object ${seed.storagePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  // LOCAL scope only: the default (global) would revoke every session of the
  // uploader, including the simulator app's own session when who = "blue".
  await seed.client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return problems;
}

/**
 * SQL that deletes the upload-ledger rows of the given seeded videos. The
 * ledger (public.video_upload_events, jr_be 20260918020000) survives a
 * match_videos DELETE on purpose and caps inserts per athlete per rolling
 * 24h, so without this E17 would exhaust Blue's and Red's budget within a few
 * iterations. Ids are validated as UUIDs; an empty list deletes nothing.
 */
export function uploadLedgerCleanupSql(videoIds: string[]): string | null {
  if (videoIds.length === 0) return null;
  for (const id of videoIds) {
    if (!new RegExp(`^${UUID}$`, "i").test(id)) throw new HarnessError(`uploadLedgerCleanupSql: not a UUID: ${id}`);
  }
  return `delete from public.video_upload_events where video_id in (${videoIds.map(lit).join(", ")})`;
}

/** Run `uploadLedgerCleanupSql` through the harness's fixed LOCAL psql. Returns problems. */
export async function clearUploadLedger(videoIds: string[]): Promise<string[]> {
  const sql = uploadLedgerCleanupSql(videoIds);
  if (!sql) return [];
  try {
    await psql(sql);
    return [];
  } catch (e) {
    return [`upload ledger: ${e instanceof Error ? e.message : String(e)}`];
  }
}

/** Uploads counted against each athlete's rolling 24h cap right now (LOCAL psql). */
export async function uploadBudgetUsed(athleteIds: string[]): Promise<Record<string, number>> {
  const rows = await queryJson<{ athlete_id: string; n: number }>(
    `select athlete_id, count(*)::int as n from public.video_upload_events
     where athlete_id in (${athleteIds.map(lit).join(", ")}) and created_at > now() - interval '24 hours'
     group by athlete_id`,
  );
  return Object.fromEntries(athleteIds.map((id) => [id, rows.find((r) => r.athlete_id === id)?.n ?? 0]));
}
