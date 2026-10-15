/**
 * The system permission prompt counter and its safety nets (jits-3dc2,
 * review B1 of jits-mafl.2):
 *
 *  - the dialog guard is Android only (iOS reports a dialog as "inactive", so
 *    an iOS "background" is a real Home press);
 *  - a request older than 60 s stops counting (a native promise that never
 *    settles cannot hold the guard forever), and its expiry fires the settle
 *    hook;
 *  - the settle hook fires when the LAST request settles;
 *  - `permissionDialogBackgroundGuard` replays an ignored background once the
 *    requests settle, 1 s later, only if the app is still in the background,
 *    no new prompt is up and no other AppState event arrived meanwhile.
 *
 * Source: apps/mobile/lib/permissions/permission-request.ts
 */
import { AppState, Platform } from "react-native";
import {
  PERMISSION_REQUEST_MAX_AGE_MS,
  SETTLE_REPLAY_DELAY_MS,
  __resetPermissionRequestsForTests,
  ignoreBackgroundForPermissionDialog,
  onPermissionRequestsSettled,
  permissionDialogBackgroundGuard,
  permissionRequestInFlight,
  trackPermissionRequest,
} from "@/lib/permissions/permission-request";

const ORIGINAL_OS = Platform.OS;
function setOS(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}
function setAppState(s: string) {
  Object.defineProperty(AppState, "currentState", { value: s, configurable: true, writable: true });
}

/** A prompt the test answers by hand. */
function prompt() {
  let answer!: () => void;
  const done = trackPermissionRequest(() => new Promise<void>((r) => (answer = r)));
  return { answer: async () => {
    answer();
    await done;
  } };
}

beforeEach(() => {
  jest.useFakeTimers();
  __resetPermissionRequestsForTests();
  setOS("android");
  setAppState("active");
});

afterEach(() => {
  jest.useRealTimers();
  setOS(ORIGINAL_OS as "ios" | "android");
});

describe("in flight", () => {
  it("is held while a prompt is up and released when it settles, even if it throws", async () => {
    expect(permissionRequestInFlight()).toBe(false);
    const p = prompt();
    expect(permissionRequestInFlight()).toBe(true);
    await p.answer();
    expect(permissionRequestInFlight()).toBe(false);
    await expect(trackPermissionRequest(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(permissionRequestInFlight()).toBe(false);
  });

  it("the background guard is Android only", () => {
    prompt();
    expect(ignoreBackgroundForPermissionDialog()).toBe(true);
    setOS("ios");
    expect(ignoreBackgroundForPermissionDialog()).toBe(false);
  });

  it("a request that never settles stops counting after the max age, and that fires the settle hook", async () => {
    const settled = jest.fn();
    onPermissionRequestsSettled(settled);
    trackPermissionRequest(() => new Promise(() => undefined));
    await jest.advanceTimersByTimeAsync(PERMISSION_REQUEST_MAX_AGE_MS - 1);
    expect(permissionRequestInFlight()).toBe(true);
    expect(settled).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(permissionRequestInFlight()).toBe(false);
    expect(ignoreBackgroundForPermissionDialog()).toBe(false);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("the settle hook fires once the LAST request settles", async () => {
    const settled = jest.fn();
    onPermissionRequestsSettled(settled);
    const a = prompt();
    const b = prompt();
    await a.answer();
    expect(settled).not.toHaveBeenCalled();
    await b.answer();
    expect(settled).toHaveBeenCalledTimes(1);
  });
});

describe("permissionDialogBackgroundGuard", () => {
  it("Android: ignores the dialog's background, then replays it when the app is still backgrounded after settle", async () => {
    const replay = jest.fn();
    const guard = permissionDialogBackgroundGuard(replay);
    const p = prompt();
    setAppState("background");
    expect(guard.ignore("background")).toBe(true);
    await p.answer();
    await jest.advanceTimersByTimeAsync(SETTLE_REPLAY_DELAY_MS - 1);
    expect(replay).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(replay).toHaveBeenCalledTimes(1);
    guard.dispose();
  });

  it("no replay when the app is back in the foreground", async () => {
    const replay = jest.fn();
    const guard = permissionDialogBackgroundGuard(replay);
    const p = prompt();
    expect(guard.ignore("background")).toBe(true);
    await p.answer();
    setAppState("active");
    await jest.advanceTimersByTimeAsync(SETTLE_REPLAY_DELAY_MS);
    expect(replay).not.toHaveBeenCalled();
    guard.dispose();
  });

  it("no replay once the owner saw another AppState event (it already handled what came next)", async () => {
    const replay = jest.fn();
    const guard = permissionDialogBackgroundGuard(replay);
    const p = prompt();
    guard.ignore("background");
    await p.answer();
    expect(guard.ignore("active")).toBe(false);
    setAppState("background");
    expect(guard.ignore("background")).toBe(false);
    await jest.advanceTimersByTimeAsync(SETTLE_REPLAY_DELAY_MS);
    expect(replay).not.toHaveBeenCalled();
    guard.dispose();
  });

  it("a hung request: the max age releases the hold and the background replays", async () => {
    const replay = jest.fn();
    const guard = permissionDialogBackgroundGuard(replay);
    trackPermissionRequest(() => new Promise(() => undefined));
    setAppState("background");
    expect(guard.ignore("background")).toBe(true);
    await jest.advanceTimersByTimeAsync(PERMISSION_REQUEST_MAX_AGE_MS + SETTLE_REPLAY_DELAY_MS);
    expect(replay).toHaveBeenCalledTimes(1);
    guard.dispose();
  });

  it("iOS: never ignores a background, even with a prompt up", () => {
    setOS("ios");
    const guard = permissionDialogBackgroundGuard(jest.fn());
    prompt();
    expect(guard.ignore("background")).toBe(false);
    guard.dispose();
  });

  it("dispose cancels a pending replay", async () => {
    const replay = jest.fn();
    const guard = permissionDialogBackgroundGuard(replay);
    const p = prompt();
    setAppState("background");
    guard.ignore("background");
    await p.answer();
    guard.dispose();
    await jest.advanceTimersByTimeAsync(SETTLE_REPLAY_DELAY_MS);
    expect(replay).not.toHaveBeenCalled();
  });
});
