/**
 * The athlete's last live choice, persisted per athlete (review round 3), so
 * a kill and relaunch honours it: an athlete whose last choice was offline is
 * never put back live by the cold-start restore, and a stale
 * `looking_for_ranked = true` is cleared instead. AsyncStorage (not secret);
 * key `arena-live-intent.<athleteId>`, value "live" | "offline".
 *
 * Read into memory as soon as the athlete row loads (auth), written on every
 * choice (`registerIntentPersister` in `<ArenaBootstrap />`). Failures read as
 * "unknown" (null): the restore then behaves as before.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "arena-live-intent.";
const memory = new Map<string, boolean | null>();
const loading = new Map<string, Promise<boolean | null>>();

function keyFor(athleteId: string): string {
  return `${KEY_PREFIX}${athleteId}`;
}

/** The athlete's last persisted choice: true live, false offline, null unknown. Never rejects. */
export function loadPersistedLiveIntent(athleteId: string): Promise<boolean | null> {
  if (memory.has(athleteId)) return Promise.resolve(memory.get(athleteId) ?? null);
  const inflight = loading.get(athleteId);
  if (inflight) return inflight;
  const p = (async () => {
    let value: boolean | null = null;
    try {
      const raw = await AsyncStorage.getItem(keyFor(athleteId));
      value = raw === "live" ? true : raw === "offline" ? false : null;
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

/** Record the athlete's choice (memory at once, storage in the background). */
export function persistLiveIntent(athleteId: string, live: boolean): void {
  memory.set(athleteId, live);
  try {
    void Promise.resolve(AsyncStorage.setItem(keyFor(athleteId), live ? "live" : "offline")).catch(
      () => undefined,
    );
  } catch {
    // Memory still has it for this process.
  }
}

/** Tests only. */
export function __resetPersistedLiveIntentForTests(): void {
  memory.clear();
  loading.clear();
}
