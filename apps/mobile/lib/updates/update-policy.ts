/**
 * Pure decision logic for in-app OTA update control (jits-5i2w).
 *
 * No expo or React imports: everything here is a plain function so the
 * policy is fully unit-tested. `use-ota-update.ts` is the only file that
 * touches `expo-updates`; it feeds this module and renders nothing itself.
 *
 * Criticality contract: `app.config.js` publishes a committed, monotonic
 * counter as `extra.updateCriticalIndex` (and an optional `extra.updateNotice`).
 * An EAS Update manifest carries its publish-time config at
 * `manifest.extra.expoClient.extra`. A downloaded update is critical when its
 * index is strictly greater than the running bundle's, so a critical publish
 * that was skipped is still enforced by any later publish.
 */

export const UPDATE_CHECK_MIN_INTERVAL_MS = 15 * 60_000;
export const UPDATE_NOTICE_MAX_LENGTH = 280;

export type UpdatePrompt = "none" | "banner" | "modal";

export interface PendingUpdate {
  /** null for a rollback (it has no update id). */
  updateId: string | null;
  critical: boolean;
}

function field(obj: unknown, key: string): unknown {
  return obj !== null && typeof obj === "object"
    ? (obj as Record<string, unknown>)[key]
    : undefined;
}

/** A finite non-negative integer number, else 0 (builds without the key read 0). */
export function readCriticalIndex(extra: unknown): number {
  const v = field(extra, "updateCriticalIndex");
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Trimmed, length-capped notice, or null when absent/blank/not a string. */
export function readUpdateNotice(extra: unknown): string | null {
  const v = field(extra, "updateNotice");
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed.slice(0, UPDATE_NOTICE_MAX_LENGTH) : null;
}

/** `manifest.extra.expoClient.extra`, safe on rollback/malformed manifests. */
export function extraFromUpdateManifest(manifest: unknown): unknown {
  return field(field(field(manifest, "extra"), "expoClient"), "extra");
}

export function isCriticalUpdate(runningIndex: number, updateIndex: number): boolean {
  return updateIndex > runningIndex;
}

export function shouldCheckForUpdate(args: {
  now: number;
  lastCheckAt: number | null;
  inFlight: boolean;
  minIntervalMs?: number;
}): boolean {
  const { now, lastCheckAt, inFlight, minIntervalMs = UPDATE_CHECK_MIN_INTERVAL_MS } = args;
  if (inFlight) return false;
  if (lastCheckAt === null) return true;
  return now - lastCheckAt >= minIntervalMs;
}

export function isOtaControlEnabled(args: {
  isDev: boolean;
  updatesEnabled: boolean;
  isExpoGo: boolean;
}): boolean {
  return !args.isDev && args.updatesEnabled && !args.isExpoGo;
}

/**
 * Order matters: splash suppression beats everything, a match defers even a
 * critical update (re-evaluated on exit), and a dismissal never hides a
 * critical one.
 */
export function decideUpdatePrompt(args: {
  pending: PendingUpdate | null;
  inMatch: boolean;
  suppressed: boolean;
  dismissedUpdateId: string | null;
}): UpdatePrompt {
  const { pending, inMatch, suppressed, dismissedUpdateId } = args;
  if (pending === null) return "none";
  if (suppressed) return "none";
  if (inMatch) return "none";
  if (pending.critical) return "modal";
  if (pending.updateId !== null && pending.updateId === dismissedUpdateId) return "none";
  return "banner";
}
