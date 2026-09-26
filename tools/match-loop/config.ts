/**
 * Harness configuration and SAFETY GUARDS.
 *
 * The harness writes to a database (resets ELO, cancels matches) and drives a
 * real app. It must never be able to touch anything but the local stack, so
 * `loadConfig()` HARD REFUSES to return unless:
 *   - the Supabase API is 127.0.0.1/localhost:54321 with no path/query tricks,
 *   - the database is the fixed local target in `lib/psql.ts` (not
 *     configurable at all; PG* env vars are stripped when psql is spawned),
 *   - every dotenv file Expo loads for the app (`.env`, `.env.local`,
 *     `.env.development`, `.env.development.local`) that sets
 *     EXPO_PUBLIC_SUPABASE_URL points at the local stack (a runtime check in
 *     preflight then proves the running app really talks to it),
 *   - the bot's key is a publishable/anon key, never an `sb_secret_` or a
 *     service_role JWT (the bot must be subject to RLS exactly like the app),
 *   - the realtime container name looks like a local Supabase container.
 *
 * Machine-specific values (simulator UDID, idb's Python, the Metro log) are
 * NOT committed: they come from env vars or the gitignored
 * `tools/match-loop/local.config.json` (see `local.config.example.json`).
 * Env vars win over the file.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { queryJson } from "./lib/psql";
import { registerSecret } from "./lib/redact";
import { EnvError } from "./lib/util";

export const REPO_ROOT = resolve(__dirname, "../..");
export const HARNESS_DIR = __dirname;
export const RUNS_DIR = join(__dirname, ".runs");
export const LOCAL_CONFIG = join(__dirname, "local.config.json");

export interface Config {
  supabaseUrl: string;
  publishableKey: string;
  udid: string;
  bundleId: string;
  metroUrl: string;
  /** Metro's stdout log. Null = the log oracle is SKIPPED. */
  metroLog: string | null;
  /** When true, preflight fails if the Metro log is missing or unreadable. */
  requireMetroLog: boolean;
  jrBeRoot: string;
  /** Python that has fb-idb installed (the `idb` console script is broken on 3.14). */
  idbPython: string;
  realtimeContainer: string;
  emails: { blue: string; red: string; green: string };
  names: { blue: string; red: string; green: string };
}

export interface AthleteIds {
  blue: string;
  red: string;
  green: string;
}

interface LocalConfigFile {
  udid?: string;
  idbPython?: string;
  metroLog?: string;
  requireMetroLog?: boolean;
  metroUrl?: string;
  bundleId?: string;
  supabaseUrl?: string;
  publishableKey?: string;
  jrBeRoot?: string;
  realtimeContainer?: string;
}

function readLocalConfig(): LocalConfigFile {
  if (!existsSync(LOCAL_CONFIG)) return {};
  try {
    return JSON.parse(readFileSync(LOCAL_CONFIG, "utf8")) as LocalConfigFile;
  } catch (e) {
    throw new EnvError(`${LOCAL_CONFIG} is not valid JSON: ${e instanceof Error ? e.message : e}`);
  }
}

function pick(envName: string, file: string | undefined, fallback?: string): string | undefined {
  const v = process.env[envName]?.trim();
  if (v) return v;
  if (file && file.trim()) return file.trim();
  return fallback;
}

function required(name: string, envName: string, value: string | undefined): string {
  if (!value) {
    throw new EnvError(
      `missing ${name}: set ${envName} or "${name}" in tools/match-loop/local.config.json (see local.config.example.json)`,
    );
  }
  return value;
}

export function loadConfig(): Config {
  const f = readLocalConfig();
  const requireEnv = process.env.MATCH_LOOP_REQUIRE_METRO_LOG;
  const cfg: Config = {
    supabaseUrl: pick("MATCH_LOOP_SUPABASE_URL", f.supabaseUrl, "http://127.0.0.1:54321")!,
    // The local stack's well-known publishable key (not a secret).
    publishableKey: pick("MATCH_LOOP_SUPABASE_KEY", f.publishableKey, "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH")!,
    udid: required("udid", "MATCH_LOOP_UDID", pick("MATCH_LOOP_UDID", f.udid)),
    bundleId: pick("MATCH_LOOP_BUNDLE_ID", f.bundleId, "com.elorated.mobile")!,
    metroUrl: pick("MATCH_LOOP_METRO_URL", f.metroUrl, "http://127.0.0.1:8081")!,
    metroLog: pick("METRO_LOG", f.metroLog) ?? null,
    requireMetroLog: requireEnv !== undefined ? requireEnv === "1" || requireEnv === "true" : f.requireMetroLog ?? true,
    jrBeRoot: pick("MATCH_LOOP_JR_BE", f.jrBeRoot, resolve(REPO_ROOT, "../jr_be"))!,
    idbPython: required("idbPython", "MATCH_LOOP_IDB_PYTHON", pick("MATCH_LOOP_IDB_PYTHON", f.idbPython)),
    realtimeContainer: pick("MATCH_LOOP_REALTIME_CONTAINER", f.realtimeContainer, "supabase_realtime_jr_be")!,
    emails: {
      blue: "demo-blue@elorated.dev",
      red: "demo-red@elorated.dev",
      green: "demo-green@elorated.dev",
    },
    names: { blue: "Demo Blue", red: "Demo Red", green: "Demo Green" },
  };
  assertSafe(cfg);
  return cfg;
}

function isLocalHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost";
}

/** Every dotenv file Expo CLI loads for a development run, lowest to highest precedence. */
export const EXPO_ENV_FILES = [".env", ".env.development", ".env.local", ".env.development.local"];

/** Throws EnvError unless every target is the local stack. */
export function assertSafe(cfg: Config): void {
  const api = new URL(cfg.supabaseUrl);
  if (!isLocalHost(api.hostname) || api.port !== "54321" || api.search || api.username || api.password) {
    throw new EnvError(`REFUSING: Supabase URL ${cfg.supabaseUrl} is not the plain local API (127.0.0.1:54321)`);
  }
  assertBotKey(cfg.publishableKey);
  if (!/^supabase_realtime_[A-Za-z0-9_-]+$/.test(cfg.realtimeContainer)) {
    throw new EnvError(
      `REFUSING: realtime container "${cfg.realtimeContainer}" does not match ^supabase_realtime_ (E8 pauses it)`,
    );
  }

  // The app under test must be pointed at the same local backend, in every
  // file Expo would load.
  const mobile = join(REPO_ROOT, "apps/mobile");
  let seen = 0;
  for (const file of EXPO_ENV_FILES) {
    const path = join(mobile, file);
    if (!existsSync(path)) continue;
    const url = activeEnvValue(readFileSync(path, "utf8"), "EXPO_PUBLIC_SUPABASE_URL");
    if (url === null) continue;
    seen++;
    let host: URL;
    try {
      host = new URL(url);
    } catch {
      throw new EnvError(`REFUSING: apps/mobile/${file} EXPO_PUBLIC_SUPABASE_URL is not a URL`);
    }
    if (!isLocalHost(host.hostname) || host.port !== "54321") {
      throw new EnvError(
        `REFUSING: apps/mobile/${file} EXPO_PUBLIC_SUPABASE_URL is ${host.host}, not the local stack`,
      );
    }
  }
  if (seen === 0) {
    throw new EnvError(`REFUSING: no EXPO_PUBLIC_SUPABASE_URL found in apps/mobile/{${EXPO_ENV_FILES.join(",")}}`);
  }
}

function assertBotKey(key: string): void {
  if (key.startsWith("sb_secret_")) {
    throw new EnvError("REFUSING: the bot key is an sb_secret_ key; the bot must use a publishable key");
  }
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
        role?: string;
      };
      if (payload.role === "service_role") {
        throw new EnvError("REFUSING: the bot key is a service_role JWT");
      }
    } catch (e) {
      if (e instanceof EnvError) throw e;
    }
  }
}

/**
 * Last non-comment `NAME=value` in a dotenv file (last wins, like dotenv).
 * Handles a missing trailing newline and quoted values.
 */
export function activeEnvValue(contents: string, name: string): string | null {
  let value: string | null = null;
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#")) continue;
    const m = line.match(new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(.*)$`));
    if (m) value = m[1].replace(/^["']|["']$/g, "").trim();
  }
  return value;
}

/**
 * The seed password, loaded at runtime from jr_be (never copied into this
 * repo) and registered for redaction before anything can print it.
 */
export async function loadPassword(cfg: Config): Promise<string> {
  const path = join(cfg.jrBeRoot, "scripts/seed/lib/constants.mjs");
  if (!existsSync(path)) throw new EnvError(`seed constants not found at ${path}`);
  const mod = (await import(path)) as { SEED_PASSWORD?: string };
  const pw = mod.SEED_PASSWORD;
  if (!pw) throw new EnvError("SEED_PASSWORD not exported by jr_be seed constants");
  registerSecret(pw);
  return pw;
}

/** Resolve Blue/Red/Green athlete ids by auth email. */
export async function resolveAthleteIds(cfg: Config): Promise<AthleteIds> {
  const rows = await queryJson<{ id: string; email: string }>(
    `select a.id, u.email from public.athletes a join auth.users u on u.id = a.auth_user_id
     where u.email in ('${cfg.emails.blue}', '${cfg.emails.red}', '${cfg.emails.green}')`,
  );
  const by = (email: string) => {
    const r = rows.find((x) => x.email === email);
    if (!r) throw new EnvError(`no athlete for ${email} in the local database`);
    return r.id;
  };
  return { blue: by(cfg.emails.blue), red: by(cfg.emails.red), green: by(cfg.emails.green) };
}
