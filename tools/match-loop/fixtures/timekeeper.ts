/**
 * Timekeeper-mode fixtures (TEST-PLAN 4.2, M7). Every one of them except the
 * fourth account is scoped: it is undone when its scenario ends, and a run
 * that was killed half way is repaired before the next scenario runs, so a
 * flag-OFF scenario never runs with any of it in place. The flags, the
 * windows, the athlete columns and T17's invites are repaired at the next
 * run's start (`recoverFixtures`, from ONE restore record shared by every
 * worktree on this machine, since they all drive the same local stack). The
 * friendships are not in that record: the reset before every scenario
 * (`resetTimekeeperState`, flag-OFF scenarios included) removes every
 * `manual` friendship among the harness accounts.
 *
 *  - The `timekeeper_role` flag (and the `timekeeper_weight_check` sub-flag)
 *    is turned on ONLY around the creation of a timekeeper match
 *    (`withFlags`): the server snapshots the mode into the match at INSERT
 *    (jr_be 024 3.4) and never reads the flag again, so a window of a few
 *    seconds is all a timekeeper scenario needs, and the shared flag is
 *    never left on for a flag-OFF scenario (T11, the capability-mixed pair,
 *    holds it for its whole run so Blue's app reads it too). The previous
 *    values are written to a restore file BEFORE the flip, and an interrupt
 *    hook restores them.
 *  - The test-only windows (jr_be 024 6.4, `server_settings` keys `tk_*`
 *    read by `_tk_window`) shorten the sweep timers for T3, T4, T7, T8, T15,
 *    T16 and T18 (`withWindows`). Production never has these rows.
 *  - The sweep itself: `timekeeper_mode_tick()` runs every minute from
 *    pg_cron; the harness runs that same function as `postgres`
 *    (`runTimekeeperTick`) so a sweep scenario does not wait for the next
 *    minute. It only ever acts on timekeeper-mode matches.
 *  - Friendships between the four accounts, so the picker lists them
 *    (`withFriendships`); friends wear a FRIEND badge and sort first on the
 *    Arena, so they exist only while a timekeeper scenario runs.
 *  - Athlete columns a timekeeper scenario changes on the seeded accounts
 *    (`withAthleteColumns`): the AI consent the timekeeper bots record before
 *    an accept (TK-T7, TK-T8; it gates recording and uploads, so Green must
 *    not keep it into a flag-OFF scenario), Demo Blue's date of birth for
 *    T17's claim and the fourth account's `platform_role` for T8 (TK-N12
 *    goes to every admin and founder, and the seeded stack has none). The
 *    previous values are recorded BEFORE any change and put back afterwards.
 *  - The challenge invites T17's Red creates (`withInviteCleanup`): every
 *    challenge invite the inviter creates during the scenario is deleted
 *    afterwards, which also takes its booked match out of the inviter's
 *    weekly invite match cap (`_invite_weekly_matches_used` counts a match
 *    only through `challenges.invite_id`, which the delete nulls), out of the
 *    five open invites and out of the 20 a day `create_invite` allows. The
 *    inviter and the database time it started at are recorded BEFORE the
 *    first invite exists.
 *  - The fourth account (`ensureFourthAccount`), created once through the
 *    local auth API with the publishable key, like a real sign-up, and kept:
 *    it is the harness's own account, never seeded and never read by a
 *    flag-OFF scenario. Each timekeeper scenario re-activates it with no AI
 *    consent, so it asks for consent like Green does.
 *
 * LOCAL stack only: everything goes through `lib/psql.ts` (fixed local
 * target) and the publishable key (`assertBotKey`).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { FOURTH_ACCOUNT, type Config } from "../config";
import { makeClient } from "../bot/opponent";
import { onInterrupt } from "../lib/cleanup";
import { holderAlive, selfStarted, type ProcessRef } from "../lib/run-lock";
import { lit, psql, queryJson } from "../lib/psql";
import { EnvError, HarnessError, log, pollUntil } from "../lib/util";

export const TK_ROLE_FLAG = "timekeeper_role";
export const TK_WEIGHT_CHECK_FLAG = "timekeeper_weight_check";

/** The `server_settings` keys `_tk_window` reads (jr_be 024 6.4). */
export const TK_WINDOW_KEYS = [
  "tk_pick_deadline",
  "tk_request_lapse",
  "tk_offline_grace",
  "tk_offline_window",
  "tk_faceoff_window",
  "tk_pause_window",
  "tk_stall_window",
  "tk_edit_window",
] as const;
export type TkWindow = (typeof TK_WINDOW_KEYS)[number];

/**
 * Where an in-flight fixture records what to undo. One fixed path for every
 * worktree on this machine (outside any checkout): the worktrees share the
 * one local stack, so a run killed in one worktree must be repaired by the
 * next run in any other.
 */
export const RESTORE_FILE = join(homedir(), ".cache", "elorated-match-loop", "fixture-restore.json");

/** The athlete columns a timekeeper fixture may change (and so restore). */
export const ATHLETE_RESTORE_COLUMNS = ["date_of_birth", "ai_processing_consent_at", "ai_processing_consent_version", "platform_role"] as const;
export type AthleteColumn = (typeof ATHLETE_RESTORE_COLUMNS)[number];
/** What `record_ai_processing_consent` writes (jr_be 20261014300000). */
export const CONSENT_COLUMNS: readonly AthleteColumn[] = ["ai_processing_consent_at", "ai_processing_consent_version"];
/**
 * The platform role ladder (`member`, `admin`, `founder`; jr_be
 * 20260608000000). Written only as postgres: `guard_athlete_columns` reverts
 * it for `authenticated`. T8 makes the fourth account an admin for its run.
 */
