/**
 * Safety-guard tests (node:test, run via `npm run match-loop:test`).
 * Pure: temp dirs only, no database, no simulator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activeEnvValue, assertSafe, type Config } from "../config";
import { psqlEnv } from "../lib/psql";
import { EnvError } from "../lib/util";
import { redact, registerSecret } from "../lib/redact";

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

function mobileDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "match-loop-guard-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

const LOCAL_ENV = { ".env": "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n" };

test("assertSafe accepts the plain local stack", () => {
  assert.doesNotThrow(() => assertSafe(cfg(), mobileDir(LOCAL_ENV)));
});

test("assertSafe refuses a non-local or disguised API URL", () => {
  const dir = mobileDir(LOCAL_ENV);
  for (const url of [
    "https://abc.supabase.co",
    "http://127.0.0.1:54322",
    "http://127.0.0.1:54321/?host=evil",
    "http://user:pw@127.0.0.1:54321",
    "http://127.0.0.1.evil.com:54321",
  ]) {
    assert.throws(() => assertSafe(cfg({ supabaseUrl: url }), dir), EnvError, url);
  }
});

test("assertSafe refuses secret and service_role keys", () => {
  const dir = mobileDir(LOCAL_ENV);
  assert.throws(() => assertSafe(cfg({ publishableKey: "sb_secret_abc" }), dir), EnvError);
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  assert.throws(() => assertSafe(cfg({ publishableKey: `x.${payload}.y` }), dir), EnvError);
});

test("assertSafe refuses a container that is not supabase_realtime_*", () => {
  const dir = mobileDir(LOCAL_ENV);
  for (const name of ["supabase_db_jr_be", "postgres", "supabase_realtime_x;touch pwned"]) {
    assert.throws(() => assertSafe(cfg({ realtimeContainer: name }), dir), EnvError, name);
  }
});

test("assertSafe checks EVERY Expo dotenv file", () => {
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    const dir = mobileDir({ ...LOCAL_ENV, [file]: "EXPO_PUBLIC_SUPABASE_URL=https://prod.supabase.co\n" });
    assert.throws(() => assertSafe(cfg(), dir), EnvError, file);
  }
  assert.throws(() => assertSafe(cfg(), mobileDir({})), EnvError, "no URL at all");
});

test("activeEnvValue: last uncommented value wins; comments and look-alikes ignored", () => {
  assert.equal(activeEnvValue("# EXPO_PUBLIC_SUPABASE_URL=http://remote\n", "EXPO_PUBLIC_SUPABASE_URL"), null);
  assert.equal(activeEnvValue("X_EXPO_PUBLIC_SUPABASE_URL=http://remote\n", "EXPO_PUBLIC_SUPABASE_URL"), null);
  assert.equal(activeEnvValue("A=1\nA=2", "A"), "2");
  assert.equal(activeEnvValue('export A="http://x"', "A"), "http://x");
  assert.equal(activeEnvValue("A=1\n# A=2\n", "A"), "1");
});

test("psqlEnv strips every PG* variable and pins the local password", () => {
  const saved = { ...process.env };
  try {
    process.env.PGHOST = "10.0.0.1";
    process.env.PGPORT = "1";
    process.env.PGSERVICE = "evil";
    process.env.PGSERVICEFILE = "/tmp/evil";
    process.env.pgpassfile = "/tmp/evil";
    const env = psqlEnv();
    const pg = Object.keys(env).filter((k) => /^pg/i.test(k));
    assert.deepEqual(pg, ["PGPASSWORD"]);
    assert.equal(env.PGPASSWORD, "postgres");
  } finally {
    process.env = saved;
  }
});

test("redact removes registered secrets", () => {
  registerSecret("s3cret-value");
  assert.equal(redact("pw=s3cret-value!"), "pw=<redacted>!");
});
