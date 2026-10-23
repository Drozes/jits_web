/**
 * Match-loop runner.
 *
 *   npm run match-loop -- [--tier core|extended|timekeeper|all] [--only C1,C3] [--repeat N]
 *                         [--fidelity strict|lenient] [--timing human|fast]
 *                         [--rerun-failures N] [--preflight | --preflight-only]
 *                         [--signin-blue] [--no-typecheck] [--tk-flag-on] [--no-pending]
 *
 * `--tier all` is core plus extended (the flag-OFF guard); the timekeeper
 * tier runs only with `--tier timekeeper` or `--only`.
 *
 * `--tk-flag-on` holds `timekeeper_role` ON for the whole run (restored at
 * the end, on Ctrl-C, and by the next run's start if this one is killed):
 * the flag-OFF tiers once more with the flag on and the bots sending no
 * capability header (TEST-PLAN 4.1, PLAN 5 Wave 3 step 3). The app is
 * closed after the flag is set and again after it is restored, so it reads
 * the flag at its next launch. A timekeeper
 * scenario whose slices are not yet in the build (read from the app source,
 * scenarios/timekeeper/integration.ts) is recorded `pending` and not run;
 * that fails the run on a build with M8 (every slice must be in by then)
 * and always with `--no-pending` (the Wave 3 gate).
 *
 * Writes tools/match-loop/.runs/<iso>/result.json (plus per-scenario folders
 * with screenshots, trace.jsonl, device.log) and appends a line to
 * .runs/history.jsonl. Exits non-zero when any scenario is fail,
 * harness_error or env_error (`known` and `flake` do not fail the run).
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, loadPassword, resolveAthleteIds, RUNS_DIR, REPO_ROOT, type Config, type AthleteIds } from "./config";
import { EnvError, HarnessError, ExpectationTimeout, isoStamp, log, run } from "./lib/util";
import { redact, redactJson } from "./lib/redact";
import { installSignalHandlers, onInterrupt, runCleanup } from "./lib/cleanup";
import { Idb } from "./sim/idb";
import { Simctl } from "./sim/simctl";
import { Screens } from "./sim/screens";
import { MetroLog, metroTreeProblem, readMetroProjectRoot } from "./oracle/logs";
import { readRealtimeLog, scanRealtimeLog } from "./oracle/realtime";
import { preflight, signInBlue } from "./preflight";
import { ScenarioCtx, type Scenario, type RunOptions } from "./scenarios/context";
import { SCENARIOS, NOT_IMPLEMENTED, scenariosForTier } from "./scenarios";
import { validatePayload } from "./bot/protocol";
import type { Fidelity, Timing } from "./bot/match-side";
import { holdFlagForRun, putBackFailures, recoverFixtures, timekeeperRoleOffProblem } from "./fixtures/timekeeper";
import { acquireRunLock } from "./lib/run-lock";
import { integratedSlices, pendingFails, pendingReason } from "./scenarios/timekeeper/integration";
import { exitCodeFor, pendingResult, scenarioResult, type ScenarioResult, type Status } from "./lib/results";

interface Args {
  tier: "core" | "extended" | "timekeeper" | "all";
  only: string[] | null;
  repeat: number;
  fidelity: Fidelity;
  timing: Timing;
  rerunFailures: number;
  preflight: boolean;
  preflightOnly: boolean;
  signinBlue: boolean;
  typecheck: boolean;
  tkFlagOn: boolean;
  noPending: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    tier: "core",
    only: null,
    repeat: 1,
    fidelity: "strict",
    timing: "human",
    rerunFailures: 0,
    preflight: false,
    preflightOnly: false,
    signinBlue: false,
    typecheck: true,
    tkFlagOn: false,
    noPending: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${k} needs a value`);
      return x;
    };
    if (k === "--tier") a.tier = v() as Args["tier"];
    else if (k === "--only") a.only = v().split(",").map((s) => s.trim().toUpperCase());
    else if (k === "--repeat") a.repeat = Math.max(1, Number(v()));
    else if (k === "--fidelity") a.fidelity = v() as Fidelity;
    else if (k === "--timing") a.timing = v() as Timing;
    else if (k === "--rerun-failures") a.rerunFailures = Math.max(0, Number(v()));
    else if (k === "--preflight") a.preflight = true;
    else if (k === "--preflight-only") a.preflightOnly = true;
    else if (k === "--signin-blue") a.signinBlue = true;
    else if (k === "--no-typecheck") a.typecheck = false;
    else if (k === "--tk-flag-on") a.tkFlagOn = true;
    else if (k === "--no-pending") a.noPending = true;
    else throw new Error(`unknown flag ${k}`);
  }
  if (!["core", "extended", "timekeeper", "all"].includes(a.tier)) throw new Error(`bad --tier ${a.tier}`);
  if (!["strict", "lenient"].includes(a.fidelity)) throw new Error(`bad --fidelity ${a.fidelity}`);
  if (!["human", "fast"].includes(a.timing)) throw new Error(`bad --timing ${a.timing}`);
  return a;
}

/** Open / in-progress match-loop beads, keyed by fingerprint, so repeats read `known`. */
async function knownFingerprints(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const status of ["open", "in_progress"]) {
    try {
      const { stdout } = await run("bd", ["list", "-l", "match-loop", "--status", status, "--json"], { timeoutMs: 20_000 });
      const issues = JSON.parse(stdout) as { id: string; external_ref?: string | null }[];
      for (const i of issues) {
        const m = i.external_ref?.match(/^match-loop:([0-9a-f]{8,40})$/);
        if (m) out.set(m[1], i.id);
      }
    } catch {
      /* bd unavailable: nothing is known */
    }
  }
  return out;
}

