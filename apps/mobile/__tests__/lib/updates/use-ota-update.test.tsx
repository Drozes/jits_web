/**
 * useOtaUpdate: the expo-updates glue. The native module is replaced by a
 * small store so tests can simulate a background download landing, and
 * AppState is driven through a spied listener.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import {
  __resetArenaStoreForTests,
  useArenaMatchScreen,
} from "@/lib/arena/arena-store";
import { toast } from "@/components/ui/toast";
import { UPDATE_CHECK_MIN_INTERVAL_MS } from "@/lib/updates/update-policy";
import {
  RESTART_FAILED_MESSAGE,
  RESTART_STUCK_MS,
  useOtaUpdate,
} from "@/lib/updates/use-ota-update";

type UpdatesState = {
  isUpdatePending: boolean;
  downloadedUpdate: unknown;
  isStartupProcedureRunning: boolean;
};

const mockUpdates = {
  isEnabled: true,
  runningUpdateId: null as string | null,
  state: {
    isUpdatePending: false,
    downloadedUpdate: undefined,
    isStartupProcedureRunning: false,
  } as UpdatesState,
  listeners: new Set<() => void>(),
};

jest.mock("expo-updates", () => {
  const React = require("react");
  return {
    __esModule: true,
    get isEnabled() {
      return mockUpdates.isEnabled;
    },
    get updateId() {
      return mockUpdates.runningUpdateId;
    },
    UpdateInfoType: { NEW: "new", ROLLBACK: "rollback" },
    checkForUpdateAsync: jest.fn(),
    fetchUpdateAsync: jest.fn(),
    reloadAsync: jest.fn(),
    useUpdates: () =>
      React.useSyncExternalStore(
        (cb: () => void) => {
          mockUpdates.listeners.add(cb);
          return () => mockUpdates.listeners.delete(cb);
        },
        () => mockUpdates.state,
      ),
  };
});

const mockConstants = { extra: {} as Record<string, unknown>, env: "standalone" };
jest.mock("expo-constants", () => ({
  __esModule: true,
  ExecutionEnvironment: { StoreClient: "storeClient", Standalone: "standalone" },
  default: {
    get expoConfig() {
      return { extra: mockConstants.extra };
    },
    get executionEnvironment() {
      return mockConstants.env;
    },
  },
}));

jest.mock("@/components/ui/toast", () => ({ toast: { error: jest.fn() } }));

const check = Updates.checkForUpdateAsync as jest.Mock;
const fetch = Updates.fetchUpdateAsync as jest.Mock;
const reload = Updates.reloadAsync as jest.Mock;

let appStateCb: ((s: string) => void) | null = null;
const mockSubRemove = jest.fn();
const addListener = jest.spyOn(AppState, "addEventListener");

function setUpdates(next: Partial<UpdatesState>) {
  act(() => {
    mockUpdates.state = { ...mockUpdates.state, ...next };
    for (const l of mockUpdates.listeners) l();
  });
}

function download(updateId: string, index?: number, notice?: string) {
  const extra: Record<string, unknown> = {};
  if (index !== undefined) extra.updateCriticalIndex = index;
  if (notice !== undefined) extra.updateNotice = notice;
  setUpdates({
    isUpdatePending: true,
    downloadedUpdate: {
      type: "new",
      updateId,
      manifest: { extra: { expoClient: { extra } } },
    },
  });
}

async function appState(next: string) {
  await act(async () => {
    appStateCb?.(next);
  });
}

async function foreground() {
  await appState("background");
  await appState("active");
}

const realDev = (global as unknown as { __DEV__: boolean }).__DEV__;
let now = 1_000_000;

beforeEach(() => {
  __resetArenaStoreForTests();
  jest.clearAllMocks();
  (global as unknown as { __DEV__: boolean }).__DEV__ = false;
  mockUpdates.isEnabled = true;
  mockUpdates.runningUpdateId = null;
  mockUpdates.state = {
    isUpdatePending: false,
    downloadedUpdate: undefined,
    isStartupProcedureRunning: false,
  };
  mockUpdates.listeners.clear();
  mockConstants.extra = { updateCriticalIndex: 1 };
  mockConstants.env = "standalone";
  appStateCb = null;
  addListener.mockImplementation((_e, cb) => {
    appStateCb = cb as (s: string) => void;
    return { remove: mockSubRemove } as never;
  });
  now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  check.mockResolvedValue({ isAvailable: true });
  fetch.mockResolvedValue({ isNew: true });
  reload.mockResolvedValue(undefined);
});

afterAll(() => {
  (global as unknown as { __DEV__: boolean }).__DEV__ = realDev;
});

describe("disabled", () => {
  it.each([
    ["updates disabled", () => (mockUpdates.isEnabled = false)],
    ["dev", () => ((global as unknown as { __DEV__: boolean }).__DEV__ = true)],
    ["Expo Go", () => (mockConstants.env = "storeClient")],
  ])("%s => none, no API calls, no listener", async (_l, disable) => {
    disable();
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 5);
    expect(result.current.prompt).toBe("none");
    expect(addListener).not.toHaveBeenCalled();
    act(() => result.current.restart());
    expect(reload).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });
});

describe("foreground checks", () => {
  it("does not check on mount, nor within 15 min", async () => {
    renderHook(() => useOtaUpdate({ suppressed: false }));
    expect(check).not.toHaveBeenCalled();
    now += UPDATE_CHECK_MIN_INTERVAL_MS - 1;
    await foreground();
    expect(check).not.toHaveBeenCalled();
  });

  it("checks then fetches after 15 min when available", async () => {
    renderHook(() => useOtaUpdate({ suppressed: false }));
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    expect(check).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when nothing is available", async () => {
    check.mockResolvedValue({ isAvailable: false });
    renderHook(() => useOtaUpdate({ suppressed: false }));
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    expect(check).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores inactive -> active round trips", async () => {
    renderHook(() => useOtaUpdate({ suppressed: false }));
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await appState("inactive");
    await appState("active");
    expect(check).not.toHaveBeenCalled();
  });

  it("skips while the startup procedure runs", async () => {
    mockUpdates.state.isStartupProcedureRunning = true;
    renderHook(() => useOtaUpdate({ suppressed: false }));
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    expect(check).not.toHaveBeenCalled();
  });

  it("does not double-call while a check is in flight", async () => {
    let resolveCheck: (v: unknown) => void = () => {};
    check.mockImplementation(() => new Promise((r) => (resolveCheck = r)));
    renderHook(() => useOtaUpdate({ suppressed: false }));
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    now += UPDATE_CHECK_MIN_INTERVAL_MS * 2;
    await foreground();
    expect(check).toHaveBeenCalledTimes(1);
    await act(async () => resolveCheck({ isAvailable: false }));
  });

  it("swallows a rejected check and retries on the next eligible foreground", async () => {
    check.mockRejectedValueOnce(new Error("offline"));
    renderHook(() => useOtaUpdate({ suppressed: false }));
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    expect(toast.error).not.toHaveBeenCalled();
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("skips while an update is already downloaded and pending", async () => {
    renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 1);
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    expect(check).not.toHaveBeenCalled();
  });

  it("still checks when isUpdatePending is true but there is no downloaded manifest", async () => {
    renderHook(() => useOtaUpdate({ suppressed: false }));
    setUpdates({ isUpdatePending: true, downloadedUpdate: undefined });
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("still checks when the pending update is the running bundle (guarded to none)", async () => {
    mockUpdates.runningUpdateId = "u1";
    renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 1);
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("removes the AppState subscription on unmount", () => {
    const { unmount } = renderHook(() => useOtaUpdate({ suppressed: false }));
    expect(mockSubRemove).not.toHaveBeenCalled();
    unmount();
    expect(mockSubRemove).toHaveBeenCalledTimes(1);
  });

  it("still checks mid-match (download only)", async () => {
    renderHook(() => {
      useArenaMatchScreen();
      return useOtaUpdate({ suppressed: false });
    });
    now += UPDATE_CHECK_MIN_INTERVAL_MS;
    await foreground();
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe("prompt", () => {
  it("is none until an update is downloaded", () => {
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    expect(result.current.prompt).toBe("none");
    setUpdates({ isUpdatePending: false, downloadedUpdate: undefined });
    expect(result.current.prompt).toBe("none");
  });

  it("higher index => modal with notice", () => {
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 2, "  Fixes match sync. ");
    expect(result.current.prompt).toBe("modal");
    expect(result.current.notice).toBe("Fixes match sync.");
  });

  it("equal index => banner (no notice surfaced), dismissable per id", () => {
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 1, "ignored for banners");
    expect(result.current.prompt).toBe("banner");
    expect(result.current.notice).toBeNull();
    act(() => result.current.dismiss());
    expect(result.current.prompt).toBe("none");
    download("u2", 1);
    expect(result.current.prompt).toBe("banner");
  });

  it("isUpdatePending without a downloadedUpdate => none", () => {
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    setUpdates({ isUpdatePending: true, downloadedUpdate: undefined });
    expect(result.current.prompt).toBe("none");
  });

  it("never offers the bundle that is already running", () => {
    mockUpdates.runningUpdateId = "u1";
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 5);
    expect(result.current.prompt).toBe("none");
    download("u2", 5);
    expect(result.current.prompt).toBe("modal");
  });

  it("critical, then a later same-index publish with a new id, stays a modal", () => {
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 2);
    expect(result.current.prompt).toBe("modal");
    download("u2", 2);
    expect(result.current.prompt).toBe("modal");
  });

  it("dismiss never hides a critical modal", () => {
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 3);
    act(() => result.current.dismiss());
    expect(result.current.prompt).toBe("modal");
  });

  it("rollback => banner without notice, and can be dismissed", () => {
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    setUpdates({
      isUpdatePending: true,
      downloadedUpdate: { type: "rollback", updateId: undefined, manifest: undefined },
    });
    expect(result.current.prompt).toBe("banner");
    act(() => result.current.dismiss());
    expect(result.current.prompt).toBe("none");
  });

  it("suppressed (splash) => none", () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: boolean }) => useOtaUpdate({ suppressed: s }),
      { initialProps: { s: true } },
    );
    download("u1", 9);
    expect(result.current.prompt).toBe("none");
    rerender({ s: false });
    expect(result.current.prompt).toBe("modal");
  });
});

describe("match guard", () => {
  function MatchHarness({ inMatch }: { inMatch: boolean }) {
    return inMatch ? <MatchScreen /> : null;
  }
  function MatchScreen() {
    useArenaMatchScreen();
    return null;
  }

  it.each([
    ["banner", 1],
    ["modal", 2],
  ] as const)("defers the %s while a match screen is mounted", async (kind, index) => {
    const { render } = require("@testing-library/react-native");
    const hook = renderHook(() => useOtaUpdate({ suppressed: false }));
    const match = render(<MatchHarness inMatch />);
    download("u1", index);
    expect(hook.result.current.prompt).toBe("none");
    act(() => hook.result.current.restart());
    expect(reload).not.toHaveBeenCalled();
    match.rerender(<MatchHarness inMatch={false} />);
    expect(hook.result.current.prompt).toBe(kind);
  });
});

describe("restart", () => {
  it("calls reloadAsync once with no args and guards double taps", async () => {
    let resolveReload: () => void = () => {};
    reload.mockImplementation(() => new Promise<void>((r) => (resolveReload = r)));
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 2);
    act(() => {
      result.current.restart();
      result.current.restart();
    });
    expect(result.current.restarting).toBe(true);
    act(() => result.current.restart());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload.mock.calls[0]).toHaveLength(0);
    await act(async () => resolveReload());
  });

  it("banner path: rejection resets restarting, toasts and sets the error", async () => {
    reload.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 1);
    expect(result.current.prompt).toBe("banner");
    await act(async () => {
      result.current.restart();
    });
    expect(result.current.restarting).toBe(false);
    expect(result.current.restartError).toBe(RESTART_FAILED_MESSAGE);
    expect(toast.error).toHaveBeenCalledWith(RESTART_FAILED_MESSAGE);
    await act(async () => {
      result.current.restart();
    });
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("modal path: rejection sets the inline error without a (hidden) toast", async () => {
    reload.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
    download("u1", 2);
    await act(async () => {
      result.current.restart();
    });
    expect(result.current.restartError).toBe(RESTART_FAILED_MESSAGE);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("resolved reload that never restarts the app unsticks after the timeout", async () => {
    jest.useFakeTimers();
    try {
      const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
      download("u1", 2);
      await act(async () => {
        result.current.restart();
      });
      expect(result.current.restarting).toBe(true);
      expect(result.current.restartError).toBeNull();
      act(() => {
        jest.advanceTimersByTime(RESTART_STUCK_MS - 1);
      });
      expect(result.current.restarting).toBe(true);
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current.restarting).toBe(false);
      expect(result.current.restartError).toBe(RESTART_FAILED_MESSAGE);
      await act(async () => {
        result.current.restart();
      });
      expect(reload).toHaveBeenCalledTimes(2);
      expect(result.current.restartError).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
