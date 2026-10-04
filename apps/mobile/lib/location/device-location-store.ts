/**
 * The device location store (jr_be 016 addendum, instant go-live 4.1): the
 * last location the SERVER ACCEPTED for this athlete, so a later go-live can
 * replay it as the athlete's tag instead of waiting on GPS (the location
 * ladder's rungs 1 and 2, `lib/arena/location-ladder.ts`).
 *
 * - One entry per athlete in SecureStore (already in the shipped binary,
 *   encrypted at rest), key `last-location.<athleteId>`:
 *   `{ lat, lng, accuracyM, capturedAt (ms epoch), context }`.
 * - Written ONLY after `report_match_presence` answered `ok:true` for a
 *   `go_live`, `browse` or `arena` reading (`recordAcceptedReading`). For
 *   `go_live` the stored time is the server's `captured_at` (the clamped
 *   value) when the answer carries it, else the device capture time. Never
 *   from a refused or failed report, the face-off log, or a reading that was
 *   not reported.
 * - Read once into memory per athlete, then served from memory. An entry 4
 *   hours old or older is deleted on read and treated as absent.
 * - Cleared on sign-out, on an athlete switch and in the account deletion
 *   flow. A failed SecureStore read or write counts as "no entry" and never
 *   surfaces an error.
 *
 * The athlete it belongs to is the Arena owner (`setDeviceLocationOwner`,
 * from `<ArenaBootstrap />`), so the report call sites (browse, arena,
 * go_live) need no athlete id.
 */
import * as SecureStore from "expo-secure-store";
import { GO_LIVE_TAG_MAX_AGE_MS, isGoLiveTagValid } from "@jits/shared/constants/go-live";
import type { LocationReading } from "@jits/shared/api/invites";
import type { PresenceResult } from "@jits/shared/api/invite-rpc";
import { getPresenceCapability } from "./presence-capability";

/** The presence context the server accepted a reading under. */
export type StoredLocationContext = "go_live" | "browse" | "arena";

export interface StoredLocation {
  lat: number;
  lng: number;
  accuracyM: number;
  /** Capture time, ms epoch (the server's clamped `captured_at` for go_live). */
  capturedAt: number;
  context: StoredLocationContext;
}

const KEY_PREFIX = "last-location.";
const CONTEXTS: ReadonlySet<string> = new Set(["go_live", "browse", "arena"]);

