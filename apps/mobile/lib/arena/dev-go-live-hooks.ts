/**
 * DEV-ONLY QA hooks for the instant go-live flow (review round 1, QA
 * testability). Every entry point checks `__DEV__` first, which Metro
 * replaces with `false` in a production bundle, so the minifier drops the
 * bodies and nothing here can change a release build (verified by grepping
 * the `expo export` bundle for the menu titles).
 *
 * What they do (one-shot faults are consumed by the next matching call):
 *  - age the stored device tag by N hours (`__devAgeDeviceTag`);
 *  - make the next `go_live` report or live write fail at once, or hang N
 *    seconds and then fail (no network / a slow write);
 *  - make the next location fix time out, or come back with a given
 *    accuracy (300 m: too rough; 1414 m: iOS Precise Location off).
 *
 * How to trigger: the React Native dev menu (shake, or Cmd+D in the iOS
 * simulator) lists "Go live: ..." items, registered once by
 * `<ArenaBootstrap />`. For any other value, use the JS debugger console:
 * `__goLiveDev.ageTag(5)`, `__goLiveDev.failNext("write", 20)`,
 * `__goLiveDev.nextFix({ accuracyM: 300 })`, `__goLiveDev.clear()`.
 * Documented in research/019-optimistic-go-live-ux.md, appendix A.
 */
import { DevSettings } from "react-native";
import { __devAgeDeviceTag } from "@/lib/location/device-location-store";

export type DevFaultTarget = "report" | "write";
/** `hangMs` 0: fail at once; otherwise wait that long, then fail. */
interface DevFault {
  hangMs: number;
}
export type DevFix = { kind: "timeout" } | { kind: "accuracy"; accuracyM: number };

const faults: Partial<Record<DevFaultTarget, DevFault>> = {};
let nextFix: DevFix | null = null;
let registered = false;

/** Queue a one-shot failure for the next report or write. Dev only. */
export function devFailNext(target: DevFaultTarget, hangSeconds = 0): void {
  if (!__DEV__) return;
  faults[target] = { hangMs: Math.max(0, hangSeconds) * 1000 };
}

/** Queue a one-shot fix override. Dev only. */
export function devNextFix(fix: DevFix | null): void {
  if (!__DEV__) return;
  nextFix = fix;
}

/** Drop every queued fault. Dev only. */
export function devClearFaults(): void {
  if (!__DEV__) return;
  delete faults.report;
  delete faults.write;
  nextFix = null;
}

/**
 * Run `work`, unless a fault is queued for `target`: then wait its hang time
 * and resolve `failed` instead, without calling `work`. Production: `work()`.
 */
export async function withDevFault<T>(target: DevFaultTarget, work: () => Promise<T>, failed: T): Promise<T> {
  if (!__DEV__) return work();
  const fault = faults[target];
  if (!fault) return work();
  delete faults[target];
  if (fault.hangMs > 0) await new Promise((r) => setTimeout(r, fault.hangMs));
  return failed;
}

/** The queued fix override, consumed. Production: always null. */
export function takeDevFix(): DevFix | null {
  if (!__DEV__) return null;
  const fix = nextFix;
  nextFix = null;
  return fix;
}

/** Register the dev menu items and the `__goLiveDev` console handle once. Dev only. */
export function registerGoLiveDevHooks(): void {
  if (!__DEV__ || registered) return;
  registered = true;
  const api = {
    ageTag: (hours: number) => __devAgeDeviceTag(hours),
    failNext: (target: DevFaultTarget, hangSeconds = 0) => devFailNext(target, hangSeconds),
    nextFix: (fix: { accuracyM?: number; timeout?: boolean } | null) =>
      devNextFix(
        fix === null
          ? null
          : fix.timeout
            ? { kind: "timeout" }
            : { kind: "accuracy", accuracyM: fix.accuracyM ?? 300 },
      ),
    clear: () => devClearFaults(),
  };
  (globalThis as unknown as { __goLiveDev?: typeof api }).__goLiveDev = api;
  // No native dev menu under jest (the console handle is enough there).
  if (process.env.NODE_ENV === "test") return;
  try {
    const add = (title: string, fn: () => void) => DevSettings.addMenuItem?.(title, fn);
    add("Go live: age stored tag by 4 h", () => api.ageTag(4));
    add("Go live: next report fails", () => api.failNext("report"));
    add("Go live: next write hangs 20 s, then fails", () => api.failNext("write", 20));
    add("Go live: next write fails", () => api.failNext("write"));
    add("Go live: next fix times out", () => api.nextFix({ timeout: true }));
    add("Go live: next fix 300 m (too rough)", () => api.nextFix({ accuracyM: 300 }));
    add("Go live: next fix 1414 m (Precise off)", () => api.nextFix({ accuracyM: 1414 }));
    add("Go live: clear dev faults", () => api.clear());
  } catch {
    // No dev menu (tests): the console handle is enough.
  }
}
