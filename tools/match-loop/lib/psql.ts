import { EnvError, run } from "./util";

/**
 * psql as `postgres` against the LOCAL database only.
 *
 * The target is NOT a URL. libpq honours `?host=`, `hostaddr=` and `service=`
 * query parameters and every `PG*` environment variable, any of which could
 * silently re-aim a URL that "looks" local. So the connection string is built
 * here from fixed parts, and psql is spawned with an environment that has
 * every `PG*` variable (and PGSERVICEFILE / PGPASSFILE) stripped.
 */
export const LOCAL_DB = Object.freeze({
  host: "127.0.0.1",
  port: 54322,
  dbname: "postgres",
  user: "postgres",
  password: "postgres",
});

const CONNINFO =
  `host=${LOCAL_DB.host} hostaddr=${LOCAL_DB.host} port=${LOCAL_DB.port} ` +
  `dbname=${LOCAL_DB.dbname} user=${LOCAL_DB.user} sslmode=disable connect_timeout=5`;

/** process.env minus anything libpq reads, plus the fixed local password. */
export function psqlEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^PG/i.test(k)) continue;
    env[k] = v;
  }
  env.PGPASSWORD = LOCAL_DB.password;
  return env;
}

/** Run SQL, return trimmed stdout (-At, unaligned tuples only). */
export async function psql(sql: string, timeoutMs = 20_000): Promise<string> {
  try {
    const { stdout } = await run(
      "psql",
      [CONNINFO, "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", sql],
      { timeoutMs, env: psqlEnv() },
    );
    return stdout.trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/could not connect|Connection refused|server closed|timeout expired/i.test(msg)) {
      throw new EnvError(`database unreachable: ${msg}`);
    }
    throw e;
  }
}

/** Rows of a SELECT as JSON objects (row_to_json via json_agg). */
export async function queryJson<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const out = await psql(`select coalesce(json_agg(t), '[]'::json) from (${sql}) t`);
  return JSON.parse(out || "[]") as T[];
}

/** Quote a literal for SQL. Only used with harness-owned values (ids). */
export function lit(v: string | number | null): string {
  if (v === null) return "null";
  if (typeof v === "number") return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}
