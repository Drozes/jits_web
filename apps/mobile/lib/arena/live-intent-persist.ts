/**
 * The athlete's last live choice, persisted per athlete (review rounds 3 and
 * 4), so a kill and relaunch honours it. AsyncStorage (not secret); key
 * `arena-live-intent.<athleteId>`, value JSON `{ live, at, confirmed }`:
 *
 *  - `live`: the choice (true live, false offline);
 *  - `at`: when it was made (device ms; diagnostics only);
 *  - `confirmed`: for an offline choice, whether a `looking_for_ranked =
 *    false` write LANDED after it (the server acknowledged it).
 *
 * Why `confirmed` and not a server timestamp (round 4, R2): on arrival with
 * `looking_for_ranked = true` the app must tell a stale `true` (its own
 * offline clear never landed: killed first, or it failed) from a NEWER live
 * session started elsewhere (web). The server's session start is not
 * readable by the client (`athlete_live_sessions` is server and admin only)
 * and `athletes` has no update time. The client does know whether its own
 * clear landed after the choice: if it did, any `true` the server holds now
 * was set after it, so it is newer and is adopted; if it did not, the
 * `true` predates the choice and is cleared. (Limit: an offline choice whose
 * clear never landed, followed by a go-live on web before this device
 * relaunches, reads as stale and is cleared; the athlete goes live again.)
 *
 * Read into memory as soon as the athlete row loads (auth), written on every
 * choice (`registerIntentPersister` in `<ArenaBootstrap />`). Failures read
 * as "unknown" (null): the arrival then behaves as before. The round 3 plain
 * values "live" / "offline" still read, as unconfirmed.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PersistedLiveIntent {
  live: boolean;
  at: number;
  confirmed: boolean;
}

const KEY_PREFIX = "arena-live-intent.";
/** How long the cold start waits on the stored choice before going without it. */
export const PERSISTED_INTENT_READ_BOUND_MS = 1_000;

const memory = new Map<string, PersistedLiveIntent | null>();
const loading = new Map<string, Promise<PersistedLiveIntent | null>>();
/** Deleted accounts: nothing is persisted for them again in this process. */
const forgotten = new Set<string>();

function keyFor(athleteId: string): string {
  return `${KEY_PREFIX}${athleteId}`;
}

function parse(raw: string | null): PersistedLiveIntent | null {
  if (raw === "live") return { live: true, at: 0, confirmed: false };
  if (raw === "offline") return { live: false, at: 0, confirmed: false };
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PersistedLiveIntent> | null;
    if (!v || typeof v.live !== "boolean") return null;
    return { live: v.live, at: typeof v.at === "number" ? v.at : 0, confirmed: v.confirmed === true };
  } catch {
    return null;
  }
}

function write(athleteId: string, value: PersistedLiveIntent): void {
  memory.set(athleteId, value);
  try {
    void Promise.resolve(AsyncStorage.setItem(keyFor(athleteId), JSON.stringify(value))).catch(() => undefined);
  } catch {
    // Memory still has it for this process.
  }
}

/** The athlete's last persisted choice, or null (unknown). Never rejects. */
export function loadPersistedLiveIntent(athleteId: string): Promise<PersistedLiveIntent | null> {
  if (memory.has(athleteId)) return Promise.resolve(memory.get(athleteId) ?? null);
  const inflight = loading.get(athleteId);
  if (inflight) return inflight;
  const p = (async () => {
    let value: PersistedLiveIntent | null = null;
    try {
      value = parse(await AsyncStorage.getItem(keyFor(athleteId)));
    } catch {
      value = null;
    }
    // A choice persisted while the read was in flight is newer.
    if (!memory.has(athleteId)) memory.set(athleteId, value);
    return memory.get(athleteId) ?? null;
  })().finally(() => {
    loading.delete(athleteId);
  });
  loading.set(athleteId, p);
  return p;
}

/**
 * The stored choice, never waited on for longer than `ms` (round 4 nit): a
 * storage read that hangs reads as unknown (null), and the arrival goes on.
 */
export async function loadPersistedLiveIntentBounded(
  athleteId: string,
  ms = PERSISTED_INTENT_READ_BOUND_MS,
): Promise<PersistedLiveIntent | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loadPersistedLiveIntent(athleteId),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The stored choice if already in memory; undefined when not read yet. Synchronous, for a first frame. */
export function peekPersistedLiveIntent(athleteId: string): PersistedLiveIntent | null | undefined {
  return memory.has(athleteId) ? (memory.get(athleteId) ?? null) : undefined;
}

/** Record the athlete's choice (memory at once, storage in the background). */
export function persistLiveIntent(athleteId: string, live: boolean): void {
  if (!athleteId || forgotten.has(athleteId)) return;
  write(athleteId, { live, at: Date.now(), confirmed: false });
}

/**
 * A `false` write landed: an offline choice on record is now confirmed (the
 * server acknowledged it after the choice). A live choice is left alone.
 */
export function confirmPersistedOffline(athleteId: string): void {
  if (!athleteId || forgotten.has(athleteId)) return;
  const cur = memory.get(athleteId);
  if (!cur || cur.live || cur.confirmed) return;
  write(athleteId, { ...cur, confirmed: true });
}

/**
 * What an arrival with `looking_for_ranked = true` does with the stored
 * choice: "clear" a stale true (an offline choice whose clear never landed),
 * else "restore" (a live choice, nothing stored, or an offline choice whose
 * clear landed, so the server's live session is newer and is adopted).
 */
export function arrivalDecision(persisted: PersistedLiveIntent | null | undefined): "clear" | "restore" {
  return persisted && !persisted.live && !persisted.confirmed ? "clear" : "restore";
}

/**
 * The account was deleted: forget every stored choice, and persist nothing
 * for those athletes again in this process (sign-out runs after and would
 * otherwise write one back).
 */
export async function clearAllPersistedLiveIntents(): Promise<void> {
  for (const id of memory.keys()) forgotten.add(id);
  memory.clear();
  loading.clear();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY_PREFIX));
    for (const k of keys) forgotten.add(k.slice(KEY_PREFIX.length));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Best effort: nothing in it identifies more than a live / offline choice.
  }
}

/** Tests only. */
export function __resetPersistedLiveIntentForTests(): void {
  memory.clear();
  loading.clear();
  forgotten.clear();
}
