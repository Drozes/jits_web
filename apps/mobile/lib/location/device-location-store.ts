/**
 * The device location store (jr_be 016 addendum, instant go-live 4.1): the
 * last locations the SERVER ACCEPTED for this athlete, so a later go-live can
 * replay one as the athlete's tag instead of waiting on GPS (the location
 * ladder's rungs 1 and 2, `lib/arena/location-ladder.ts`).
 *
 * Two slots per athlete (review round 1, S3, orchestrator decision):
 *  - the TAG: the last accepted `go_live` reading. Persisted in SecureStore
 *    (already in the shipped binary, encrypted at rest), key
 *    `last-location.<athleteId>`. It is what rung 1 relies on (the server
 *    holds the same tag) and what the drift check compares against, so a
 *    browse reading never overwrites it.
 *  - the READING: the last accepted `browse` or `arena` reading, in memory
 *    only (browse reports every 30 s would otherwise write the keychain each
 *    time). Rung 2 can replay it within this app process.
 *
 * - Written ONLY after `report_match_presence` answered `ok:true`, and only
 *   for the athlete the request was made for (an athlete switch while a
 *   report is in flight never stores it for the next one). For `go_live` the
 *   stored time is the server's `captured_at` (the clamped value) when the
 *   answer carries it, else the device capture time. Never from a refused or
 *   failed report, the face-off log, or a reading that was not reported.
 * - Read once into memory per athlete. An entry 4 hours old or older is
 *   deleted on read and treated as absent.
 * - Cleared on sign-out (voluntary or not), on an athlete switch and in the
 *   account deletion flow. A failed SecureStore read or write counts as "no
 *   entry" and never surfaces an error.
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

/** SecureStore keys allow only `[A-Za-z0-9._-]`. */
function keyFor(athleteId: string): string {
  return `${KEY_PREFIX}${athleteId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/** Per athlete: the go_live tag once read (null: none), absent until read. */
const tags = new Map<string, StoredLocation | null>();
/** Per athlete: the last accepted browse / arena reading (memory only). */
const readings = new Map<string, StoredLocation>();
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
      o.context === "go_live";
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

function persistQuietly(athleteId: string, entry: StoredLocation): void {
  try {
    void Promise.resolve(SecureStore.setItemAsync(keyFor(athleteId), JSON.stringify(entry))).catch(
      () => undefined,
    );
  } catch {
    // Memory still has it for this process.
  }
}

/**
 * The athlete whose readings are stored. A different athlete taking over (an
 * athlete switch) clears the previous one's entries. Starts the read into
 * memory.
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

/**
 * Read the athlete's tag into memory (once; deduped). Never rejects. Called
 * as soon as the athlete row loads (auth), so the cold-start restore can
 * decide its first frame from memory.
 */
export function loadDeviceLocation(athleteId: string): Promise<StoredLocation | null> {
  if (tags.has(athleteId)) return Promise.resolve(peekDeviceTag(athleteId));
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
    if (!tags.has(athleteId)) tags.set(athleteId, entry);
    return peekDeviceTag(athleteId);
  })().finally(() => {
    loading.delete(athleteId);
  });
  loading.set(athleteId, p);
  return p;
}

/** Whether the tag has been read into memory yet (synchronous callers). */
export function isDeviceLocationLoaded(athleteId: string): boolean {
  return tags.has(athleteId);
}

/**
 * The go_live tag, synchronously: null when absent, not read yet, or 4
 * hours old (which is deleted here, as the spec's "deleted on read").
 */
export function peekDeviceTag(athleteId: string, now: number = Date.now()): StoredLocation | null {
  const entry = tags.get(athleteId) ?? null;
  if (entry && expired(entry, now)) {
    tags.set(athleteId, null);
    removeQuietly(athleteId);
    return null;
  }
  return entry;
}

/** The last accepted browse / arena reading (memory), or null (expired too). */
export function peekDeviceReading(athleteId: string, now: number = Date.now()): StoredLocation | null {
  const entry = readings.get(athleteId) ?? null;
  if (entry && expired(entry, now)) {
    readings.delete(athleteId);
    return null;
  }
  return entry;
}

/** The go_live tag when it is valid for going live (`isGoLiveTagValid`), else null. */
export function validDeviceTag(athleteId: string | null, now: number = Date.now()): StoredLocation | null {
  if (!athleteId) return null;
  const entry = peekDeviceTag(athleteId, now);
  return entry && isGoLiveTagValid(entry, now) ? entry : null;
}

/** The browse / arena reading when it is valid for a rung 2 replay, else null. */
export function validDeviceReading(athleteId: string | null, now: number = Date.now()): StoredLocation | null {
  if (!athleteId) return null;
  const entry = peekDeviceReading(athleteId, now);
  return entry && isGoLiveTagValid(entry, now) ? entry : null;
}

/** Store an accepted reading in its slot (the tag is also persisted). Never moves backwards. */
export function saveDeviceLocation(athleteId: string, entry: StoredLocation): void {
  touched.add(athleteId);
  if (entry.context === "go_live") {
    const prev = tags.get(athleteId);
    // Never move the tag backwards (mirrors the server's rule D2).
    if (prev && prev.capturedAt > entry.capturedAt) return;
    tags.set(athleteId, entry);
    persistQuietly(athleteId, entry);
    return;
  }
  const prev = readings.get(athleteId);
  if (prev && prev.capturedAt > entry.capturedAt) return;
  readings.set(athleteId, entry);
}

/** Delete the athlete's go_live tag (a refused replay of it). */
export function clearDeviceTag(athleteId: string): void {
  tags.set(athleteId, null);
  removeQuietly(athleteId);
}

/** Delete the athlete's browse / arena reading (a refused replay of it). */
export function clearDeviceReading(athleteId: string): void {
  readings.delete(athleteId);
}

/** Delete both of the athlete's entries (sign-out, account deletion, a switch). */
export function clearDeviceLocation(athleteId: string): void {
  clearDeviceTag(athleteId);
  clearDeviceReading(athleteId);
}

/** Sign-out (voluntary or not) and account deletion: every athlete this process touched. */
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
 * only when the server accepted it (`ok:true`), and only for `athleteId`, the
 * athlete the REQUEST was made for (captured before the call). If the owner
 * changed meanwhile (sign-out, an athlete switch), nothing is stored.
 * `capturedAt`: when the reading was taken on the device (ms epoch).
 */
export function recordAcceptedReading(
  context: StoredLocationContext,
  reading: LocationReading,
  capturedAt: number,
  res: PresenceResult | null | undefined,
  athleteId: string | null = owner,
): void {
  if (!athleteId || athleteId !== owner || !res || !res.ok) return;
  // An older backend never gets a replay (presence-capability.ts), so there
  // is nothing to keep a tag for.
  if (getPresenceCapability() === "legacy") return;
  if (!Number.isFinite(reading.lat) || !Number.isFinite(reading.lng) || !Number.isFinite(reading.accuracyM)) return;
  const at = context === "go_live" ? (serverCapturedAt(res) ?? capturedAt) : capturedAt;
  saveDeviceLocation(athleteId, { lat: reading.lat, lng: reading.lng, accuracyM: reading.accuracyM, capturedAt: at, context });
}

// ---------------------------------------------------------------------------
// Dev only (QA testability): age the stored tag
// ---------------------------------------------------------------------------

/**
 * DEV ONLY: move the owner's stored tag (and reading) `hours` into the past,
 * so the 4 hour paths can be exercised on a simulator. Inert in production.
 */
export function __devAgeDeviceTag(hours: number): void {
  if (!__DEV__ || !owner) return;
  const shift = hours * 60 * 60 * 1000;
  const tag = tags.get(owner);
  if (tag) {
    const aged = { ...tag, capturedAt: tag.capturedAt - shift };
    tags.set(owner, aged);
    persistQuietly(owner, aged);
  }
  const reading = readings.get(owner);
  if (reading) readings.set(owner, { ...reading, capturedAt: reading.capturedAt - shift });
}

/** Tests only. */
export function __resetDeviceLocationStoreForTests(): void {
  tags.clear();
  readings.clear();
  loading.clear();
  touched.clear();
  owner = null;
}
