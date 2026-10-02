/**
 * The face-off location re-poll's outcome mapping (live location fixes 4.6,
 * apps/mobile/lib/match-flow/use-faceoff-location-log.ts): only with
 * permission already granted, never asking; `match_start` outcomes ok,
 * permission_denied, timeout, unavailable, accuracy_too_low (coordinates
 * still sent); once per match per mount.
 */
import { renderHook, waitFor } from "@testing-library/react-native";

const mockRead = jest.fn();
jest.mock("@/lib/invites/location", () => ({
  GOOD_ACCURACY_M: 100,
  readLocationOnce: (...a: unknown[]) => mockRead(...a),
}));
const mockLog = jest.fn();
jest.mock("@/lib/arena/location-telemetry", () => ({
  logMatchStartLocation: (...a: unknown[]) => mockLog(...a),
}));

import { faceoffLocationOutcome, useFaceoffLocationLog } from "@/lib/match-flow/use-faceoff-location-log";

const READING = { lat: 1, lng: 2, accuracyM: 20 };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("faceoffLocationOutcome", () => {
  it.each([
    ["ok", { status: "ok", reading: READING }, { outcome: "ok", reading: READING }],
    [
      "accuracy_too_low (coords still sent)",
      { status: "ok", reading: { ...READING, accuracyM: 250 } },
      { outcome: "accuracy_too_low", reading: { ...READING, accuracyM: 250 } },
    ],
    [
      "accuracy_too_low on reduced precision",
      { status: "ok", reading: READING, reducedPrecision: true },
      { outcome: "accuracy_too_low", reading: READING },
    ],
    ["permission_denied", { status: "denied", canAskAgain: true }, { outcome: "permission_denied", reading: null }],
    ["timeout", { status: "unavailable", reason: "timeout" }, { outcome: "timeout", reading: null }],
    ["unavailable", { status: "unavailable", reason: "error" }, { outcome: "unavailable", reading: null }],
    ["unavailable (no reason)", { status: "unavailable" }, { outcome: "unavailable", reading: null }],
  ])("%s", async (_c, result, expected) => {
    mockRead.mockResolvedValue(result);
    expect(await faceoffLocationOutcome()).toEqual(expected);
    expect(mockRead).toHaveBeenCalledWith({ ask: false, fast: true });
  });

  it("a throwing reader is unavailable, never a throw", async () => {
    mockRead.mockRejectedValue(new Error("x"));
    expect(await faceoffLocationOutcome()).toEqual({ outcome: "unavailable", reading: null });
  });
});

describe("useFaceoffLocationLog", () => {
  it("logs once per match per mount, only while active, and again for a new match", async () => {
    mockRead.mockResolvedValue({ status: "ok", reading: READING });
    const r = renderHook(({ id, active }: { id: string; active: boolean }) => useFaceoffLocationLog(id, active), {
      initialProps: { id: "M1", active: false },
    });
    expect(mockRead).not.toHaveBeenCalled();
    r.rerender({ id: "M1", active: true });
    await waitFor(() => expect(mockLog).toHaveBeenCalledWith("M1", "ok", READING));
    r.rerender({ id: "M1", active: false });
    r.rerender({ id: "M1", active: true });
    r.rerender({ id: "M2", active: true });
    await waitFor(() => expect(mockLog).toHaveBeenCalledTimes(2));
    expect(mockLog).toHaveBeenLastCalledWith("M2", "ok", READING);
    expect(mockRead).toHaveBeenCalledTimes(2);
  });
});
