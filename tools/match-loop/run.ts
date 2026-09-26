/**
 * Match-loop runner.
 *
 *   npm run match-loop -- [--tier core|extended|all] [--only C1,C3] [--repeat N]
 *                         [--fidelity strict|lenient] [--timing human|fast]
 *                         [--rerun-failures N] [--preflight | --preflight-only]
 *                         [--signin-blue] [--no-typecheck]
 *
 * Writes tools/match-loop/.runs/<iso>/result.json (plus per-scenario folders
 * with screenshots, trace.jsonl, device.log) and appends a line to
 * .runs/history.jsonl. Exits non-zero when any scenario is fail,
 * harness_error or env_error (`known` and `flake` do not fail the run).
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, loadPassword, resolveAthleteIds, RUNS_DIR, REPO_ROOT, type Config, type AthleteIds } from "./config";
import { EnvError, HarnessError, ExpectationTimeout, isoStamp, log, normaliseError, run } from "./lib/util";
import { redact, redactJson } from "./lib/redact";
import { installSignalHandlers, runCleanup } from "./lib/cleanup";
import { Idb } from "./sim/idb";
import { Simctl } from "./sim/simctl";
import { Screens } from "./sim/screens";
import { MetroLog } from "./oracle/logs";
import { preflight, signInBlue } from "./preflight";
import { ScenarioCtx, type OracleRecord, type Scenario, type StepRecord, type RunOptions } from "./scenarios/context";
import { SCENARIOS, NOT_IMPLEMENTED } from "./scenarios";
import { validatePayload } from "./bot/protocol";
import type { Fidelity, Timing } from "./bot/match-side";

type Status = "pass" | "fail" | "flake" | "harness_error" | "env_error" | "known";

interface ScenarioResult {
  id: string;
  title: string;
  status: Status;
  attempts: number;
  expectedFailure?: string;
  steps: StepRecord[];
  oracles: OracleRecord[];
  artifacts: Record<string, string>;
  /** First failure's fingerprint (the one used for bead external refs). */
  fingerprint: string | null;
  /** Every failed oracle's fingerprint. */
  fingerprints: string[];
  knownBeads: string[];
  skippedOracles: string[];
  error?: string;
  ms: number;
  previousAttempts?: { status: Status; fingerprint: string | null; dir: string }[];
}

interface Args {
  tier: "core" | "extended" | "all";
  only: string[] | null;
  repeat: number;
  fidelity: Fidelity;
  timing: Timing;
  rerunFailures: number;
  preflight: boolean;
  preflightOnly: boolean;
  signinBlue: boolean;
  typecheck: boolean;
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
    else throw new Error(`unknown flag ${k}`);
  }
  if (!["core", "extended", "all"].includes(a.tier)) throw new Error(`bad --tier ${a.tier}`);
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

function sha12(basis: string): string {
  return createHash("sha1").update(basis).digest("hex").slice(0, 12);
}

/**
 * Fingerprint of one failed oracle. Stable across runs: scenario + oracle id
 * + what it EXPECTED (the actual value carries screen dumps and timings).
 * The generic "error" oracle expects nothing useful, so it hashes the
 * normalised actual (the error message) instead.
 * NOTE: this formula backs the external refs on filed beads
 * (match-loop:<fp>). Changing it orphans them.
 */
export function oracleFingerprint(scenarioId: string, o: OracleRecord): string {
  const detail = o.id === "error" ? JSON.stringify(o.actual ?? "") : JSON.stringify(o.expected ?? "");
  return sha12([scenarioId, o.id, normaliseError(detail)].join("|"));
}

/** Fingerprint of a scenario that died with no failed oracle. */
export function errorFingerprint(scenarioId: string, error: string): string {
  return sha12([scenarioId, "error", normaliseError(error)].join("|"));
}

/** Protocol oracle over the bot trace: shapes, unknown events, send status. */
function protocolOracles(ctx: ScenarioCtx, s: Scenario): void {
  const spy = ctx.trace.filter((e) => e.kind === "spy");
  const shapeErrors: string[] = [];
  const unknown: string[] = [];
  for (const e of spy) {
    const err = validatePayload(e.name, e.payload);
    if (err?.startsWith("unknown event")) {
      if (!/disput/i.test(e.name)) unknown.push(e.name);
    } else if (err) shapeErrors.push(`${e.name}: ${err}`);
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
    if (error && !(error instanceof ExpectationTimeout) && !ctx.oracles.some((o) => !o.ok)) {
      ctx.oracle("error", false, "no error", errMsg);
    }
    protocolOracles(ctx, s);
    logOracles(ctx);
    status = ctx.oracles.every((o) => o.ok) && !error ? "pass" : "fail";
  }
  let fingerprints: string[] = [];
  if (status !== "pass") {
    fingerprints = ctx.oracles.filter((o) => !o.ok).map((o) => oracleFingerprint(s.id, o));
    if (fingerprints.length === 0 && errMsg) fingerprints = [errorFingerprint(s.id, errMsg)];
  }
  const fp = fingerprints[0] ?? null;
  // `known` only when EVERY failure is already filed; one new failure keeps it `fail`.
  if (status === "fail" && fingerprints.length > 0 && fingerprints.every((f) => known.has(f))) status = "known";
  const result: ScenarioResult = {
    id: s.id,
    title: s.title,
    status,
    attempts: 1,
    expectedFailure: s.expectedFailure,
    steps: ctx.steps,
    oracles: ctx.oracles,
    artifacts: ctx.artifacts,
    fingerprint: fp,
    fingerprints,
    knownBeads: fingerprints.filter((f) => known.has(f)).map((f) => `${f}=${known.get(f)}`),
    skippedOracles: ctx.oracles.filter((o) => o.status === "skipped").map((o) => o.id),
    error: errMsg,
    ms: Date.now() - t0,
  };
  writeFileSync(join(dir, "scenario.json"), redactJson(result, 2));
  log(`== ${s.id}: ${status.toUpperCase()}${fp ? ` (${fp})` : ""} in ${Math.round(result.ms / 1000)}s${errMsg ? ` - ${errMsg}` : ""}`);
  return result;
}

async function main(): Promise<number> {
  installSignalHandlers();
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  // A previous run killed mid-E8 could have left realtime paused. Always
  // unpause at start (a no-op error when it is not paused).
  await run("docker", ["unpause", cfg.realtimeContainer]).then(
    () => log(`unpaused ${cfg.realtimeContainer} (it was paused)`),
    () => undefined,
  );
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

  const selected = SCENARIOS.filter((s) => {
    if (args.only) return args.only.includes(s.id);
    return args.tier === "all" || s.tier === args.tier;
  });

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

  const results: ScenarioResult[] = [];
  for (let rep = 0; rep < args.repeat; rep++) {
    for (const s of selected) {
      const tag = args.repeat > 1 ? `${s.id}-r${rep + 1}` : s.id;
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

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const out = {
    runId,
    gitSha,
    args,
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
  const bad = results.some((r) => r.status === "fail" || r.status === "harness_error" || r.status === "env_error");
  return bad ? 1 : 0;
}

main()
  .then(async (code) => {
    await runCleanup();
    process.exit(code);
  })
  .catch(async (e) => {
    log(`fatal: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    await runCleanup();
    process.exit(e instanceof EnvError ? 2 : 3);
  });