export const PLATFORM_ROLE_COLUMNS: readonly AthleteColumn[] = ["platform_role"];

/** One athlete column to put back, with its value before the fixture (null for NULL). */
export interface AthleteRestore {
  id: string;
  column: AthleteColumn;
  value: string | null;
}

/**
 * Challenge invites to delete: every one `inviter` created at or after
 * `since` (the database's `now()` read before the first was created).
 */
export interface InviteRestore {
  inviter: string;
  since: string;
}

export interface RestoreRecord extends ProcessRef {
  /** Flags this process changed, with the value to put back. */
  flags: Record<string, boolean>;
  /** Window keys this process wrote (deleted on restore). */
  windows: string[];
  /** Athlete columns this process may have changed, with their original values. */
  athletes?: AthleteRestore[];
  /** Challenge invites this process may have created (deleted on restore). */
  invites?: InviteRestore[];
  at: string;
}

/** The restore record as it is now (null when there is none), for the scenarios' fixture oracles. */
export function readRestoreRecord(path = RESTORE_FILE): RestoreRecord | null {
  return readRestore(path);
}

function readRestore(path = RESTORE_FILE): RestoreRecord | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RestoreRecord;
  } catch {
    return { flags: {}, windows: [...TK_WINDOW_KEYS], pid: 0, at: "unreadable" };
  }
}

function writeRestore(r: RestoreRecord, path = RESTORE_FILE): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(r, null, 2));
}

function isEmpty(r: RestoreRecord): boolean {
  return Object.keys(r.flags).length === 0 && r.windows.length === 0 && (r.athletes ?? []).length === 0 && (r.invites ?? []).length === 0;
}

/** Drop what was just restored from the record; remove the file once nothing is left. */
function settleRestore(drop: (r: RestoreRecord) => void, path = RESTORE_FILE): void {
  const rec = readRestore(path);
  if (!rec) return;
  drop(rec);
  if (isEmpty(rec)) rmSync(path, { force: true });
  else writeRestore(rec, path);
}

const sameCell = (a: Pick<AthleteRestore, "id" | "column">, b: Pick<AthleteRestore, "id" | "column">) => a.id === b.id && a.column === b.column;
const sameInvites = (a: InviteRestore, b: InviteRestore) => a.inviter === b.inviter && a.since === b.since;

/**
 * Merge into the restore record; an existing entry keeps its ORIGINAL
 * value. The record names this process (`self`: its pid and start time), so
 * the next run can tell a run still in flight from one that is gone.
 */
export function mergeRestore(
  prev: RestoreRecord | null,
  add: { flags?: Record<string, boolean>; windows?: string[]; athletes?: AthleteRestore[]; invites?: InviteRestore[] },
  self: ProcessRef = { pid: process.pid, started: selfStarted() },
): RestoreRecord {
  const flags = { ...(add.flags ?? {}), ...(prev?.flags ?? {}) };
  const windows = [...new Set([...(prev?.windows ?? []), ...(add.windows ?? [])])];
  const athletes = [...(prev?.athletes ?? [])];
  for (const a of add.athletes ?? []) if (!athletes.some((x) => sameCell(x, a))) athletes.push(a);
  const invites = [...(prev?.invites ?? [])];
  for (const i of add.invites ?? []) if (!invites.some((x) => sameInvites(x, i))) invites.push(i);
  return { flags, windows, athletes, invites, pid: self.pid, started: self.started ?? null, at: new Date().toISOString() };
}

/**
 * Where a scoped fixture runs its SQL and records what to undo. A run
 * always uses `LOCAL_SQL_IO` (`psql` against the local stack and the one
 * shared restore record); tests pass their own so the lifecycle (record
 * first, undo in the finally, the hook kept when the undo fails) runs
 * without a database.
 */
export interface SqlIo {
  exec(sql: string): Promise<string>;
  restorePath: string;
}

export const LOCAL_SQL_IO: SqlIo = { exec: (sql) => psql(sql), restorePath: RESTORE_FILE };

/**
 * Whether the run that wrote a restore record is still running (so its
 * fixtures are in flight, not left behind): the run lock's own check.
 */
export { holderAlive };

// --- flags ----------------------------------------------------------------------

/** SQL setting each flag (pure, for tests). Keys and values are harness constants. */
export function setFlagsSql(values: Record<string, boolean>): string {
  const keys = Object.keys(values);
  if (keys.length === 0) return "select 0";
  const sets = keys.map((k) => `update public.feature_flags set enabled = ${values[k] ? "true" : "false"} where key = ${lit(k)};`).join("\n");
  return `begin;\n${sets}\nselect count(*) from public.feature_flags where key in (${keys.map(lit).join(", ")});\ncommit;`;
}

export async function readFlags(keys: string[]): Promise<Record<string, boolean | null>> {
  const rows = await queryJson<{ key: string; enabled: boolean }>(
    `select key, enabled from public.feature_flags where key in (${keys.map(lit).join(", ")})`,
  );
  const out: Record<string, boolean | null> = {};
  for (const k of keys) out[k] = rows.find((r) => r.key === k)?.enabled ?? null;
  return out;
}

async function setFlags(values: Record<string, boolean>, exec: SqlIo["exec"] = psql): Promise<void> {
  const out = await exec(setFlagsSql(values));
  const n = Number(out.split("\n").pop());
  if (n !== Object.keys(values).length) {
    throw new EnvError(`feature_flags is missing one of ${Object.keys(values).join(", ")} (found ${n})`);
  }
}

