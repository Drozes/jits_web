/**
 * Which timekeeper-mode slices the build under test has, so a timekeeper
 * scenario runs only once every slice it drives is there and is otherwise
 * recorded as `pending` with the reason.
 *
 * The timekeeper scenarios were written in Wave 2 next to slices M2 to M6
 * and M8 to M10 (PLAN 3.2); they run for real in Wave 3 on the integrated
 * build (PLAN 5, step 3). Every slice is READ from the app source, never
 * declared by hand (a list someone must remember to append to can leave a
 * scenario pending on the integrated build without anyone noticing):
 *
 *  - M2 to M6, M9 and M10 by a file each slice creates (`SLICE_MARKERS`,
 *    from the slice's owned files in PLAN 3.2; none of them exists on the
 *    M1 base);
 *  - M8 by the capability in the app's code: the quoted `timekeeper_v1`
 *    outside comments in a non-test source under `apps/mobile/lib/supabase/`
 *    (M8's client) or `packages/shared/src/` (a constant the client could
 *    import), so the detection does not hang on one spelling of the header.
 *    Without it no simulator-plus-bot pair can ever be a timekeeper match
 *    (every scenario would silently test flag OFF). A false positive is
 *    loud, never silent: every pending scenario then fails the run, and T11's
 *    capability oracle fails when the app does not really send it.
 *
 * A pending scenario fails the run once M8 is in the build (M8 lands only
 * after every M slice is committed, PLAN 3.2), or always with `--no-pending`
 * (the Wave 3 gate): an integration gate that cannot run a scenario must not
 * read green.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { TIMEKEEPER_CAP } from "../../bot/opponent";

/** The mobile slices a timekeeper scenario can depend on (PLAN 3.2). */
export type MobileSlice = "M2" | "M3" | "M4" | "M5" | "M6" | "M8" | "M9" | "M10";

/** What each slice brings that a scenario drives on the simulator. */
export const SLICE_WHAT: Record<MobileSlice, string> = {
  M2: "the picker on crew and the asked person's sheet",
  M3: "the athlete face-off (TK-F4 ready, TK-F5, TK-F7) and the TK-D9 chip",
  M4: "the read-only live screen (TK-L2), the offline banner and the no-contest exits (TK-NC*, TK-W2)",
  M5: "the timekeeper-mode result waiting view, confirm (TK-R5, TK-RC1) and the edit notice",
  M6: "the Arena, Home and header in timekeeper mode",
  M8: "the capability header on the app's client (x-elo-client-caps: timekeeper_v1)",
  M9: "the capture policy (portrait lock on ready and live, practice too)",
  M10: "Admin > Timekeeper reviews",
};

/** A file each slice creates (PLAN 3.2 owned files), repo-relative: present means the slice is in the build. */
export const SLICE_MARKERS: Record<Exclude<MobileSlice, "M8">, string> = {
  M2: "apps/mobile/components/match-flow/crew/candidate-list.tsx",
  M3: "apps/mobile/lib/match-flow/use-timekeeper-start.ts",
  M4: "apps/mobile/lib/match-flow/use-timekeeper-presence.ts",
  M5: "apps/mobile/components/match-flow/steps/result-edit-entry.tsx",
  M6: "apps/mobile/components/dashboard/timekeeping-resume-card.tsx",
  M9: "apps/mobile/lib/video/capture-copy.ts",
  M10: "apps/mobile/app/(app)/settings/admin/timekeeper-reviews.tsx",
};

/** M8's file: the app's Supabase client, which must send the capability header. */
export const APP_CLIENT_SOURCE = "apps/mobile/lib/supabase/client.ts";

/** Where the app's capability can be written: M8's client folder, or the shared package it could import a constant from. */
export const CAP_SOURCE_DIRS = ["apps/mobile/lib/supabase", "packages/shared/src"] as const;

const ROOT = resolve(__dirname, "../../../..");

/** A repo-relative file's text, or null when it does not exist. */
export type ReadSource = (rel: string) => string | null;
/** The repo-relative non-test `.ts` / `.tsx` files under a repo-relative folder (none when it does not exist). */
export type ListSources = (relDir: string) => string[];

const readRepoFile: ReadSource = (rel) => {
  try {
    return readFileSync(resolve(ROOT, rel), "utf8");
  } catch {
    return null;
  }
};

const isTestPath = (rel: string) => /(^|\/)__tests__\//.test(rel) || /\.test\.tsx?$/.test(rel);

const listRepoSources: ListSources = (relDir) => {
  try {
    return readdirSync(resolve(ROOT, relDir), { recursive: true, encoding: "utf8" })
      .map((f) => join(relDir, f))
      .filter((rel) => /\.tsx?$/.test(rel) && !isTestPath(rel));
  } catch {
    return [];
  }
};

/**
 * Whether source code sends the timekeeper capability: the quoted
 * `timekeeper_v1` outside comments (pure, for tests). A comment that only
 * names the capability does not count.
 */
export function appSendsTimekeeperCap(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return new RegExp(`(["'\`])${TIMEKEEPER_CAP}\\1`).test(code);
}

/** The slices present in the build, read from its source. */
export function integratedSlices(readSource: ReadSource = readRepoFile, listSources: ListSources = listRepoSources): Set<MobileSlice> {
  const out = new Set<MobileSlice>();
  for (const [slice, rel] of Object.entries(SLICE_MARKERS) as [Exclude<MobileSlice, "M8">, string][]) {
    if (readSource(rel) !== null) out.add(slice);
  }
  const capSources = CAP_SOURCE_DIRS.flatMap((dir) => listSources(dir)).filter((rel) => !isTestPath(rel));
  if (capSources.some((rel) => appSendsTimekeeperCap(readSource(rel) ?? ""))) out.add("M8");
  return out;
}

/** Why a scenario cannot run on this build yet, or null when it can (pure, for tests). */
export function pendingReason(needs: readonly MobileSlice[] | undefined, present: ReadonlySet<MobileSlice>): string | null {
  const missing = (needs ?? []).filter((s) => !present.has(s));
  if (missing.length === 0) return null;
  return `pending: needs ${missing.map((s) => `${s} (${SLICE_WHAT[s]})`).join("; ")}, not yet integrated in this build`;
}

/**
 * Whether a pending scenario fails the run (pure, for tests): on a build
 * with M8, which lands only after every M slice (PLAN 3.2), so a slice still
 * missing there is an integration defect; or when the run asks for it
 * (`--no-pending`, the Wave 3 gate).
 */
export function pendingFails(present: ReadonlySet<MobileSlice>, noPending: boolean): boolean {
  return noPending || present.has("M8");
}
