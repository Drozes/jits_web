import * as React from "react";
import NetInfo, {
  type NetInfoState,
  type NetInfoStateType,
} from "@react-native-community/netinfo";

/**
 * Network status hook backed by `@react-native-community/netinfo`.
 *
 * Mirrors web's `navigator.onLine` semantics but with the richer NetInfo
 * payload. The defaults are deliberately optimistic so the UI does not
 * flash "offline" during the first paint before NetInfo has resolved.
 *
 * Consumers:
 * - `<OfflineBanner />` -- top-of-screen banner
 * - `mutation-queue.ts` -- triggers `flush()` on reconnect
 */
export type NetworkStatus = {
  /** True if the device reports any link layer (wifi/cellular/etc.). Optimistic default `true`. */
  isConnected: boolean;
  /** True if NetInfo has reachability probes confirming internet. `null` until probed. */
  isInternetReachable: boolean | null;
  /** Connection type. `"unknown"` until NetInfo has resolved. */
  type: NetInfoStateType | "unknown";
};

export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = React.useState<NetInfoState | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const unsub = NetInfo.addEventListener((next) => {
      if (!cancelled) setState(next);
    });

    NetInfo.fetch().then((initial) => {
      if (!cancelled) setState(initial);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return {
    isConnected: state?.isConnected ?? true,
    isInternetReachable: state?.isInternetReachable ?? null,
    type: state?.type ?? "unknown",
  };
}