/** Protocol oracle over the bot trace: shapes, unknown events, send status. */
function protocolOracles(ctx: ScenarioCtx, s: Scenario): void {
  const spy = ctx.trace.filter((e) => e.kind === "spy");
  const shapeErrors: string[] = [];
  const unknown: string[] = [];
  for (const e of spy) {
    const err = validatePayload(e.name, e.payload);
    // match_disputed is a protocol event now (validated like the rest), so
    // no event name gets a pass any more.
    if (err?.startsWith("unknown event")) unknown.push(e.name);
    else if (err) shapeErrors.push(`${e.name}: ${err}`);
  }
  const recv = ctx.trace.filter((e) => e.kind === "broadcast_recv" && !!e.topic?.startsWith("arena-challenge:"));
  for (const e of recv) {
    const err = validatePayload(e.name, e.payload);
    if (err) shapeErrors.push(`${e.name}: ${err}`);
  }
  const failedSends = ctx.trace
    .filter((e) => e.kind === "broadcast_sent" && e.ok === false)
    .map((e) => `${e.name} -> ${String(e.result)}`);
  ctx.eq("protocol:payload-shapes", [], shapeErrors);
  ctx.eq("protocol:no-unexpected-events", [], unknown);
  if (s.allowFailedSends) ctx.skip("protocol:broadcast-status-ok", `sends allowed to fail here: ${JSON.stringify(failedSends)}`);
  else ctx.eq("protocol:broadcast-status-ok", [], failedSends);
}

function logOracles(ctx: ScenarioCtx): void {
  if (!ctx.metro.available) {
    ctx.skip("logs:metro-clean", "METRO_LOG not configured or unreadable");
    return;
  }
  const text = ctx.metro.slice(ctx.metroStart);
  const path = join(ctx.dir, "metro.slice.log");
  writeFileSync(path, redact(text));
  ctx.artifacts.metro = path;
  ctx.eq("logs:metro-clean", [], MetroLog.scan(text));
}

/**
 * Informational: the local realtime server's error lines since the scenario
 * started go to realtime.log, and any presence rate-limit hit is surfaced in
 * result.json (jits-fa9x). Never fails a scenario (ok is always true), so it
 * never adds a fingerprint.
 */
