/**
 * M-R4 (spec 14.9 X1) for the shared files slice M5 gave a timekeeper-mode
 * branch: no timekeeper-mode surface renders a DomainError's `message`.
 *
 * `timekeeper-mode-guard.test.ts` finds the timekeeper-mode surfaces by what
 * they import (the timekeeper-mode wrappers or copy) or by their path. A
 * shipped two-athlete file that gained a timekeeper-mode branch in slice M5
 * (the confirm step and its `useConfirmResult`, `useRecordResult`) does
 * neither, so that guard cannot see it, although its timekeeper-mode branch
 * toasts on the same refusal. PM29 gave the shipped dispute form, which the
 * confirm step opens, the same kind of branch (its `timekeeperMode` prop),
 * and its submit moved into `useDisputeSubmit`, which holds the toasts.
 *
 * The scope is an explicit list of the files M5 owns and changed, never a
 * repo-wide search by identifier: other slices (M1, M3, M4) keep their
 * two-athlete-only message reads in guarded blocks or helpers, which follow
 * M-R4 but which a same-line pattern cannot read. A repo-wide rule needs the
 * owning slices to agree it first, and must accept those forms.
 *
 * Here: in each listed file, each read of an error's `message` must sit in
 * the two-athlete arm of a ternary on timekeeper mode on the same line, the
 * timekeeper-mode arm reading no message:
 *
 *   toast.error(timekeeperMode ? { text1: "x" } : { text1: "x", description: res.error.message });
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..", "..");

/** The shared files slice M5 (and PM29, the dispute form and its submit hook) gave a timekeeper-mode branch. */
const M5_SHARED_FILES = [
  join("components/match-flow/steps", "confirm-step.tsx"),
  join("lib/match-flow", "use-confirm-result.ts"),
  join("lib/match-flow", "use-record-result.ts"),
  join("components/match-flow/steps", "dispute-form.tsx"),
  join("lib/match-flow", "use-dispute-submit.ts"),
];

/** The same patterns as `timekeeper-mode-guard.test.ts` (M-R4). */
const TK_SURFACE_IMPORT = /from\s+["'](?:@jits\/shared\/api\/timekeeper|[^"']*timekeeper-copy)["']/;
const ERROR_MESSAGE = /\b(?:error|err|e)\??\.message\b|\)\??\.message\b/;

/** The file branches on timekeeper mode. */
const TK_BRANCH = /\btimekeeperMode(?:SelfId)?\b|\btimekeeperResult\b/;
/** A message read in the two-athlete arm of a same-line ternary on timekeeper mode. */
const TWO_ATHLETE_ARM = /\btimekeeperMode(?:SelfId)?\s*\?\s*\{[^{}]*\}\s*:\s*\{[^{}]*\.message\b/;

const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("M-R4 in the shared steps M5 gave a timekeeper-mode branch", () => {
  it("every DomainError message read sits in the two-athlete arm", () => {
    const found = M5_SHARED_FILES.flatMap((rel) =>
      read(rel)
        .split("\n")
        .flatMap((line, i) => (ERROR_MESSAGE.test(line) && !TWO_ATHLETE_ARM.test(line) ? [`${rel}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(found).toEqual([]);
  });

  it("covers the confirm step, useConfirmResult, useRecordResult, the dispute form and useDisputeSubmit: each still branches on timekeeper mode and is not already guarded by import", () => {
    for (const rel of M5_SHARED_FILES) {
      const text = read(rel);
      expect([rel, TK_BRANCH.test(text), TK_SURFACE_IMPORT.test(text)]).toEqual([rel, true, false]);
    }
  });

  it("the patterns catch what they guard", () => {
    for (const line of [
      'toast.error({ text1: "x", description: res.error.message });',
      'toast.error(timekeeperMode ? { text1: "x", description: res.error.message } : { text1: "x" });',
      'toast.error(other ? { text1: "x" } : { text1: "x", description: res.error.message });',
    ]) {
      expect([line, ERROR_MESSAGE.test(line) && !TWO_ATHLETE_ARM.test(line)]).toEqual([line, true]);
    }
    for (const line of [
      'toast.error(timekeeperMode ? { text1: "x" } : { text1: "x", description: res.error.message });',
      'toast.error(timekeeperModeSelfId ? { text1: "x" } : { text1: "x", description: res.error.message });',
    ]) {
      expect([line, TWO_ATHLETE_ARM.test(line)]).toEqual([line, true]);
    }
  });
});
