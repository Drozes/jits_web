import { act, renderHook, waitFor } from "@testing-library/react-native";

// useFocusEffect is captured so a test can play "the screen regained focus".
const mockFocus: { cb: (() => void) | null } = { cb: null };
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void) => {
    const R = require("react");
    mockFocus.cb = cb;
    R.useEffect(() => {
      cb();
    }, [cb]);
  },
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

let mockAthleteId: string | undefined = "me-1";
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: mockAthleteId ? { id: mockAthleteId } : null }),
}));

const mockGet = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetailView: (...a: unknown[]) => mockGet(...a),
}));

import { useMatchDetail } from "@/lib/match-detail/use-match-detail";

const ID = "11111111-1111-4111-8111-111111111111";

function ok(tag: string) {
  return { ok: true, data: { match: { id: ID, tag }, videos: [] } };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAthleteId = "me-1";
  mockFocus.cb = null;
});

describe("useMatchDetail", () => {
  it("loads once on mount (the first focus does not refetch)", async () => {
    mockGet.mockResolvedValue(ok("a"));
    const { result } = renderHook(() => useMatchDetail(ID));
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith({}, ID, "me-1");
  });

  it("waits for the athlete before reading", () => {
    mockAthleteId = undefined;
    const { result } = renderHook(() => useMatchDetail(ID));
    expect(result.current.state).toBe("loading");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("does not write state after unmount", async () => {
    const d = deferred<unknown>();
    mockGet.mockReturnValue(d.promise);
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useMatchDetail(ID));
    const before = result.current;
    unmount();
    await act(async () => {
      d.resolve(ok("late"));
      await d.promise;
    });
    expect(result.current).toBe(before);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refetch keeps the data on screen (refreshing, never loading)", async () => {
    mockGet.mockResolvedValueOnce(ok("a"));
    const { result } = renderHook(() => useMatchDetail(ID));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    const d = deferred<unknown>();
    mockGet.mockReturnValueOnce(d.promise);
    act(() => result.current.refetch());
    expect(result.current.state).toBe("ready");
    expect(result.current.refreshing).toBe(true);
    expect((result.current.data?.match as unknown as { tag: string }).tag).toBe("a");

    await act(async () => {
      d.resolve(ok("b"));
      await d.promise;
    });
    expect(result.current.refreshing).toBe(false);
    expect((result.current.data?.match as unknown as { tag: string }).tag).toBe("b");
  });

  it("a failed refetch keeps the loaded match", async () => {
    mockGet.mockResolvedValueOnce(ok("a"));
    const { result } = renderHook(() => useMatchDetail(ID));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockGet.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(result.current.state).toBe("ready");
    expect(result.current.data).not.toBeNull();
  });

  it("surfaces the error when there is nothing loaded", async () => {
    mockGet.mockResolvedValue({ ok: false, error: { code: "NOT_PARTICIPANT", message: "x" } });
    const { result } = renderHook(() => useMatchDetail(ID));
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error?.code).toBe("NOT_PARTICIPANT");
    expect(result.current.data).toBeNull();
  });

  it("refetches when the screen regains focus", async () => {
    mockGet.mockResolvedValue(ok("a"));
    const { result } = renderHook(() => useMatchDetail(ID));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockFocus.cb?.();
    });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(result.current.state).toBe("ready");
  });
});
