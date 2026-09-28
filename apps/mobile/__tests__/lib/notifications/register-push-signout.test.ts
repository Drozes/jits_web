/**
 * Sign-out unregisters this device's push row (discovery review M2): the
 * token registered in this process is deleted through the shared
 * `removePushDeviceByToken` (own rows only under RLS), bounded by a timeout,
 * never throwing, and a no-op when nothing was registered.
 */
jest.mock("expo-notifications", () => ({}));
jest.mock("expo-device", () => ({ isDevice: true }));
const mockRemove = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  registerPushDevice: jest.fn(),
  removePushDeviceByToken: (...a: unknown[]) => mockRemove(...a),
}));

import {
  UNREGISTER_PUSH_TIMEOUT_MS,
  __setRegisteredPushTokenForTests,
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
