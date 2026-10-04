/**
 * A synchronous "is the device known to be offline right now?" for the Go
 * Live tap (UX 019, 3g): with no connection the optimistic flip is skipped,
 * because the write cannot land and the offline banner is already up.
 *
 * Only a definite `isConnected === false` counts as offline; unknown (NetInfo
 * not resolved yet, or not available, as in tests) is treated as online, so
 * the tap takes the recovering path instead (UX 019, assumption 3). The
 * subscription starts lazily on the first call and lives for the process.
 */
type NetInfoModule = {
  addEventListener: (cb: (s: { isConnected: boolean | null }) => void) => () => void;
  fetch: () => Promise<{ isConnected: boolean | null }>;
};

let connected: boolean | null = null;
let started = false;

function start(): void {
  if (started) return;
  started = true;
  try {
    // Lazy, so suites that never mock NetInfo do not load its native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-community/netinfo") as { default?: NetInfoModule } & NetInfoModule;
    const netInfo: NetInfoModule = mod.default ?? mod;
    netInfo.addEventListener((s) => {
      connected = s.isConnected;
    });
    void Promise.resolve(netInfo.fetch())
      .then((s) => {
        if (connected === null) connected = s.isConnected;
      })
      .catch(() => undefined);
  } catch {
    connected = null;
  }
}

/** True only when NetInfo says there is no connection. */
export function isKnownOffline(): boolean {
  start();
  return connected === false;
}

/** Tests only. */
export function __setConnectivityForTests(next: boolean | null): void {
  started = true;
  connected = next;
}
