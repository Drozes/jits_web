import NetInfo from "@react-native-community/netinfo";
import { toNetworkSnapshot, type NetworkSnapshot } from "@jits/shared/utils";

/**
 * The latest network state, held synchronously for the quality policy
 * (spec 3.3). Subscribes to NetInfo once, lazily on first use. A player
 * opening reads the latest state; with none yet it awaits `NetInfo.fetch()`
 * for at most START_NETWORK_TIMEOUT_MS and otherwise starts with `null`
 * (`network_unknown`). Every call is defensive: NetInfo failing never
 * reaches playback.
 */
export const START_NETWORK_TIMEOUT_MS = 300;

let latest: NetworkSnapshot | null = null;
let known = false;
let subscribed = false;
const listeners = new Set<() => void>();

function set(state: unknown): void {
  latest = toNetworkSnapshot(state as never);
  known = latest !== null;
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* a listener must not break the others */
    }
  }
}

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  try {
    NetInfo.addEventListener((state) => set(state));
  } catch {
    /* no live updates: fetch at open still works */
  }
}

/** The latest snapshot, or null when none arrived yet. */
export function currentNetworkSnapshot(): NetworkSnapshot | null {
  ensureSubscribed();
  return latest;
}

/** Called on every network change (after the first use). */
export function subscribeNetwork(cb: () => void): () => void {
  ensureSubscribed();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The snapshot for a session start: the latest, else a fetch capped at 300 ms, else null. */
export async function networkSnapshotForStart(): Promise<NetworkSnapshot | null> {
  ensureSubscribed();
  if (known) return latest;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const fetched = await Promise.race([
      Promise.resolve()
        .then(() => NetInfo.fetch())
        .then((s) => toNetworkSnapshot(s as never)),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), START_NETWORK_TIMEOUT_MS);
      }),
    ]);
    if (fetched && !known) {
      latest = fetched;
      known = true;
    }
    return fetched;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Tests only. */
export function __resetNetworkStoreForTests(state: unknown = undefined): void {
  latest = state === undefined ? null : toNetworkSnapshot(state as never);
  known = latest !== null;
  subscribed = false;
  listeners.clear();
}

/** Tests only: simulate a NetInfo change. */
export function __setNetworkForTests(state: unknown): void {
  set(state);
}