/** A fixture's trace note (`ctx.trace.note("harness", what, payload)`). */
type Note = (what: string, payload: unknown) => void;

/** Put-backs that failed after their scenario had already failed, by the scenario's error. */
const putBacksAfterFailure = new WeakMap<object, string[]>();

function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

/**
 * The fixture put-backs that failed after the scenario had already failed,
 * as `<fixture>: <error>`, or none (any other error, or none at all). The
 * runner writes them into the scenario's result next to its own error
 * (`putBackFailures` in `lib/results.ts`).
 */
export function putBackFailures(error: unknown): string[] {
  return error !== null && typeof error === "object" ? [...(putBacksAfterFailure.get(error) ?? [])] : [];
}

/**
 * Run a fixture's body, then its put-back whatever the body did (every
 * fixture below; M7 review). When both fail, the body's error is still the
 * scenario's failure and is rethrown unchanged, so the run records its
 * status, its error and its fingerprint exactly as if the put-back had
 * worked: a psql hiccup on the way out never renames an app failure, and
 * never breaks the match with a known bead (PM30 (5) triage). The put-back's
 * failure is not lost: the put-back's own `*_failed` note is in the trace,
 * `<fixture>_body_error` names the error it would have hidden, the scenario's
 * result lists it (`putBackFailures`), and the fixture's interrupt hook and
 * restore record stay, so the run's exit or the next run's start puts it
 * back. When only the put-back fails, its error is thrown, as before.
 */
async function bodyThenPutBack<T>(fixture: string, body: () => Promise<T>, putBack: () => Promise<void>, note?: Note): Promise<T> {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: await body() };
  } catch (e) {
    outcome = { ok: false, error: e };
  }
  try {
    await putBack();
  } catch (e) {
    if (outcome.ok) throw e;
    note?.(`${fixture}_body_error`, { error: errorText(outcome.error) });
    if (outcome.error !== null && typeof outcome.error === "object") {
      putBacksAfterFailure.set(outcome.error, [...putBackFailures(outcome.error), `${fixture}: ${errorText(e)}`]);
    }
    throw outcome.error;
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

/**
 * Where a flag window reads and writes the flags and records what to put
 * back. A run always uses `LOCAL_FLAG_IO` (the local stack and the one
 * shared restore record); tests pass their own so a failing write can be
 * exercised without a database.
 */
export interface FlagIo {
  read(keys: string[]): Promise<Record<string, boolean | null>>;
  write(values: Record<string, boolean>): Promise<void>;
  restorePath: string;
}

export const LOCAL_FLAG_IO: FlagIo = { read: readFlags, write: setFlags, restorePath: RESTORE_FILE };

/** Flags this process holds on (a scenario window or the run-level `--tk-flag-on`). */
const held = new Map<string, boolean>();

/**
 * What a flag window must do (pure, for tests): the keys to flip, or a
 * refusal. `timekeeper_role` ON that this process does not hold means
 * somebody turned it on by hand on the shared stack, and a timekeeper
 * scenario would leave it on (or turn it off under them): refuse.
 */
export function planFlagWindow(
  want: Record<string, boolean>,
  current: Record<string, boolean | null>,
  holding: ReadonlyMap<string, boolean>,
): { flip: Record<string, boolean>; restore: Record<string, boolean> } | { refuse: string } {
  const flip: Record<string, boolean> = {};
  const restore: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(want)) {
    const cur = current[k];
    if (cur === null || cur === undefined) return { refuse: `feature flag ${k} does not exist on the local stack` };
    if (k === TK_ROLE_FLAG && cur && holding.get(k) !== true) {
      return { refuse: `${TK_ROLE_FLAG} is ON on the shared local stack and this run did not turn it on; it must stay off outside a timekeeper match's creation (turn it off, then re-run)` };
    }
    if (cur === v) continue;
    flip[k] = v;
    restore[k] = cur;
  }
  return { flip, restore };
}

/**
 * Put the flags back, then stop holding them, whatever the write does. A
 * restore that throws leaves the flags unheld but its interrupt hook and
 * its restore record in place (the caller unhooks only after a restore
 * that worked): from then on the leftover ON reads as foreign, so the next
 * window, `holdFlagForRun` and `tkScenario` refuse it instead of running a
 * flag-OFF scenario with the shared flag on, and the run's exit or the next
 * run's start puts it back.
 */
async function releaseHeld(keys: readonly string[], restore: Record<string, boolean>, io: FlagIo): Promise<void> {
  try {
    await restoreFlags(restore, io);
  } finally {
    for (const k of keys) held.delete(k);
  }
}

/**
 * Run `fn` with the flags set to `want`, then put back every flag this call
 * changed, whatever happens. A flag already at the wanted value (for example
 * held by the run-level `--tk-flag-on`) is left alone. When the put-back
 * itself fails its error propagates (see `releaseHeld`), unless `fn` had
 * failed first: then `fn`'s error does (`bodyThenPutBack`).
 */