async function realtimeOracle(ctx: ScenarioCtx): Promise<void> {
  const id = "env:realtime-no-rate-limit";
  let text: string;
  try {
    text = await readRealtimeLog(ctx.cfg.realtimeContainer, ctx.startedAt);
  } catch (e) {
    ctx.skip(id, `docker logs unavailable: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    return;
  }
  const scan = scanRealtimeLog(text);
  const path = join(ctx.dir, "realtime.log");
  try {
    writeFileSync(path, redact(scan.lines.map((l) => `${l}\n`).join("")));
  } catch (e) {
    ctx.skip(id, `could not write realtime.log: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  ctx.artifacts.realtimeLog = path;
  const hits = scan.presenceRateLimited;
  ctx.oracle(
    id,
    true,
    "informational",
    { presenceRateLimited: hits.length, lines: hits.slice(0, 20) },
    hits.length
      ? "ClientPresenceRateLimitReached: the server closed a channel, so later presence oracles may be environmental"
      : undefined,
  );
}

interface Env {
  cfg: Config;
  ids: AthleteIds;
  password: string;
  idb: Idb;
  simctl: Simctl;
  ui: Screens;
  metro: MetroLog;
  opts: RunOptions;
}

async function runOne(env: Env, s: Scenario, dir: string, known: Map<string, string>): Promise<ScenarioResult> {
  const t0 = Date.now();
  log(`== ${s.id}: ${s.title}`);
  const ctx = new ScenarioCtx(env.cfg, env.ids, dir, env.idb, env.simctl, env.ui, env.metro, env.opts, env.password);
  let stopLog: (() => void) | null = null;
  try {
    stopLog = await env.simctl.startLogStream(join(dir, "device.log"));
    ctx.artifacts.deviceLog = join(dir, "device.log");
  } catch {
    /* artifact only */
  }
  let error: unknown = null;
  try {
    await s.run(ctx);
  } catch (e) {
    error = e;
  } finally {
    await ctx.dispose();
    stopLog?.();
  }
  await realtimeOracle(ctx);
  let status: Status;
  const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : error ? String(error) : undefined;
  if (error instanceof EnvError) {
    status = "env_error";
  } else if (
    error instanceof HarnessError ||
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  ) {
    status = "harness_error";
  } else {
    // Any thrown error that is not a recorded UI/DB wait gets its own oracle,
    // EVEN when other oracles already failed, so a new crash can never hide
    // behind an already-filed (known) fingerprint.
    if (error && !(error instanceof ExpectationTimeout)) {
      ctx.oracle("error", false, "no error", errMsg);
    }
    protocolOracles(ctx, s);
    logOracles(ctx);
    status = ctx.oracles.every((o) => o.ok) && !error ? "pass" : "fail";
  }
  // A fixture put-back that failed after the scenario had failed: the error
  // above stays the scenario's own, and the put-back rides alongside it. The
  // fingerprints and the `known` rule are `scenarioResult`'s (lib/results.ts).
  const putBacks = putBackFailures(error);
  const result = scenarioResult(
    { scenario: s, status, steps: ctx.steps, oracles: ctx.oracles, artifacts: ctx.artifacts, error: errMsg, putBacks, ms: Date.now() - t0 },
    known,
  );
  const fp = result.fingerprint;
  writeFileSync(join(dir, "scenario.json"), redactJson(result, 2));
  log(`== ${s.id}: ${result.status.toUpperCase()}${fp ? ` (${fp})` : ""} in ${Math.round(result.ms / 1000)}s${errMsg ? ` - ${errMsg}` : ""}`);
  for (const p of putBacks) log(`   and a put-back failed after it: ${p}`);
  return result;
}

let releaseRunLock: () => void = () => undefined;

async function main(): Promise<number> {
  installSignalHandlers();
  // Safety net: a stray rejected promise (e.g. a bot wait nobody awaits after
  // its scenario failed) must be logged, not kill the run before result.json
  // is written. Scenario failures are still recorded by runOne's try/catch.
  process.on("unhandledRejection", (reason) => {
    console.error("[match-loop] unhandled rejection (ignored, run continues):", redact(String((reason as Error)?.message ?? reason)));
  });
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  // One run at a time on this machine, from any worktree (lib/run-lock.ts):
  // taken before anything touches the simulator or the stack, released
  // after every cleanup hook has run (a run killed by a signal leaves a
  // lock whose pid is gone, which the next run takes over).
  releaseRunLock = acquireRunLock();
  // A previous run killed mid-E8 could have left realtime paused. Always
  // unpause at start (a no-op error when it is not paused).
  await run("docker", ["unpause", cfg.realtimeContainer]).then(
    () => log(`unpaused ${cfg.realtimeContainer} (it was paused)`),
    () => undefined,
  );
  // A previous run killed inside a timekeeper fixture may have left a flag
  // on or a test window set: put them back before anything else runs.
  for (const line of await recoverFixtures()) log(`recovered from an interrupted run: ${line}`);
  // Every run, gate or not (preflight is optional): the flag-OFF tiers must
  // never run with the shared flag left on by hand or by a run whose restore
  // record is gone. The harness never turns off a flag it did not set.
  const flagProblem = await timekeeperRoleOffProblem();
  if (flagProblem) throw new EnvError(flagProblem);
  // The harness reads the app under test from its own tree (the timekeeper
  // slices, the copy deck, the app's .env), so the simulator's Metro must
  // serve this checkout (oracle/logs.ts). A log that names no project
  // cannot tell, and the run goes on.
  const metroRoot = readMetroProjectRoot(cfg.metroLog);
  const treeProblem = metroTreeProblem(metroRoot, REPO_ROOT);
  if (treeProblem) throw new EnvError(treeProblem);
  if (!metroRoot) log("the Metro log names no project root: cannot confirm that Metro serves this checkout");
  const password = await loadPassword(cfg);
  const ids = await resolveAthleteIds(cfg);
  const runId = isoStamp();
  const runDir = join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });
  const idb = new Idb(cfg.udid, cfg.idbPython, join(runDir, "idb-commands.log"));
  const simctl = new Simctl(cfg.udid, cfg.bundleId);
  const ui = new Screens(idb, simctl);
  const metro = new MetroLog(cfg.metroLog);
  const env: Env = { cfg, ids, password, idb, simctl, ui, metro, opts: { fidelity: args.fidelity, timing: args.timing } };

  if (args.signinBlue) await signInBlue({ cfg, ui, idb, simctl, password, ids });

  const selected = args.only ? SCENARIOS.filter((s) => args.only!.includes(s.id)) : scenariosForTier(args.tier);

  if (args.preflight || args.preflightOnly) {
    const wantsCamera = selected.some((s) => s.id === "E13") && selected.length === 1;
    const checks = await preflight({ cfg, ids, password, idb, simctl, ui, camera: wantsCamera ? "granted" : "revoked", typecheck: args.typecheck });
    writeFileSync(join(runDir, "preflight.json"), redactJson(checks, 2));
    const failed = checks.filter((c) => !c.ok);
    if (failed.length) {
      log(`preflight FAILED: ${failed.map((c) => c.id).join(", ")} (see ${join(runDir, "preflight.json")})`);
      return 2;
    }
    log("preflight passed");
    if (args.preflightOnly) return 0;
  }

  if (selected.length === 0) {
    log(`no scenarios selected (not implemented: ${NOT_IMPLEMENTED.map((n) => n.id).join(", ")})`);
    return 1;
  }

  const known = await knownFingerprints();
  let gitSha = "unknown";
  try {
    gitSha = (await run("git", ["-C", REPO_ROOT, "rev-parse", "--short", "HEAD"])).stdout.trim();
  } catch {
    /* ignore */
  }

  const present = integratedSlices();
  const failPending = pendingFails(present, args.noPending);
  const results: ScenarioResult[] = [];
  const releaseFlag = args.tkFlagOn ? await holdFlagForRun() : null;
  // On Ctrl-C or SIGTERM the cleanup hooks run in the order they were
  // registered: holdFlagForRun's put-back first, then this one, which closes
  // the app so it does not keep the ON it read (M7 review). Removed only
  // after the normal path below has closed it.
  const unhookAppClose = releaseFlag ? onInterrupt("tk-flag-run-app-close", () => simctl.terminate()) : () => undefined;
  // The app reads timekeeper_role on mount and on foreground only (slice
  // M6's use-timekeeper-enabled.ts): close it, so the first scenario's
  // normaliseApp launches it with the flag ON and the Arena copy follows it.
  if (releaseFlag) await simctl.terminate();
  try {
    for (let rep = 0; rep < args.repeat; rep++) {
      for (const s of selected) {
        const tag = args.repeat > 1 ? `${s.id}-r${rep + 1}` : s.id;
        const pending = pendingReason(s.needs, present);
        if (pending) {
          const res = pendingResult(s, pending, failPending);
          log(`== ${s.id}: ${res.status.toUpperCase()} (${res.error})`);
          results.push(res);
          continue;
        }
        let res = await runOne(env, s, join(runDir, tag), known);
        if (res.status === "env_error") {
          results.push(res);
          continue;
        }
        const history: ScenarioResult["previousAttempts"] = [];
        let attempts = 1;
        while ((res.status === "fail" || res.status === "harness_error") && attempts <= args.rerunFailures) {
          history.push({ status: res.status, fingerprint: res.fingerprint, dir: join(runDir, attempts === 1 ? tag : `${tag}-a${attempts}`) });
          attempts++;
          const again = await runOne(env, s, join(runDir, `${tag}-a${attempts}`), known);
          if (again.status === "pass") {
            res = { ...again, status: "flake" };
            break;
          }
          res = again;
        }
        res.attempts = attempts;
        if (history.length) res.previousAttempts = history;
        results.push(res);
      }
    }
  } finally {
    if (releaseFlag) {
      await releaseFlag();
      // And again, so the next run's app does not keep the ON it read here.
      await simctl.terminate();
      unhookAppClose();
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const out = {
    runId,
    gitSha,
    args,
    integratedSlices: [...present].sort(),
    startedAt: runId,
    finishedAt: new Date().toISOString(),
    summary,
    notImplemented: NOT_IMPLEMENTED,
    scenarios: results,
  };
  const resultPath = join(runDir, "result.json");
  writeFileSync(resultPath, redactJson(out, 2));
  appendFileSync(
    join(RUNS_DIR, "history.jsonl"),
    redactJson({ type: "run", runId, gitSha, ts: new Date().toISOString(), summary, results: results.map((r) => ({ id: r.id, status: r.status, fingerprint: r.fingerprint })) }) + "\n",
  );
  log(`result: ${resultPath}`);
  log(`summary: ${JSON.stringify(summary)}`);
  return exitCodeFor(results);
}

main()
  .then(async (code) => {
    await runCleanup();
    releaseRunLock();
    process.exit(code);
  })
  .catch(async (e) => {
    log(`fatal: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    await runCleanup();
    releaseRunLock();
    process.exit(e instanceof EnvError ? 2 : 3);
  });
