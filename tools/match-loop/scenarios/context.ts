/**
 * Everything a scenario gets: config, ids, drivers, the bot factory, and the
 * bookkeeping (steps, oracles, artifacts) that becomes result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AthleteIds, Config } from "../config";
import { Trace } from "../bot/trace";
import { MobileOpponent, type Identity } from "../bot/opponent";
import { MatchSide, type Fidelity, type Timing } from "../bot/match-side";
import type { Idb } from "../sim/idb";
import { summarise } from "../sim/idb";
import type { Simctl } from "../sim/simctl";
import type { Screens } from "../sim/screens";
import { MetroLog } from "../oracle/logs";
import { redactJson } from "../lib/redact";
import { ExpectationTimeout, log } from "../lib/util";

export type Tier = "core" | "extended";

export interface Scenario {
  id: string;
  tier: Tier;
  title: string;
  /** Default status when the scenario fails on a documented hypothesis. */
  expectedFailure?: string;
  /** Broadcast sends are EXPECTED to fail (E8 outage): record, do not fail. */
  allowFailedSends?: boolean;
  run: (ctx: ScenarioCtx) => Promise<void>;
}

export interface StepRecord {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
  screenshot?: string;
}

export interface OracleRecord {
  id: string;
  /** False only for a real failure; a skipped oracle is ok but not a pass. */
  ok: boolean;
  status: "pass" | "fail" | "skipped";
  expected: unknown;
  actual: unknown;
  note?: string;
}

export interface RunOptions {
  fidelity: Fidelity;
  timing: Timing;
}

export class ScenarioCtx {
  readonly steps: StepRecord[] = [];
  readonly oracles: OracleRecord[] = [];
  readonly artifacts: Record<string, string> = {};
  readonly trace: Trace;
  private readonly bots: MobileOpponent[] = [];
  private readonly sides: MatchSide[] = [];
  private shot = 0;
  readonly metroStart: number;
  readonly startedAt = new Date().toISOString();
  readonly opts: RunOptions;

  constructor(
    readonly cfg: Config,
    readonly ids: AthleteIds,
    readonly dir: string,
    readonly idb: Idb,
    readonly simctl: Simctl,
    readonly ui: Screens,
    readonly metro: MetroLog,
    opts: RunOptions,
    readonly password: string,
  ) {
    // Per-scenario copy: a scenario may switch itself to fast timing.
    this.opts = { ...opts };
    mkdirSync(dir, { recursive: true });
    this.trace = new Trace(join(dir, "trace.jsonl"));
    this.artifacts.trace = join(dir, "trace.jsonl");
    this.metroStart = metro.offset();
  }

  identity(key: "red" | "green" | "blue"): Identity {
    return { id: this.ids[key], email: this.cfg.emails[key], displayName: this.cfg.names[key], key };
  }

  /** A signed-in bot whose realtime listeners have joined. Closed by `dispose`. */
  async bot(key: "red" | "green" = "red"): Promise<MobileOpponent> {
    const b = new MobileOpponent(this.cfg, this.identity(key), this.trace, this.password);
    this.bots.push(b);
    await b.signIn();
    await b.ready();
    return b;
  }

  async matchSide(bot: MobileOpponent, matchId: string, opponentId = this.ids.blue): Promise<MatchSide> {
    const side = new MatchSide(this.cfg, bot.client, this.trace, matchId, bot.me.id, opponentId, this.opts, `bot:${bot.me.key}`);
    this.sides.push(side);
    await side.start();
    return side;
  }

  /** Screenshot into the scenario folder; returns the path. */
  async screenshot(label: string): Promise<string | undefined> {
    const path = join(this.dir, `${String(++this.shot).padStart(2, "0")}-${label.replace(/[^a-z0-9-]+/gi, "_")}.png`);
    try {
      await this.simctl.screenshot(path);
      return path;
    } catch {
      return undefined;
    }
  }

  /** Run a named step; screenshot after it (pass or fail). */
  async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    log(`  - ${name}`);
    try {
      const v = await fn();
      this.steps.push({ name, ok: true, ms: Date.now() - t0, screenshot: await this.screenshot(name) });
      return v;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const screenshot = await this.screenshot(`FAIL-${name}`);
      this.steps.push({ name, ok: false, ms: Date.now() - t0, error: err, screenshot });
      if (e instanceof ExpectationTimeout) {
        const screen = await this.idb.describe().then(summarise).catch(() => []);
        this.oracle(`ui:${name}`, false, e.what, { lastSeen: e.lastSeen, screen });
      }
      throw e;
    }
  }

  /** Record an oracle. Returns `ok` so callers can branch. */
  oracle(id: string, ok: boolean, expected: unknown, actual: unknown, note?: string): boolean {
    this.oracles.push({ id, ok, status: ok ? "pass" : "fail", expected, actual, note });
    log(`    ${ok ? "ok  " : "FAIL"} ${id}${ok ? "" : ` expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
    return ok;
  }

  /** An oracle that could not be evaluated. Does not fail the scenario, is not a pass. */
  skip(id: string, reason: string): void {
    this.oracles.push({ id, ok: true, status: "skipped", expected: null, actual: null, note: reason });
    log(`    SKIP ${id}: ${reason}`);
  }

  /** Deep-equality oracle. */
  eq(id: string, expected: unknown, actual: unknown, note?: string): boolean {
    return this.oracle(id, JSON.stringify(expected) === JSON.stringify(actual), expected, actual, note);
  }

  /** Oracle that awaits a probe; a timeout becomes a failed oracle, not a crash. */
  async expect(id: string, expected: unknown, probe: () => Promise<unknown>): Promise<boolean> {
    try {
      const actual = await probe();
      return this.eq(id, expected, actual);
    } catch (e) {
      if (e instanceof ExpectationTimeout) {
        return this.oracle(id, false, expected, { timeout: e.what, lastSeen: e.lastSeen });
      }
      throw e;
    }
  }

  writeJson(name: string, value: unknown): string {
    const path = join(this.dir, name);
    writeFileSync(path, redactJson(value, 2));
    this.artifacts[name.replace(/\.json$/, "")] = path;
    return path;
  }

  async dispose(): Promise<void> {
    for (const s of this.sides) await s.close().catch(() => undefined);
    for (const b of this.bots) await b.close().catch(() => undefined);
  }
}
