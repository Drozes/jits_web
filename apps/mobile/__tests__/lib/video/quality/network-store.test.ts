import NetInfo from "@react-native-community/netinfo";
import {
  START_NETWORK_TIMEOUT_MS,
  __resetNetworkStoreForTests,
  __setNetworkForTests,
  currentNetworkSnapshot,
  networkSnapshotForStart,
  subscribeNetwork,
} from "@/lib/video/quality/network-store";

const fetchMock = NetInfo.fetch as jest.Mock;

beforeEach(() => {
  __resetNetworkStoreForTests();
  fetchMock.mockReset();
});

describe("network store", () => {
  it("uses the latest known state at once", async () => {
    __setNetworkForTests({ type: "cellular", details: { cellularGeneration: "4g", isConnectionExpensive: true } });
    expect(await networkSnapshotForStart()).toEqual({ type: "cellular", cellularGeneration: "4g", isExpensive: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with no state yet, fetches once", async () => {
    fetchMock.mockResolvedValue({ type: "wifi", details: null });
    expect(await networkSnapshotForStart()).toEqual({ type: "wifi", cellularGeneration: null, isExpensive: false });
    expect(currentNetworkSnapshot()?.type).toBe("wifi");
  });

  it("gives up after 300 ms (network_unknown)", async () => {
    jest.useFakeTimers();
    fetchMock.mockReturnValue(new Promise(() => undefined));
    const p = networkSnapshotForStart();
    await Promise.resolve();
    jest.advanceTimersByTime(START_NETWORK_TIMEOUT_MS);
    await expect(p).resolves.toBeNull();
    jest.useRealTimers();
  });

  it("a failing fetch is null, never a rejection", async () => {
    fetchMock.mockRejectedValue(new Error("x"));
    await expect(networkSnapshotForStart()).resolves.toBeNull();
  });

  it("notifies subscribers of a change", () => {
    const cb = jest.fn();
    const off = subscribeNetwork(cb);
    __setNetworkForTests({ type: "wifi" });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    __setNetworkForTests({ type: "none" });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
