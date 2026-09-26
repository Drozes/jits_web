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
import { useMatchDetails } from "@/lib/match-flow/use-match-details";

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
