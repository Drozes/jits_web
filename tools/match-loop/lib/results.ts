/**
 * What a run records per scenario, and the rules that turn those records
 * into fingerprints and the run's exit code. Pure and free of side effects
 * (the runner, `run.ts`, starts a run when it is imported), so the tests can
 * exercise the rules that keep a gate from reading green: a pending
 * scenario that must fail does fail, and fails the run (M7 review).
 */
import { createHash } from "node:crypto";
import type { OracleRecord, Scenario, StepRecord } from "../scenarios/context";
import { normaliseError } from "./util";

/**
 * `pending`: a timekeeper scenario whose slices are not in this build yet;
 * not run. It does not fail the run while the build is still partial;
 * on a build with M8, or with `--no-pending`, it is recorded `fail` instead.
 */
export type Status = "pass" | "fail" | "flake" | "harness_error" | "env_error" | "known" | "pending";

export interface ScenarioResult {
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
  /**
   * Fixture put-backs that failed after the scenario had already failed, as
   * `<fixture>: <error>` (`putBackFailures` in `fixtures/timekeeper.ts`).
   * `error`, the status and the fingerprints stay the scenario's own.
   */
  putBackFailures?: string[];
  ms: number;
  previousAttempts?: { status: Status; fingerprint: string | null; dir: string }[];
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

/**
 * The result of a scenario that was not run because its slices are not in
 * this build: `pending`, or `fail` when this run may not leave one pending
 * (`pendingFails`).
 */
export function pendingResult(s: Pick<Scenario, "id" | "title">, reason: string, fails: boolean): ScenarioResult {
  const error = fails ? `${reason} (a build with M8, or --no-pending, must run every timekeeper scenario)` : reason;
  const fingerprint = fails ? errorFingerprint(s.id, error) : null;
  return {
    id: s.id,
    title: s.title,
    status: fails ? "fail" : "pending",
    attempts: 0,
    steps: [],
    oracles: [],
    artifacts: {},
    fingerprint,
    fingerprints: fingerprint ? [fingerprint] : [],
    knownBeads: [],
    skippedOracles: [],
    error,
    ms: 0,
  };
}

/** The statuses that fail a run (`known` and `flake` do not; nor does a `pending` the run may leave). */
const FAILS_THE_RUN: ReadonlySet<Status> = new Set<Status>(["fail", "harness_error", "env_error"]);

/** The run's exit code from its scenario results: 1 when any of them fails the run, else 0. */
export function exitCodeFor(results: readonly Pick<ScenarioResult, "status">[]): 0 | 1 {
  return results.some((r) => FAILS_THE_RUN.has(r.status)) ? 1 : 0;
}
