/**
 * useMatchDetails: a failed RE-fetch of the match already in hand must not
 * blank the wizard. `getMatchDetails` returns null on any failure (a network
 * blip included), and treating that as "match not found" replaced a finished
 * match's summary with "Match unavailable" and switched the reconciler off.
 */

const mockGetMatchDetails = jest.fn();
const mockGetSubmissionTypes = jest.fn();

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getSubmissionTypes: (...a: unknown[]) => mockGetSubmissionTypes(...a),
}));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { REFETCH_RETRY_DELAY_MS, useMatchDetails } from "@/lib/match-flow/use-match-details";

function match(id: string, status = "completed") {
  return { id, status, participants: [] } as unknown as Record<string, unknown>;
}

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSubmissionTypes.mockResolvedValue([]);
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe("useMatchDetails", () => {
  it("sets an error when the FIRST load finds no match", async () => {
    mockGetMatchDetails.mockResolvedValue(null);
    const { result } = renderHook(() => useMatchDetails("M1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Match not found");
    expect(result.current.match).toBeNull();
  });

  it("keeps the loaded match and sets no error when a re-fetch returns null", async () => {
    mockGetMatchDetails.mockResolvedValueOnce(match("M1"));
    const { result } = renderHook(() => useMatchDetails("M1"));
    await waitFor(() => expect(result.current.match?.id).toBe("M1"));

    mockGetMatchDetails.mockResolvedValueOnce(null);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.match?.id).toBe("M1");
  });

  it("keeps the loaded match and sets no error when a re-fetch throws", async () => {
    mockGetMatchDetails.mockResolvedValueOnce(match("M1"));
    const { result } = renderHook(() => useMatchDetails("M1"));
    await waitFor(() => expect(result.current.match?.id).toBe("M1"));

    mockGetMatchDetails.mockRejectedValueOnce(new Error("Network request failed"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.match?.id).toBe("M1");
  });

  it("still treats a failed load for a DIFFERENT match id as a first load", async () => {
    mockGetMatchDetails.mockResolvedValueOnce(match("M1"));
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useMatchDetails(id),
      { initialProps: { id: "M1" } },
    );
    await waitFor(() => expect(result.current.match?.id).toBe("M1"));

    mockGetMatchDetails.mockResolvedValueOnce(null);
    rerender({ id: "M2" });
    await waitFor(() => expect(result.current.error).toBe("Match not found"));
    expect(result.current.match).toBeNull();
  });
});

describe("useMatchDetails: one delayed retry after a failed re-fetch (jits-w2h7)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  async function loaded() {
    mockGetMatchDetails.mockResolvedValueOnce(match("M1", "pending_confirmation"));
    const hook = renderHook(() => useMatchDetails("M1"));
    await waitFor(() => expect(hook.result.current.match?.id).toBe("M1"));
    jest.useFakeTimers();
    return hook;
  }

  async function flush() {
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
  }

  it("retries once after the delay and applies the fresh read", async () => {
    const { result } = await loaded();
    mockGetMatchDetails.mockRejectedValueOnce(new Error("Network request failed"));
    act(() => result.current.refresh());
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);

    mockGetMatchDetails.mockResolvedValueOnce(match("M1", "completed"));
    await act(async () => {
      jest.advanceTimersByTime(REFETCH_RETRY_DELAY_MS);
    });
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(3);
    expect(result.current.match?.status).toBe("completed");
    expect(result.current.error).toBeNull();
  });

  it("retries a null re-read too, but only ONCE when the retry also fails", async () => {
    const { result } = await loaded();
    mockGetMatchDetails.mockResolvedValue(null);
    act(() => result.current.refresh());
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(REFETCH_RETRY_DELAY_MS);
    });
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(3);

    await act(async () => {
      jest.advanceTimersByTime(REFETCH_RETRY_DELAY_MS * 5);
    });
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(3);
    expect(result.current.match?.id).toBe("M1");
  });

  it("does not retry after unmount", async () => {
    const { result, unmount } = await loaded();
    mockGetMatchDetails.mockRejectedValueOnce(new Error("offline"));
    act(() => result.current.refresh());
    await flush();
    unmount();
    jest.advanceTimersByTime(REFETCH_RETRY_DELAY_MS * 2);
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);
  });

  it("does not retry a successful re-fetch", async () => {
    const { result } = await loaded();
    mockGetMatchDetails.mockResolvedValueOnce(match("M1", "completed"));
    act(() => result.current.refresh());
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(REFETCH_RETRY_DELAY_MS * 2);
    });
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);
  });
});
