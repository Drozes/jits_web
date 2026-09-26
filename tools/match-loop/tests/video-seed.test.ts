/**
 * E17 helper tests (node:test, run via `npm run match-loop:test`). Pure: no
 * database, no network, no simulator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import type { Config } from "../config";
import { EnvError, HarnessError } from "../lib/util";
import {
  FIXTURE_VIDEO,
  isUploadRateLimited,
  removeSeededVideo,
  seedClient,
  seedVideoPath,
  uploadLedgerCleanupSql,
  type SeededVideo,
} from "../lib/video-seed";
import { detailOpponent, historyRowLabel, playerState, watchButtonId, watchLabelFor } from "../sim/match-detail";

const MATCH = "0b7c2f7e-1d7a-4a39-9a51-2f1d3c4b5a69";
const ATHLETE = "d399ca0e-610c-4f6e-a08c-bbc18872f8d4";

function cfg(over: Partial<Config> = {}): Config {
  return {
    supabaseUrl: "http://127.0.0.1:54321",
    publishableKey: "sb_publishable_test",
    udid: "X",
    bundleId: "com.elorated.mobile",
    metroUrl: "http://127.0.0.1:8081",
    metroLog: null,
    requireMetroLog: false,
    jrBeRoot: "/nonexistent",
    idbPython: "python3",
    realtimeContainer: "supabase_realtime_jr_be",
    emails: { blue: "b", red: "r", green: "g" },
    names: { blue: "B", red: "R", green: "G" },
    ...over,
  };
}

test("seedVideoPath is the app's <matchId>/<athleteId>/<unix_ms>.mp4 key", () => {
  const before = Date.now();
  const path = seedVideoPath(MATCH, ATHLETE);
  const m = path.match(/^([^/]+)\/([^/]+)\/(\d+)\.mp4$/);
  assert.ok(m, path);
  assert.equal(m[1], MATCH);
  assert.equal(m[2], ATHLETE);
  assert.ok(Number(m[3]) >= before && Number(m[3]) <= Date.now() + 1);
  assert.ok(!path.startsWith("matches/"), "no matches/ prefix");
});

test("seedVideoPath refuses ids the storage policy would reject (or that could escape the folder)", () => {
  for (const [matchId, athleteId] of [
    ["", ATHLETE],
    [MATCH, ""],
    ["../other", ATHLETE],
    [MATCH, `${ATHLETE}/..`],
    ["not-a-uuid", ATHLETE],
  ]) {
    assert.throws(() => seedVideoPath(matchId, athleteId), HarnessError, `${matchId} ${athleteId}`);
  }
});

test("seedClient applies the bot key guard: no sb_secret_ or service_role key", () => {
  assert.throws(() => seedClient(cfg({ publishableKey: "sb_secret_abc" })), EnvError);
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  assert.throws(() => seedClient(cfg({ publishableKey: `x.${payload}.y` })), EnvError);
});

test("seedClient refuses anything but the local API", () => {
  for (const url of ["https://abc.supabase.co", "http://127.0.0.1:54322", "http://10.0.0.5:54321"]) {
    assert.throws(() => seedClient(cfg({ supabaseUrl: url })), EnvError, url);
  }
});

test("seedClient builds a client for the local stack (127.0.0.1 or localhost) with a publishable key", () => {
  for (const url of ["http://127.0.0.1:54321", "http://localhost:54321"]) {
    const c = seedClient(cfg({ supabaseUrl: url }));
    assert.equal(typeof c.storage.from, "function", url);
  }
});

// --- cleanup (fake client: no network) ---------------------------------------------

interface FakeOpts {
  deleteResult?: { data: unknown[] | null; error: { message: string } | null };
  deleteThrows?: boolean;
  removeResult?: { data: unknown[] | null; error: { message: string } | null };
}

function fakeSeed(opts: FakeOpts = {}) {
  const calls = { signOut: [] as unknown[], deleteEq: [] as unknown[], selected: [] as string[], removed: [] as unknown[] };
  const client = {
    from: () => ({
      delete: () => ({
        eq: (col: string, val: string) => {
          calls.deleteEq.push([col, val]);
          return {
            select: async (cols: string) => {
              calls.selected.push(cols);
              if (opts.deleteThrows) throw new Error("network down");
              return opts.deleteResult ?? { data: [{ id: val }], error: null };
            },
          };
        },
      }),
    }),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          calls.removed.push(paths);
          return opts.removeResult ?? { data: [{ name: paths[0] }], error: null };
        },
      }),
    },
    auth: {
      signOut: async (o: unknown) => {
        calls.signOut.push(o);
        return { error: null };
      },
    },
  };
  const seed: SeededVideo = {
    who: "blue",
    matchId: MATCH,
    athleteId: ATHLETE,
    videoId: "11111111-2222-4333-8444-555555555555",
    storagePath: `${MATCH}/${ATHLETE}/1.mp4`,
    client: client as unknown as SeededVideo["client"],
  };
  return { seed, calls };
}

test("removeSeededVideo deletes the row (verified via select) and the object, then signs out LOCAL only", async () => {
  const { seed, calls } = fakeSeed();
  assert.deepEqual(await removeSeededVideo(seed), []);
  assert.deepEqual(calls.deleteEq, [["id", seed.videoId]]);
  assert.deepEqual(calls.selected, ["id"]);
  assert.deepEqual(calls.removed, [[seed.storagePath]]);
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("removeSeededVideo reports failed deletes as problems instead of throwing, and still signs out", async () => {
  const cases: FakeOpts[] = [
    { deleteResult: { data: null, error: { message: "rls" } } },
    { deleteResult: { data: [], error: null } },
    { deleteResult: { data: [{}, {}], error: null } },
    { deleteThrows: true },
    { removeResult: { data: null, error: { message: "denied" } } },
    { removeResult: { data: [], error: null } },
  ];
  for (const opts of cases) {
    const { seed, calls } = fakeSeed(opts);
    const problems = await removeSeededVideo(seed);
    assert.equal(problems.length, 1, JSON.stringify({ opts, problems }));
    assert.deepEqual(calls.signOut, [{ scope: "local" }]);
  }
});

test("upload ledger cleanup SQL targets only the seeded video ids", () => {
  const ids = ["11111111-2222-4333-8444-555555555555", "66666666-7777-4888-9999-000000000000"];
  assert.equal(
    uploadLedgerCleanupSql(ids),
    `delete from public.video_upload_events where video_id in ('${ids[0]}', '${ids[1]}')`,
  );
  assert.equal(uploadLedgerCleanupSql([]), null);
  assert.throws(() => uploadLedgerCleanupSql(["x' or true --"]), HarnessError);
});

test("isUploadRateLimited recognises the P0001 upload_rate_limited hint only", () => {
  assert.ok(isUploadRateLimited({ message: "x", raw: { code: "P0001", hint: "upload_rate_limited" } }));
  assert.ok(isUploadRateLimited({ message: "Upload limit reached: at most 10 videos per 24 hours." }));
  assert.ok(!isUploadRateLimited({ message: "Re-slice limit reached", raw: { code: "P0001", hint: "video_reslice_limit" } }));
});

test("the fixture is a small faststart MP4 (moov before mdat, so AVPlayer can stream it)", () => {
  const size = statSync(FIXTURE_VIDEO).size;
  assert.ok(size > 1_000 && size < 100 * 1024, `size ${size}`);
  const bytes = readFileSync(FIXTURE_VIDEO);
  assert.equal(bytes.subarray(4, 8).toString("latin1"), "ftyp");
  const moov = bytes.indexOf("moov", 0, "latin1");
  const mdat = bytes.indexOf("mdat", 0, "latin1");
  assert.ok(moov > 0 && mdat > 0 && moov < mdat, `moov ${moov} mdat ${mdat}`);
});

test("match-detail page helpers parse the app's accessibility contract", () => {
  assert.equal(detailOpponent("Match detail vs Demo Red"), "Demo Red");
  assert.equal(detailOpponent(null), null);
  assert.equal(detailOpponent("Match"), null);
  assert.equal(playerState("Video state: loaded"), "loaded");
  assert.equal(playerState("Video state: error"), "error");
  assert.equal(playerState("Video"), null);
  assert.equal(watchLabelFor(null), "Watch your recording");
  assert.equal(watchLabelFor("Demo Red"), "Watch Demo Red's recording");
  assert.equal(watchButtonId("abc"), "match-video-watch-abc");
  const row = historyRowLabel("Demo Red");
  assert.ok(row.test("Open match vs Demo Red"));
  assert.ok(!row.test("Open match video vs Demo Red"));
  assert.ok(!row.test("Open match vs Demo Redder"));
  assert.ok(historyRowLabel("Demo Red", true).test("Open match video vs Demo Red"));
  assert.ok(historyRowLabel("A.B (x)").test("Open match vs A.B (x)"), "names are escaped");
});
