/**
 * Sign-out unregisters this device's push row (discovery review M2): the
 * token registered in this process is deleted through the shared
 * `removePushDeviceByToken` (own rows only under RLS), bounded by a timeout,
 * never throwing, and a no-op when nothing was registered.
 */
const mockGetToken = jest.fn();
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => Promise.resolve({ status: "granted" }),
  requestPermissionsAsync: () => Promise.resolve({ status: "granted" }),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetToken(...a),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock("expo-device", () => ({ isDevice: true, osName: "iOS", modelName: "iPhone" }));
const mockRemove = jest.fn();
const mockRegister = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  registerPushDevice: (...a: unknown[]) => mockRegister(...a),
  removePushDeviceByToken: (...a: unknown[]) => mockRemove(...a),
}));

import {
  UNREGISTER_PUSH_TIMEOUT_MS,
  __getRegisteredPushTokenForTests,
  __setRegisteredPushTokenForTests,
  registerForPushNotifications,
  unregisterPushDeviceOnSignOut,
} from "@/lib/notifications/register-push";

const SB = { tag: "sb" } as never;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  __setRegisteredPushTokenForTests(null);
});

describe("unregisterPushDeviceOnSignOut", () => {
  it("deletes the registered token's row, once", async () => {
    mockRemove.mockResolvedValue({ ok: true, data: undefined });
    __setRegisteredPushTokenForTests("ExponentPushToken[abc]");
    await unregisterPushDeviceOnSignOut(SB);
    expect(mockRemove).toHaveBeenCalledWith(SB, "ExponentPushToken[abc]");
    await unregisterPushDeviceOnSignOut(SB);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when this process registered nothing", async () => {
    await unregisterPushDeviceOnSignOut(SB);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("never throws when the delete rejects or fails", async () => {
    __setRegisteredPushTokenForTests("t1");
    mockRemove.mockRejectedValueOnce(new Error("offline"));
    await expect(unregisterPushDeviceOnSignOut(SB)).resolves.toBeUndefined();
    __setRegisteredPushTokenForTests("t2");
    mockRemove.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    await expect(unregisterPushDeviceOnSignOut(SB)).resolves.toBeUndefined();
  });

  it("gives up after the timeout so sign-out is never stuck", async () => {
    jest.useFakeTimers();
    __setRegisteredPushTokenForTests("t3");
    mockRemove.mockReturnValue(new Promise(() => undefined));
    let done = false;
    const p = unregisterPushDeviceOnSignOut(SB).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    jest.advanceTimersByTime(UNREGISTER_PUSH_TIMEOUT_MS);
    await p;
    expect(done).toBe(true);
  });
});


describe("sign-out generation (a registration racing a sign-out)", () => {
  it("a registration that finishes normally stores its token", async () => {
    mockGetToken.mockResolvedValue({ data: "tok-1" });
    mockRegister.mockResolvedValue({ ok: true, data: undefined });
    const res = await registerForPushNotifications(SB, "a1");
    expect(res).toEqual({ ok: true, token: "tok-1" });
    expect(__getRegisteredPushTokenForTests()).toBe("tok-1");
  });

  it("a registration that started before a sign-out does not store its token after it", async () => {
    let finish: (v: unknown) => void = () => undefined;
    mockGetToken.mockResolvedValue({ data: "tok-late" });
    mockRegister.mockReturnValue(new Promise((r) => (finish = r)));
    const pending = registerForPushNotifications(SB, "a1");
    await new Promise((r) => setTimeout(r, 0));
    await unregisterPushDeviceOnSignOut(SB); // nothing stored yet: a no-op delete
    finish({ ok: true, data: undefined });
    await pending;
    expect(__getRegisteredPushTokenForTests()).toBeNull();
    // So the NEXT account's sign-out never deletes the previous account's row.
    await unregisterPushDeviceOnSignOut(SB);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