export async function withFlags<T>(
  want: Record<string, boolean>,
  fn: () => Promise<T>,
  note?: Note,
  io: FlagIo = LOCAL_FLAG_IO,
): Promise<T> {
  const current = await io.read(Object.keys(want));
  const plan = planFlagWindow(want, current, held);
  if ("refuse" in plan) throw new EnvError(plan.refuse);
  const keys = Object.keys(plan.flip);
  if (keys.length === 0) return fn();
  writeRestore(mergeRestore(readRestore(io.restorePath), { flags: plan.restore }), io.restorePath);
  const unhook = onInterrupt("restore-tk-flags", () => restoreFlags(plan.restore, io));
  for (const k of keys) held.set(k, plan.flip[k]);
  note?.("flag_window_open", plan.flip);
  return bodyThenPutBack(
    "flag_window",
    async () => {
      await io.write(plan.flip);
      return fn();
    },
    async () => {
      try {
        await releaseHeld(keys, plan.restore, io);
      } catch (e) {
        note?.("flag_restore_failed", { restore: plan.restore, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      unhook();
      note?.("flag_window_closed", plan.restore);
    },
    note,
  );
}

async function restoreFlags(restore: Record<string, boolean>, io: FlagIo): Promise<void> {
  if (Object.keys(restore).length === 0) return;
  await io.write(restore);
  settleRestore((rec) => {
    for (const k of Object.keys(restore)) delete rec.flags[k];
  }, io.restorePath);
}

/**
 * Hold `timekeeper_role` ON for a whole run (`--tk-flag-on`: the flag-OFF
 * tiers once more with the flag on and the bots sending no capability
 * header, TEST-PLAN 4.1 and PLAN 5 Wave 3 step 3). Returns the release,
 * which stops holding the flag even when the put-back fails (`releaseHeld`).
 */
export async function holdFlagForRun(io: FlagIo = LOCAL_FLAG_IO): Promise<() => Promise<void>> {
  const current = await io.read([TK_ROLE_FLAG]);
  const plan = planFlagWindow({ [TK_ROLE_FLAG]: true }, current, held);
  if ("refuse" in plan) throw new EnvError(plan.refuse);
  writeRestore(mergeRestore(readRestore(io.restorePath), { flags: plan.restore }), io.restorePath);
  const unhook = onInterrupt("restore-tk-flag-run", () => restoreFlags(plan.restore, io));
  held.set(TK_ROLE_FLAG, true);
  try {
    await io.write(plan.flip);
  } catch (e) {
    // Unknown state: not held, so a leftover ON reads as foreign; the hook
    // and the record stay for the exit and the next start.
    held.delete(TK_ROLE_FLAG);
    throw e;
  }
  log(`${TK_ROLE_FLAG} held ON for this run (capability-mixed run)`);
  return async () => {
    await releaseHeld([TK_ROLE_FLAG], plan.restore, io);
    unhook();
    log(`${TK_ROLE_FLAG} restored to ${JSON.stringify(plan.restore)}`);
  };
}

/** The current value of `timekeeper_role` and whether this process holds it. */
export async function timekeeperFlagState(io: Pick<FlagIo, "read"> = LOCAL_FLAG_IO): Promise<{ enabled: boolean | null; heldByThisRun: boolean }> {
  const v = (await io.read([TK_ROLE_FLAG]))[TK_ROLE_FLAG];
  return { enabled: v, heldByThisRun: held.get(TK_ROLE_FLAG) === true };
}

/**
 * Why a `timekeeper_role` read is not the state every run starts from, or
 * null when it is (pure, for tests). Off, or held by this process, is fine;
 * so is no flag row at all (a stack from before jr_be #38, where nothing can
 * read it). ON that this run did not set is the problem, whatever else the
 * stack has: the check fails closed, it never depends on another table.
 */
export function roleOffProblem(enabled: boolean | null, heldByThisRun: boolean): string | null {
  if (enabled !== true || heldByThisRun) return null;
  return `${TK_ROLE_FLAG} is ON on the shared local stack and no match-loop run set it (nothing to restore in ${RESTORE_FILE}); turn it off before running`;
}

/**
 * Why the shared `timekeeper_role` is not in the state every run starts
 * from (off, and not held by this process), or null when it is. Checked at
 * every runner start, after `recoverFixtures`, and by preflight, whenever
 * the flag's row exists. Never auto-fixed: the harness does not change a
 * flag it did not set.
 */
export async function timekeeperRoleOffProblem(): Promise<string | null> {
  const { enabled, heldByThisRun } = await timekeeperFlagState();
  return roleOffProblem(enabled, heldByThisRun);
}

// --- windows ----------------------------------------------------------------------

/** Upsert SQL for the windows, in seconds (pure, for tests). */
export function windowsSql(windows: Partial<Record<TkWindow, number>>): string {
  const rows = Object.entries(windows).map(([k, secs]) => {
    if (!(TK_WINDOW_KEYS as readonly string[]).includes(k)) throw new HarnessError(`unknown timekeeper window ${k}`);
    if (!(typeof secs === "number" && Number.isFinite(secs) && secs > 0)) throw new HarnessError(`window ${k} must be a positive number of seconds`);
    return `(${lit(k)}, jsonb_build_object('seconds', ${Math.round(secs)}))`;
  });
  if (rows.length === 0) return "select 0";
  return `insert into public.server_settings (key, value) values ${rows.join(", ")}
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

/** SQL removing the given window keys (pure, for tests); only `tk_*` keys. */
export function clearWindowsSql(keys: readonly string[]): string {
  const ok = keys.filter((k) => (TK_WINDOW_KEYS as readonly string[]).includes(k));
  if (ok.length === 0) return "select 0";
  return `delete from public.server_settings where key in (${ok.map(lit).join(", ")})`;
}

/**
 * Run `fn` with shortened sweep windows (seconds), removed afterwards. The
 * keys go to the restore record BEFORE the upsert; the finally removes them
 * and settles the record whatever `fn` did. When the removal itself fails
 * the error propagates (`fn`'s instead, when `fn` had failed first:
 * `bodyThenPutBack`) and the interrupt hook and the record stay, so the
 * run's exit or the next run's start removes them (like `withFlags`).
 */
export async function withWindows<T>(
  windows: Partial<Record<TkWindow, number>>,
  fn: () => Promise<T>,
  note?: Note,
  io: SqlIo = LOCAL_SQL_IO,
): Promise<T> {
  const keys = Object.keys(windows);
  if (keys.length === 0) return fn();
  const upsert = windowsSql(windows); // refuses an unknown key or a bad value before anything is recorded
  writeRestore(mergeRestore(readRestore(io.restorePath), { windows: keys }), io.restorePath);
  const clear = async () => {
    await io.exec(clearWindowsSql(keys));
    settleRestore((rec) => {
      rec.windows = rec.windows.filter((k) => !keys.includes(k));
    }, io.restorePath);
  };
  const unhook = onInterrupt("clear-tk-windows", clear);
  note?.("windows_set", windows);
  return bodyThenPutBack(
    "windows",
    async () => {
      await io.exec(upsert);
      return fn();
    },
    async () => {
      try {
        await clear();
      } catch (e) {
        note?.("windows_clear_failed", { keys, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      unhook();
      note?.("windows_cleared", keys);
    },
    note,
  );
}

// --- athlete columns ----------------------------------------------------------------------

function assertColumn(c: string): asserts c is AthleteColumn {
  if (!(ATHLETE_RESTORE_COLUMNS as readonly string[]).includes(c)) throw new HarnessError(`not a restorable athlete column: ${c}`);
}

/** SQL setting athlete columns, to restore or to set them (pure, for tests); only the allowlisted columns. */
export function athleteColumnsSql(rows: readonly AthleteRestore[]): string {
  if (rows.length === 0) return "select 0";
  const sets = rows.map((r) => {
    assertColumn(r.column);
    return `update public.athletes set ${r.column} = ${lit(r.value)} where id = ${lit(r.id)};`;
  });
  return `begin;\n${sets.join("\n")}\ncommit;`;
}

async function readAthleteColumns(ids: readonly string[], columns: readonly AthleteColumn[]): Promise<AthleteRestore[]> {
  if (ids.length === 0 || columns.length === 0) return [];
  for (const c of columns) assertColumn(c);
  const rows = await queryJson<Record<string, string | null> & { id: string }>(
    `select id, ${columns.map((c) => `${c}::text as ${c}`).join(", ")} from public.athletes where id in (${ids.map(lit).join(", ")})`,
  );
  return rows.flatMap((r) => columns.map((column) => ({ id: r.id, column, value: r[column] ?? null })));
}

/**
 * The `set` columns `withAthleteColumns` would write but not restore
 * (pure, for tests): every column it writes must be one it records first,
 * or the write would outlive the scenario (never in the restore record, so
 * neither the finally nor `recoverFixtures` would put it back).
 */
export function unrestoredSetColumns(columns: readonly AthleteColumn[], set: Partial<Record<AthleteColumn, string>>): string[] {
  return Object.keys(set).filter((c) => !(columns as readonly string[]).includes(c));
}

/**
 * Where `withAthleteColumns` reads the original values, runs its writes and
 * restores, and records what to undo. A run always uses `LOCAL_ATHLETE_IO`
 * (the local stack and the one shared restore record); tests pass their own
 * so the lifecycle runs without a database, like `withWindows`.
 */
export interface AthleteColumnIo extends SqlIo {
  read(ids: readonly string[], columns: readonly AthleteColumn[]): Promise<AthleteRestore[]>;
}

export const LOCAL_ATHLETE_IO: AthleteColumnIo = { ...LOCAL_SQL_IO, read: readAthleteColumns };

/**
 * Run `fn`, then put `columns` of each athlete back to the values they had
 * before it, whatever `fn` (or a bot inside it) changed; `set` writes new
 * values first, only to columns in `columns` (any other is refused before
 * anything is read or written). The originals go to the restore record
 * BEFORE anything changes, so an interrupt hook and the next run's start
 * repair a killed run. The finally restores and settles the record whatever
 * `fn` (or the `set` write) did; when the restore itself fails the error
 * propagates (`fn`'s instead, when `fn` had failed first:
 * `bodyThenPutBack`) and the hook and the record stay, so the run's exit or
 * the next run's start puts the columns back (like `withWindows`).
 */
export async function withAthleteColumns<T>(
  ids: readonly string[],
  columns: readonly AthleteColumn[],
  fn: () => Promise<T>,
  set: Partial<Record<AthleteColumn, string>> = {},
  io: AthleteColumnIo = LOCAL_ATHLETE_IO,
  note?: Note,
): Promise<T> {
  const unrestored = unrestoredSetColumns(columns, set);
  if (unrestored.length) {
    throw new HarnessError(`withAthleteColumns would set ${unrestored.join(", ")} without restoring it: add it to the recorded columns (${columns.join(", ")})`);
  }
  const original = await io.read(ids, columns);
  if (original.length === 0) return fn();
  writeRestore(mergeRestore(readRestore(io.restorePath), { athletes: original }), io.restorePath);
  const restore = async () => {
    await io.exec(athleteColumnsSql(original));
    settleRestore((rec) => {
      rec.athletes = (rec.athletes ?? []).filter((a) => !original.some((o) => sameCell(o, a)));
    }, io.restorePath);
  };
  const unhook = onInterrupt(`restore-athletes-${original.map((o) => `${o.id}:${o.column}`).join(",")}`, restore);
  return bodyThenPutBack(
    "athlete_columns",
    async () => {
      const writes = Object.entries(set).flatMap(([column, value]) => ids.map((id) => ({ id, column: column as AthleteColumn, value: value ?? null })));
      if (writes.length) await io.exec(athleteColumnsSql(writes));
      return fn();
    },
    async () => {
      try {
        await restore();
      } catch (e) {
        note?.("athlete_columns_restore_failed", { athletes: original, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      unhook();
    },
    note,
  );
}

// --- challenge invites (T17) ----------------------------------------------------------------

/**
 * The limits `create_invite` enforces per inviter (jr_be 20261001100100,
 * 20261008200300; the claim refuses `inviter_weekly_cap` at the same
 * weekly count). T17's Red is the inviter, so a stack where Red already
 * reached one cannot run T17 for reasons that are not an app defect.
 */
export const INVITE_LIMITS = {
  /** Matches booked through Red's invites in 7 days (`_invite_weekly_matches_used`, HINT `weekly_invite_match_cap`). */
  weeklyMatches: 3,
  /** Open challenge invites with a live link (HINT `too_many_open_invites`). */
  openInvites: 5,
  /** Challenge invites created in 24 hours (HINT `daily_invite_limit`). */
  dailyInvites: 20,
} as const;

export interface InviteCounts {
  weeklyMatches: number;
  openInvites: number;
  dailyInvites: number;
}

/** SQL reading the inviter's three counts the way `create_invite` does (pure, for tests). */
export function inviteCountsSql(inviter: string): string {
  const me = lit(inviter);
  return `select public._invite_weekly_matches_used(${me}) as "weeklyMatches",
      (select count(*)::int from public.invites where inviter_id = ${me} and kind = 'challenge'
         and status = 'open' and link_expires_at > now()) as "openInvites",
      (select count(*)::int from public.invites where inviter_id = ${me} and kind = 'challenge'
         and created_at > now() - interval '24 hours') as "dailyInvites"`;
}

/** Which invite limit an inviter has reached, named with its HINT, or null (pure, for tests). */
export function inviteCapProblem(c: InviteCounts, who = "the inviter"): string | null {
  const hit: string[] = [];
  if (c.weeklyMatches >= INVITE_LIMITS.weeklyMatches) {
    hit.push(`weekly_invite_match_cap (${c.weeklyMatches} invite matches in 7 days, cap ${INVITE_LIMITS.weeklyMatches}; it clears 7 days after the oldest)`);
  }
  if (c.openInvites >= INVITE_LIMITS.openInvites) hit.push(`too_many_open_invites (${c.openInvites} open, cap ${INVITE_LIMITS.openInvites})`);
  if (c.dailyInvites >= INVITE_LIMITS.dailyInvites) hit.push(`daily_invite_limit (${c.dailyInvites} in 24 hours, cap ${INVITE_LIMITS.dailyInvites})`);
  return hit.length ? `${who} has reached ${hit.join(" and ")}; create_invite would refuse, which is not an app defect` : null;
}

/** The inviter's counts on the local stack. */
export async function readInviteCounts(inviter: string): Promise<InviteCounts> {
  const row = (await queryJson<InviteCounts>(inviteCountsSql(inviter)))[0];
  return { weeklyMatches: row?.weeklyMatches ?? 0, openInvites: row?.openInvites ?? 0, dailyInvites: row?.dailyInvites ?? 0 };
}

/**
 * SQL deleting the challenge invites each entry covers, returning how many
 * (pure, for tests). The foreign keys do the rest: the booking's
 * `challenges.invite_id` is set null (so `_invite_weekly_matches_used`, which
 * joins through it, no longer counts the booked match), and so are the
 * invite events, attribution, friendship and notification references; the
 * claim's presence readings go with it. The booked challenge and its match
 * stay, as every other scenario's matches do. A data-modifying statement
 * cannot sit in a FROM subquery, so the DELETE is a CTE.
 */
export function inviteCleanupSql(entries: readonly InviteRestore[]): string {
  if (entries.length === 0) return "select 0";
  const scope = entries.map((e) => `(inviter_id = ${lit(e.inviter)} and created_at >= ${lit(e.since)}::timestamptz)`).join(" or ");
  return `with gone as (
      delete from public.invites where kind = 'challenge' and (${scope}) returning id
    ) select count(*) from gone`;
}

/**
 * Run `fn` (T17), then delete every challenge invite `inviter` created
 * meanwhile, whatever happened (see `inviteCleanupSql`). The inviter and the
 * database time go to the restore record BEFORE `fn` runs, so an interrupt
 * hook and the next run's start delete them after a killed run too.
 */
export async function withInviteCleanup<T>(
  inviter: string,
  fn: () => Promise<T>,
  note?: Note,
  io: SqlIo = LOCAL_SQL_IO,
): Promise<T> {
  const since = (await io.exec("select now()::text")).trim();
  if (!since) throw new EnvError("could not read the database time for the invite cleanup");
  const entry: InviteRestore = { inviter, since };
  writeRestore(mergeRestore(readRestore(io.restorePath), { invites: [entry] }), io.restorePath);
  const clean = async () => {
    const n = (await io.exec(inviteCleanupSql([entry]))).trim();
    settleRestore((rec) => {
      rec.invites = (rec.invites ?? []).filter((i) => !sameInvites(i, entry));
    }, io.restorePath);
    return n;
  };
  const unhook = onInterrupt(`delete-tk-invites-${inviter}`, async () => void (await clean()));
  return bodyThenPutBack(
    "invites",
    fn,
    async () => {
      let deleted: string;
      try {
        deleted = await clean();
      } catch (e) {
        note?.("invites_cleanup_failed", { inviter, since, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      unhook();
      note?.("invites_deleted", { inviter, since, deleted: Number(deleted) });
    },
    note,
  );
}

// --- recovery ---------------------------------------------------------------------------

/**
 * Undo what a killed run left behind: flags back to the recorded values,
 * the recorded windows removed, the recorded athlete columns put back and
 * the recorded challenge invites deleted. Runs at every runner start, from
 * the one record every worktree shares. Refuses while the run that wrote
 * the record is still running (its fixtures are in flight, not left
 * behind). Returns what it did (empty when there was nothing to do). Tests
 * pass their own `exec` and `alive`.
 */
export async function recoverFixtures(
  path = RESTORE_FILE,
  opts: { exec?: SqlIo["exec"]; alive?: (ref: ProcessRef) => boolean } = {},
): Promise<string[]> {
  const { exec = psql, alive = (ref: ProcessRef) => holderAlive(ref) } = opts;
  const rec = readRestore(path);
  if (!rec) return [];
  if (alive({ pid: rec.pid, started: rec.started })) {
    throw new EnvError(
      `another match-loop run (pid ${rec.pid}) holds timekeeper fixtures (${path}); wait for it to finish (one run at a time on the shared stack), or remove the file if no run is in flight`,
    );
  }
  const done: string[] = [];
  if (Object.keys(rec.flags).length) {
    await setFlags(rec.flags, exec);
    done.push(`flags restored ${JSON.stringify(rec.flags)}`);
  }
  if (rec.windows.length) {
    await exec(clearWindowsSql(rec.windows));
    done.push(`windows cleared ${rec.windows.join(",")}`);
  }
  if (rec.athletes?.length) {
    await exec(athleteColumnsSql(rec.athletes));
    done.push(`athlete columns restored ${rec.athletes.map((a) => `${a.id}.${a.column}`).join(",")}`);
  }
  if (rec.invites?.length) {
    const n = (await exec(inviteCleanupSql(rec.invites))).trim();
    done.push(`challenge invites deleted (${n}) ${rec.invites.map((i) => `${i.inviter} since ${i.since}`).join(",")}`);
  }
  rmSync(path, { force: true });
  return done;
}

// --- the sweep ------------------------------------------------------------------------

/** Run the per-minute sweep once, now (the cron job's own body, as postgres). */
export async function runTimekeeperTick(): Promise<string> {
  return psql("select public.timekeeper_mode_tick()::text");
}

// --- friendships -----------------------------------------------------------------------

/** Every unordered pair, canonical (`athlete_a < athlete_b`, the table's CHECK). Pure. */
export function friendshipPairs(ids: readonly string[]): [string, string][] {
  const uniq = [...new Set(ids)].sort();
  const out: [string, string][] = [];
  for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) out.push([uniq[i], uniq[j]]);
  return out;
}

/**
 * SQL inserting the missing friendships (source `manual`) and returning the
 * rows it created as one JSON array (pure, for tests). A data-modifying
 * statement cannot sit in a FROM subquery (`queryJson`'s wrapper), so the
 * INSERT is a CTE.
 */
export function addFriendshipsSql(pairs: readonly [string, string][]): string {
  return `with ins as (
      insert into public.athlete_friendships (athlete_a, athlete_b, source)
      values ${pairs.map(([a, b]) => `(${lit(a)}::uuid, ${lit(b)}::uuid, 'manual')`).join(", ")}
      on conflict do nothing returning athlete_a, athlete_b
    ) select coalesce(json_agg(ins), '[]'::json) from ins`;
}

/** Insert the missing friendships between `ids` (source `manual`); returns the pairs this call created. */
export async function addFriendships(ids: readonly string[]): Promise<[string, string][]> {
  const pairs = friendshipPairs(ids);
  if (pairs.length === 0) return [];
  const rows = JSON.parse((await psql(addFriendshipsSql(pairs))) || "[]") as { athlete_a: string; athlete_b: string }[];
  return rows.map((r) => [r.athlete_a, r.athlete_b]);
}

export async function removeFriendships(pairs: readonly [string, string][]): Promise<void> {
  if (pairs.length === 0) return;
  await psql(
    `delete from public.athlete_friendships where source = 'manual' and (athlete_a, athlete_b) in (${pairs
      .map(([a, b]) => `(${lit(a)}::uuid, ${lit(b)}::uuid)`)
      .join(", ")})`,
  );
}

/**
 * Friendships among `ids` for the duration of `fn` (only the ones this call
 * added are removed). Not in the restore record: a run killed before the
 * finally leaves them to the next scenario's reset (`timekeeperResetSql`
 * removes every `manual` friendship among the harness accounts), which runs
 * before any scenario, flag-OFF ones included. A failed removal is noted
 * (`friendships_remove_failed`) and keeps the interrupt hook for the run's
 * exit, like every other fixture's put-back (`bodyThenPutBack`).
 */
export async function withFriendships<T>(ids: readonly string[], fn: () => Promise<T>, note?: Note): Promise<T> {
  const added = await addFriendships(ids);
  const unhook = onInterrupt("remove-tk-friendships", () => removeFriendships(added));
  return bodyThenPutBack(
    "friendships",
    fn,
    async () => {
      try {
        await removeFriendships(added);
      } catch (e) {
        note?.("friendships_remove_failed", { pairs: added, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      unhook();
    },
    note,
  );
}

// --- the fourth account ----------------------------------------------------------------

async function athleteIdByEmail(email: string): Promise<string | null> {
  const rows = await queryJson<{ id: string }>(
    `select a.id from public.athletes a join auth.users u on u.id = a.auth_user_id where u.email = ${lit(email)}`,
  );
  return rows[0]?.id ?? null;
}

/**
 * Activation SQL for the fourth account (pure, for tests): an active, human,
 * 170 lbs free agent with no AI consent yet, so as a timekeeper bot it
 * records consent before its accept like Green does (TK-T7, TK-T8).
 */
export function activateFourthSql(id: string, displayName: string): string {
  const [first, ...rest] = displayName.split(" ");
  return `update public.athletes set display_name = ${lit(displayName)}, first_name = ${lit(first)},
      last_name = ${lit(rest.join(" ") || first)}, current_weight = 170, free_agent = true, is_bot = false,
      status = 'active', looking_for_ranked = false, looking_for_casual = false,
      ai_processing_consent_at = null, ai_processing_consent_version = null
    where id = ${lit(id)}`;
}

/**
 * The fourth account (Demo Gold), the second timekeeper bot for re-picks
 * (T2, T5). The seed provisions only Blue, Red and Green, so it is created
 * here, once, through the local auth API's public sign-up with the
 * publishable key and the seed password (the local stack confirms
 * immediately), then activated as `postgres`. Idempotent; returns its id.
 */
export async function ensureFourthAccount(cfg: Config, password: string): Promise<string> {
  let id = await athleteIdByEmail(cfg.emails.gold);
  if (!id) {
    const client = makeClient(cfg);
    const [first, ...rest] = cfg.names.gold.split(" ");
    const { error } = await client.auth.signUp({
      email: cfg.emails.gold,
      password,
      options: { data: { display_name: cfg.names.gold, first_name: first, last_name: rest.join(" ") } },
    });
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.realtime.disconnect();
    if (error && !/already registered/i.test(error.message)) {
      throw new EnvError(`could not create the fourth account ${cfg.emails.gold}: ${error.message}`);
    }
    id = await pollUntil(`athlete row for ${cfg.emails.gold}`, () => athleteIdByEmail(cfg.emails.gold).then((v) => v ?? undefined), {
      timeoutMs: 10_000,
      intervalMs: 300,
    }).catch(() => null);
    if (!id) throw new EnvError(`no athlete row for ${cfg.emails.gold} after sign-up (handle_new_user)`);
    log(`created the fourth account ${cfg.emails.gold}`);
  }
  await psql(activateFourthSql(id, cfg.names.gold));
  return id;
}

// --- reset hygiene ------------------------------------------------------------------------

/**
 * Timekeeper-mode leftovers involving the harness accounts, cleared before
 * every scenario (`resetFixtures`). A no-op on a clean stack, so the
 * flag-OFF tiers see exactly the state they always did:
 *  - a stranded timekeeper match the athlete reset cannot see (one where a
 *    harness account is only the TIMEKEEPER) is cancelled;
 *  - open seat history rows of the harness accounts' cancelled matches are
 *    closed (`match_cancelled`, not a drop-out) and their presence removed;
 *  - pending timekeeper requests to or from a harness account are cancelled
 *    (a pending request keeps its invitee off every picker);
 *  - the test-only `tk_*` windows are removed (production never has them;
 *    only where `server_settings` exists, jr_be #40);
 *  - `manual` friendships among the harness accounts are removed (a
 *    timekeeper scenario's own cleanup normally did that already).
 */
export function timekeeperResetSql(ids: readonly string[]): string {
  const all = ids.map(lit).join(", ");
  return `
    begin;
    update public.matches set status = 'cancelled'
      where requires_timekeeper and status in ('pending', 'in_progress') and timekeeper_id in (${all});
    update public.match_timekeeper_history h set left_at = now(), left_reason = 'match_cancelled'
      from public.matches m
      where h.match_id = m.id and h.left_at is null and m.status = 'cancelled' and h.timekeeper_id in (${all});
    delete from public.match_timekeeper_presence p using public.matches m
      where p.match_id = m.id and m.status = 'cancelled' and p.timekeeper_id in (${all});
    update public.match_timekeeper_requests set status = 'cancelled', responded_at = now()
      where status = 'pending' and (invitee_id in (${all}) or requested_by in (${all}));
    do $tk$ begin
      if to_regclass('public.server_settings') is not null then
        ${clearWindowsSql(TK_WINDOW_KEYS)};
      end if;
    end $tk$;
    delete from public.athlete_friendships
      where source = 'manual' and athlete_a in (${all}) and athlete_b in (${all});
    commit;`;
}

/**
 * Whether the stack has the timekeeper-mode tables (jr_be 024, BE-A), which
 * the reset hygiene touches. Only that: the `server_settings` table (#40) is
 * guarded inside the reset itself, and the flag check never depends on
 * either (`timekeeperRoleOffProblem`).
 */
export async function hasTimekeeperSchema(): Promise<boolean> {
  const out = await psql("select (to_regclass('public.match_timekeeper_requests') is not null)::text");
  return out.trim() === "true";
}

/**
 * Clear timekeeper-mode leftovers for the harness accounts (the three ids
 * plus the fourth, when it exists). Nothing to do on a stack without the
 * timekeeper-mode schema.
 */
export async function resetTimekeeperState(ids: readonly string[], fourthEmail: string = FOURTH_ACCOUNT.email): Promise<void> {
  if (!(await hasTimekeeperSchema())) return;
  const fourth = await athleteIdByEmail(fourthEmail);
  await psql(timekeeperResetSql(fourth ? [...ids, fourth] : ids));
}
