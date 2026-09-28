/**
 * useOtaUpdate against the REAL expo-updates JS layer (useUpdates, the state
 * emitter and the manifest-string parsing), with only the native module
 * mocked by jest-expo. A native state-change event carrying
 * `downloadedManifestString` is what a finished background download emits.
 *
 * NOTE: this imports the INTERNAL path `expo-updates/build/UpdatesEmitter`
 * (test-only helpers `emitTestStateChangeEvent` / `resetLatestContext`). It is
 * not public API and may move or be renamed on an expo-updates bump; if this
 * suite breaks after one, re-point the import rather than deleting the test.
 */
import { act, renderHook } from "@testing-library/react-native";
import {
  emitTestStateChangeEvent,
  resetLatestContext,
} from "expo-updates/build/UpdatesEmitter";
import * as Updates from "expo-updates";
import { useOtaUpdate } from "@/lib/updates/use-ota-update";
import { __resetArenaStoreForTests } from "@/lib/arena/arena-store";

jest.mock("expo-constants", () => ({
  __esModule: true,
  ExecutionEnvironment: { StoreClient: "storeClient", Standalone: "standalone" },
  default: {
    expoConfig: { extra: { updateCriticalIndex: 1 } },
    executionEnvironment: "standalone",
  },
}));

const realDev = (global as unknown as { __DEV__: boolean }).__DEV__;
let seq = 1000;

function emitDownloaded(id: string, index: number, notice?: string) {
  const manifest = {
    id,
    createdAt: "2026-09-28T00:00:00.000Z",
    extra: { expoClient: { extra: { updateCriticalIndex: index, updateNotice: notice } } },
  };
  act(() => {
    emitTestStateChangeEvent({
      context: {
        isUpdateAvailable: true,
        isUpdatePending: true,
        isChecking: false,
        isDownloading: false,
        isRestarting: false,
        isStartupProcedureRunning: false,
        restartCount: 0,
        sequenceNumber: ++seq,
        downloadedManifestString: JSON.stringify(manifest),
        latestManifestString: JSON.stringify(manifest),
      },
    } as never);
  });
}

beforeEach(() => {
  __resetArenaStoreForTests();
  (global as unknown as { __DEV__: boolean }).__DEV__ = false;
  resetLatestContext();
});

afterAll(() => {
  (global as unknown as { __DEV__: boolean }).__DEV__ = realDev;
});

it("uses the real expo-updates module with updates enabled", () => {
  expect(Updates.isEnabled).toBe(true);
});

it("a native download event with a higher index raises the critical modal", () => {
  const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
  expect(result.current.prompt).toBe("none");
  emitDownloaded("11111111-1111-1111-1111-111111111111", 2, "  Match sync fix. ");
  expect(result.current.prompt).toBe("modal");
  expect(result.current.notice).toBe("Match sync fix.");
});

it("a native download event at the same index shows the banner", () => {
  const { result } = renderHook(() => useOtaUpdate({ suppressed: false }));
  emitDownloaded("22222222-2222-2222-2222-222222222222", 1);
  expect(result.current.prompt).toBe("banner");
});