/** SecureStore keys allow only `[A-Za-z0-9._-]`. */
function keyFor(athleteId: string): string {
  return `${KEY_PREFIX}${athleteId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/** Per athlete: the entry once read (null: none), absent until read. */
const memory = new Map<string, StoredLocation | null>();
const loading = new Map<string, Promise<StoredLocation | null>>();
/** Every athlete this process touched, so sign-out clears all of them. */
const touched = new Set<string>();
let owner: string | null = null;

function parse(raw: string | null | undefined): StoredLocation | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<StoredLocation>;
    const ok =
      typeof o.lat === "number" &&
      typeof o.lng === "number" &&
      typeof o.accuracyM === "number" &&
      typeof o.capturedAt === "number" &&
      Number.isFinite(o.lat) &&
      Number.isFinite(o.lng) &&
      Number.isFinite(o.accuracyM) &&
      Number.isFinite(o.capturedAt) &&
      typeof o.context === "string" &&
      CONTEXTS.has(o.context);
    return ok ? (o as StoredLocation) : null;
  } catch {
    return null;
  }
}

function expired(entry: StoredLocation, now: number): boolean {
  return now - entry.capturedAt >= GO_LIVE_TAG_MAX_AGE_MS;
}

function removeQuietly(athleteId: string): void {
  try {
    void Promise.resolve(SecureStore.deleteItemAsync(keyFor(athleteId))).catch(() => undefined);
  } catch {
    // A failed delete leaves an entry that expires by itself within 4 hours.
  }
}

/**
 * The athlete whose readings `recordAcceptedReading` stores. A different
 * athlete taking over (an athlete switch) clears the previous one's entry.
 * Starts the read into memory.
 */
export function setDeviceLocationOwner(athleteId: string | null): void {
  if (athleteId && owner && owner !== athleteId) clearDeviceLocation(owner);
  if (athleteId) {
    owner = athleteId;
    touched.add(athleteId);
    void loadDeviceLocation(athleteId);
  }
}

export function getDeviceLocationOwner(): string | null {
  return owner;
}

/** Read the athlete's entry into memory (once; deduped). Never rejects. */
export function loadDeviceLocation(athleteId: string): Promise<StoredLocation | null> {
  if (memory.has(athleteId)) return Promise.resolve(peekDeviceLocation(athleteId));
  const inflight = loading.get(athleteId);
  if (inflight) return inflight;
  touched.add(athleteId);
  const p = (async () => {
    let entry: StoredLocation | null = null;
    try {
      entry = parse(await SecureStore.getItemAsync(keyFor(athleteId)));
    } catch {
      entry = null;
    }
    // A write (or a clear) that landed while the read was in flight is newer.
    if (!memory.has(athleteId)) memory.set(athleteId, entry);
    return peekDeviceLocation(athleteId);
  })().finally(() => {
    loading.delete(athleteId);
  });
  loading.set(athleteId, p);
  return p;
}

/** Whether the entry has been read into memory yet (synchronous callers). */
export function isDeviceLocationLoaded(athleteId: string): boolean {
  return memory.has(athleteId);
}

/**
 * The in-memory entry, synchronously: null when absent, not read yet, or 4
 * hours old (which is deleted here, as the spec's "deleted on read").
 */
export function peekDeviceLocation(athleteId: string, now: number = Date.now()): StoredLocation | null {
  const entry = memory.get(athleteId) ?? null;
  if (entry && expired(entry, now)) {
    memory.set(athleteId, null);
    removeQuietly(athleteId);
    return null;
  }
  return entry;
}

/** The entry when it is a valid go-live tag (`isGoLiveTagValid`), else null. */
export function validDeviceTag(athleteId: string | null, now: number = Date.now()): StoredLocation | null {
  if (!athleteId) return null;
  const entry = peekDeviceLocation(athleteId, now);
  return entry && isGoLiveTagValid(entry, now) ? entry : null;
}

/** Store an accepted reading (memory at once, SecureStore in the background). */
export function saveDeviceLocation(athleteId: string, entry: StoredLocation): void {
  touched.add(athleteId);
  const prev = memory.get(athleteId);
  // Never move the tag backwards (mirrors the server's rule D2).
  if (prev && prev.capturedAt > entry.capturedAt) return;
  memory.set(athleteId, entry);
  try {
    void Promise.resolve(SecureStore.setItemAsync(keyFor(athleteId), JSON.stringify(entry))).catch(() => undefined);
  } catch {
    // Memory still has it for this process.
  }
}

/** Delete the athlete's entry (a refused replay, sign-out, account deletion). */
export function clearDeviceLocation(athleteId: string): void {
  memory.set(athleteId, null);
  removeQuietly(athleteId);
}

/** Sign-out: every athlete this process stored or read, and the owner. */
export function clearAllDeviceLocations(): void {
  for (const id of touched) clearDeviceLocation(id);
  owner = null;
}

/** The server's capture time from a go_live answer, ms epoch, or null. */
function serverCapturedAt(res: PresenceResult): number | null {
  if (!res.ok || !res.captured_at) return null;
  const t = Date.parse(res.captured_at);
  return Number.isFinite(t) ? t : null;
}

/**
 * A `report_match_presence` answer for a reading this device sent: stored
 * only when the server accepted it (`ok:true`), for the current owner.
 * `capturedAt`: when the reading was taken on the device (ms epoch).
 */
export function recordAcceptedReading(
  context: StoredLocationContext,
  reading: LocationReading,
  capturedAt: number,
  res: PresenceResult | null | undefined,
): void {
  if (!owner || !res || !res.ok) return;
  // An older backend never gets a replay (presence-capability.ts), so there
  // is nothing to keep a tag for.
  if (getPresenceCapability() === "legacy") return;
  if (!Number.isFinite(reading.lat) || !Number.isFinite(reading.lng) || !Number.isFinite(reading.accuracyM)) return;
  const at = context === "go_live" ? (serverCapturedAt(res) ?? capturedAt) : capturedAt;
  saveDeviceLocation(owner, { lat: reading.lat, lng: reading.lng, accuracyM: reading.accuracyM, capturedAt: at, context });
}

/** Tests only. */
export function __resetDeviceLocationStoreForTests(): void {
  memory.clear();
  loading.clear();
  touched.clear();
  owner = null;
}
