/**
 * Every Arena go-live / go-offline tap reports a failure and nothing else.
 *
 * Source: apps/mobile/lib/arena/go-live-feedback.ts
 */
const mockGoLive = jest.fn();
const mockGoOffline = jest.fn();
jest.mock("@/lib/arena/arena-store", () => ({
  arenaActions: {
    goLive: (...a: unknown[]) => mockGoLive(...a),
    goOffline: (...a: unknown[]) => mockGoOffline(...a),
  },
}));
const mockToastError = jest.fn();
const mockToastInfo = jest.fn();
jest.mock("@/components/ui/toast", () => ({
  toast: {
    error: (...a: unknown[]) => mockToastError(...a),
    info: (...a: unknown[]) => mockToastInfo(...a),
  },
}));

import {
  GO_LIVE_FAILED_MESSAGE,
  GO_OFFLINE_FAILED_MESSAGE,
  goLiveWithFeedback,
  goOfflineWithFeedback,
} from "@/lib/arena/go-live-feedback";

beforeEach(() => {
  mockGoLive.mockReset();
  mockGoOffline.mockReset();
  mockToastError.mockReset();
  mockToastInfo.mockReset();
});

/** Nothing toasted, in any tone. */
function expectSilent() {
  expect(mockToastInfo).not.toHaveBeenCalled();
  expect(mockToastError).not.toHaveBeenCalled();
}

/** One neutral toast: a live-flag write failure is NEVER red (spec 3). */
function expectNeutralFailure(message: string) {
  expect(mockToastInfo).toHaveBeenCalledTimes(1);
  expect(mockToastInfo).toHaveBeenCalledWith(message);
  expect(mockToastError).not.toHaveBeenCalled();
}

describe.each([
  ["goLiveWithFeedback", goLiveWithFeedback, mockGoLive, GO_LIVE_FAILED_MESSAGE],
  ["goOfflineWithFeedback", goOfflineWithFeedback, mockGoOffline, GO_OFFLINE_FAILED_MESSAGE],
] as const)("%s", (_name, run, action, message) => {
  it("stays silent when the switch succeeded (true)", async () => {
    action.mockResolvedValue(true);
    await run();
    expect(action).toHaveBeenCalledTimes(1);
    expectSilent();
  });

  it("says so, in the neutral tone, when the flag write failed (false)", async () => {
    action.mockResolvedValue(false);
    await run();
    expectNeutralFailure(message);
  });

  it("stays silent when the tap was ignored (locked or busy)", async () => {
    action.mockResolvedValue("ignored");
    await run();
    expectSilent();
  });

  it("says so when the action rejects, and never rejects itself", async () => {
    action.mockRejectedValue(new Error("network"));
    // Never rejects: resolves (nothing for go-live, false for go-offline).
    await expect(run()).resolves.toBeFalsy();
    expectNeutralFailure(message);
  });
});
