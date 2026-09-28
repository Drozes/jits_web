/**
 * useHighlightShare (jr_be spec 014 sections 16.6.1 and 16.7 item 6).
 *
 * The three native packages, the Reels module, the shared RPC wrappers and
 * the downloader are all mocked, so every assertion is about what the hook
 * CALLS. The first describe is the behavioural half of the share guard.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import type { HighlightCaptionContext } from "@jits/shared/api/highlight-share";

// ---- native modules --------------------------------------------------------

// `var`, not `const`: the Reels module (imported through the hoisted mocks)
// calls requireOptionalNativeModule while this file is still initialising.
// eslint-disable-next-line no-var
var mockNative: Record<string, unknown> = {};
jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return {
    ...actual,
    requireOptionalNativeModule: (name: string) =>
      mockNative && name in mockNative ? mockNative[name] : actual.requireOptionalNativeModule(name),
  };
});

const mockShareAsync = jest.fn();
const mockSharingAvailable = jest.fn();
jest.mock("expo-sharing", () => ({
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
  isAvailableAsync: (...args: unknown[]) => mockSharingAvailable(...args),
}));

const mockRequestPermissions = jest.fn();
const mockSaveToLibrary = jest.fn();
jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  saveToLibraryAsync: (...args: unknown[]) => mockSaveToLibrary(...args),
}));

// eslint-disable-next-line no-var
var mockReels = { supported: true };
const mockShareToReels = jest.fn();
jest.mock("@/modules/instagram-reels", () => {
  const actual = jest.requireActual("@/modules/instagram-reels");
  // defineProperty, not an object-literal getter next to a spread: the
  // spread transform would evaluate the getter once at factory time.
  const mocked = { ...actual, __esModule: true, shareToReels: (...args: unknown[]) => mockShareToReels(...args) };
  Object.defineProperty(mocked, "isReelsShareSupported", {
    enumerable: true,
    get: () => (mockReels ? mockReels.supported : true),
  });
  return mocked;
});

// ---- app modules -----------------------------------------------------------

// eslint-disable-next-line no-var
var mockEnv: { facebookAppId: string | null } = { facebookAppId: "fb-123" };
jest.mock("@/lib/env", () => ({
  env: {
    get facebookAppId() {
      return mockEnv ? mockEnv.facebookAppId : null;
    },
    supabaseUrl: "https://x.supabase.co",
    supabaseAnonKey: "anon",
  },
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));

const mockPrepare = jest.fn();
const mockSign = jest.fn();
const mockLog = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  prepareHighlightShare: (...args: unknown[]) => mockPrepare(...args),
  signHighlightDownload: (...args: unknown[]) => mockSign(...args),
  logHighlightShareEvent: (...args: unknown[]) => mockLog(...args),
}));

const mockDownload = jest.fn();
const mockDeleteCached = jest.fn();
jest.mock("@/lib/highlight-share/download", () => ({
  downloadReel: (...args: unknown[]) => mockDownload(...args),
  deleteCachedFile: (...args: unknown[]) => mockDeleteCached(...args),
  sweepShareCache: jest.fn(),
  clearShareCache: jest.fn(),
}));

import { useHighlightShare, type UseHighlightShareParams } from "@/lib/highlight-share/use-highlight-share";
import { REELS_FAILURE_MESSAGES, type ReelsShareFailure } from "@/modules/instagram-reels";

// ---- fixtures ----------------------------------------------------------------

const HL = "hl-1";
const FILE = "file:///cache/highlight-share/elorated-highlight-hl-1-v2.mp4";
const SOURCE = {
  highlightId: HL,
  version: 2,
  storagePath: "m/u/highlights/2.mp4",
  durationS: 31,
  fileName: "elorated-highlight-hl-1-v2.mp4",
};
const CAPTION: HighlightCaptionContext = {
  athleteName: "Me",
  opponentName: "Ana",
  matchType: "casual",
  outcome: "win",
  eloAfter: null,
  eloDelta: null,
  technique: null,
  playedAt: "2026-09-27T09:00:00Z",
};

const mockSetString = jest.fn();
let canOpenSpy: jest.SpyInstance;
let appStateHandler: ((s: AppStateStatus) => void) | null = null;
const originalOS = Platform.OS;

function setOS(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
}

function params(over: Partial<UseHighlightShareParams> = {}): UseHighlightShareParams {
  return {
    highlightId: HL,
    shareEnabled: true,
    durationS: 31,
    captionContext: CAPTION,
    source: "home",
    ...over,
  };
}

function nativeCalls() {
  return {
    shareToReels: mockShareToReels.mock.calls.length,
    shareAsync: mockShareAsync.mock.calls.length,
    saveToLibrary: mockSaveToLibrary.mock.calls.length,
    requestPermissions: mockRequestPermissions.mock.calls.length,
    setString: mockSetString.mock.calls.length,
    prepare: mockPrepare.mock.calls.length,
    download: mockDownload.mock.calls.length,
  };
}

const NONE = {
  shareToReels: 0,
  shareAsync: 0,
  saveToLibrary: 0,
  requestPermissions: 0,
  setString: 0,
  prepare: 0,
  download: 0,
};

/** Steps logged so far, in order. */
function steps(): string[] {
  return mockLog.mock.calls.map((c) => c[2]);
}

function detailOf(step: string): Record<string, unknown> | undefined {
  const call = mockLog.mock.calls.find((c) => c[2] === step);
  return call?.[3];
}

async function renderReady(over: Partial<UseHighlightShareParams> = {}) {
  const hook = renderHook((p: UseHighlightShareParams) => useHighlightShare(p), {
    initialProps: params(over),
  });
  await waitFor(() => expect(hook.result.current.capabilities).not.toBeNull());
  act(() => hook.result.current.start());
  await waitFor(() => expect(hook.result.current.stage).toBe("ready"));
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockNative)) delete mockNative[key];
  // Every module the funnel asks about is set explicitly (null = absent):
  // jest-expo's own stubs would otherwise answer "present".
  mockNative.ExpoSharing = {};
  mockNative.ExpoMediaLibrary = {};
  mockNative.ExpoClipboard = null;
  mockReels.supported = true;
  mockEnv.facebookAppId = "fb-123";
  setOS("ios");
  canOpenSpy = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
  mockSharingAvailable.mockResolvedValue(true);
  mockShareAsync.mockResolvedValue(undefined);
  mockRequestPermissions.mockResolvedValue({ granted: true });
  mockSaveToLibrary.mockResolvedValue(undefined);
  mockShareToReels.mockResolvedValue({ ok: true, stickerApplied: false, byteCount: 1000, oversize: false });
  mockPrepare.mockResolvedValue({ ok: true, data: SOURCE });
  mockSign.mockResolvedValue({ ok: true, data: { url: "https://signed/url" } });
  mockDownload.mockImplementation(async (_s: unknown, _u: unknown, onProgress?: (f: number) => void) => {
    onProgress?.(0.5);
    return { ok: true, uri: FILE, byteCount: 1000, reused: false, elapsedMs: 12 };
  });
  mockDeleteCached.mockResolvedValue(undefined);
  mockLog.mockResolvedValue(undefined);
  mockSetString.mockResolvedValue(true);
  appStateHandler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, h: (s: AppStateStatus) => void) => {
    appStateHandler = h;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => {
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOS });
  canOpenSpy.mockRestore();
});

// ---------------------------------------------------------------------------

describe("behavioural gate (spec 16.7 item 6)", () => {
  it("with shareEnabled false, no action reaches a native module, the network or the downloader", async () => {
    mockNative.ExpoClipboard = { setStringAsync: mockSetString };
    const { result } = renderHook(() => useHighlightShare(params({ shareEnabled: false })));
    await act(async () => {
      result.current.start();
      await result.current.handoff("reels");
      await result.current.handoff("share_sheet");
      expect(await result.current.saveToPhotos()).toEqual({ ok: false, kind: "disabled" });
      expect(await result.current.copyCaption()).toBe(false);
    });
    expect(nativeCalls()).toEqual(NONE);
    expect(mockSign).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
    expect(canOpenSpy).not.toHaveBeenCalled();
    expect(result.current.capabilities).toBeNull();
    expect(result.current.primaryPath).toBeNull();
    expect(result.current.stage).toBe("idle");
  });

  it("the hook itself never toasts (the UI owns every toast)", async () => {
    const { result } = await renderReady();
    await act(async () => {
      await result.current.handoff();
      await result.current.saveToPhotos();
      await result.current.copyCaption();
    });
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("with prepare refusing HIGHLIGHT_SHARE_DISABLED, nothing native and no download, error disabled", async () => {
    mockPrepare.mockResolvedValue({
      ok: false,
      error: { code: "HIGHLIGHT_SHARE_DISABLED", message: "Sharing is turned off right now." },
    });
    const { result } = renderHook(() => useHighlightShare(params()));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    act(() => result.current.start());
    await waitFor(() => expect(result.current.stage).toBe("failed"));
    expect(result.current.error).toEqual({
      kind: "disabled",
      code: "disabled",
      message: "Sharing is turned off right now.",
      canFallBack: false,
      retryable: false,
    });
    await act(async () => {
      expect(await result.current.handoff("reels")).toEqual({ ok: false, error: null });
      expect(await result.current.handoff("share_sheet")).toEqual({ ok: false, error: null });
      expect(await result.current.saveToPhotos()).toEqual({ ok: false, kind: "disabled" });
    });
    expect(mockPrepare).toHaveBeenCalledTimes(2); // start + save, each asked the server
    expect(mockSign).not.toHaveBeenCalled();
    expect({ ...nativeCalls(), prepare: 0 }).toEqual(NONE);
    expect(result.current.error?.kind).toBe("disabled");
  });

  it("start() always asks prepare_highlight_share first", async () => {
    await renderReady();
    expect(mockPrepare).toHaveBeenCalledWith({ tag: "client" }, HL);
    expect(mockPrepare.mock.invocationCallOrder[0]).toBeLessThan(mockSign.mock.invocationCallOrder[0]);
    expect(mockSign).toHaveBeenCalledWith({ tag: "client" }, SOURCE.storagePath, 300);
    expect(mockDownload).toHaveBeenCalledWith(SOURCE, "https://signed/url", expect.any(Function));
  });

  it("turning the flag off mid-flow resets and blocks the handoff", async () => {
    const { result, rerender } = await renderReady();
    rerender(params({ shareEnabled: false }));
    await waitFor(() => expect(result.current.stage).toBe("idle"));
    await act(async () => {
      await result.current.handoff("share_sheet");
    });
    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(result.current.primaryPath).toBeNull();
  });
});

describe("primary path", () => {
  it("is reels when the module, App ID and Instagram are all there", async () => {
    const { result } = renderHook(() => useHighlightShare(params()));
    await waitFor(() => expect(result.current.primaryPath).toBe("reels"));
  });

  it("is share_sheet without an App ID", async () => {
    mockEnv.facebookAppId = null;
    const { result } = renderHook(() => useHighlightShare(params()));
    await waitFor(() => expect(result.current.primaryPath).toBe("share_sheet"));
  });

  it("is share_sheet when the reel is outside 3 to 60 s", async () => {
    const { result } = renderHook(() => useHighlightShare(params({ durationS: 61 })));
    await waitFor(() => expect(result.current.primaryPath).toBe("share_sheet"));
  });

  it("is null when neither Reels nor the share sheet is available", async () => {
    mockReels.supported = false;
    mockNative.ExpoSharing = null;
    const { result } = renderHook(() => useHighlightShare(params()));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    expect(result.current.primaryPath).toBeNull();
  });
});

describe("start()", () => {
  it("walks preparing -> downloading -> ready with progress and telemetry", async () => {
    const { result } = await renderReady();
    expect(result.current.progress).toBe(1);
    expect(result.current.error).toBeNull();
    expect(steps()).toEqual(["share_tapped", "download_ok"]);
    expect(detailOf("share_tapped")).toMatchObject({ source: "home", path: "reels", platform: "ios" });
    expect(detailOf("download_ok")).toMatchObject({ source: "home", byte_count: 1000, elapsed_ms: 12, reused: false });
    const detail = detailOf("download_ok") ?? {};
    for (const key of ["platform", "os_version", "app_version", "runtime_version"]) {
      expect(detail).toHaveProperty(key);
    }
  });

  it("a download failure fails with the download copy and logs download_failed", async () => {
    mockDownload.mockResolvedValue({ ok: false, failure: "download_timeout", elapsedMs: 60000 });
    const { result } = renderHook(() => useHighlightShare(params()));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.stage).toBe("failed"));
    expect(result.current.error).toEqual({
      kind: "download",
      code: "download-failed",
      message: "We couldn't download your reel. Check your connection and try again.",
      canFallBack: false,
      retryable: true,
    });
    expect(detailOf("download_failed")).toMatchObject({ failure: "download_timeout", elapsed_ms: 60000 });
  });

  it("a signing failure is a download failure too", async () => {
    mockSign.mockResolvedValue({ ok: false, error: { code: "VIDEO_FILE_MISSING", message: "x" } });
    const { result } = renderHook(() => useHighlightShare(params()));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.stage).toBe("failed"));
    expect(result.current.error?.kind).toBe("download");
    expect(mockDownload).not.toHaveBeenCalled();
  });
});

describe("share sheet path", () => {
  it("opens the sheet with the mp4 file and logs share_sheet_opened only", async () => {
    mockEnv.facebookAppId = null;
    const { result } = await renderReady();
    await act(async () => {
      expect(await result.current.handoff()).toEqual({ ok: true, path: "share_sheet", oversize: false });
    });
    expect(mockShareAsync).toHaveBeenCalledWith(FILE, {
      mimeType: "video/mp4",
      UTI: "public.mpeg-4",
      dialogTitle: "Share your highlight",
    });
    expect(mockShareToReels).not.toHaveBeenCalled();
    expect(result.current.stage).toBe("done");
    expect(detailOf("share_sheet_opened")).toMatchObject({ path: "share_sheet", source: "home" });
  });

  it("a throwing sheet logs share_sheet_failed", async () => {
    mockEnv.facebookAppId = null;
    mockShareAsync.mockRejectedValue(new Error("boom"));
    const { result } = await renderReady();
    await act(async () => {
      await result.current.handoff();
    });
    expect(result.current.stage).toBe("failed");
    expect(result.current.error).toMatchObject({ kind: "share_sheet", code: "share-sheet-failed", retryable: true });
    expect(steps()).toContain("share_sheet_failed");
  });

  it("reels requested for a reel outside the window goes to the share sheet without attempting Reels", async () => {
    mockPrepare.mockResolvedValue({ ok: true, data: { ...SOURCE, durationS: 2.5 } });
    const { result } = await renderReady({ durationS: null });
    await act(async () => {
      await result.current.handoff("reels");
    });
    expect(mockShareToReels).not.toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
  });
});

describe("Reels path", () => {
  it("hands the file and App ID to the module and logs reels_handoff_ok", async () => {
    const { result } = await renderReady();
    await act(async () => {
      await result.current.handoff();
    });
    expect(mockShareToReels).toHaveBeenCalledWith({ videoUri: FILE, appId: "fb-123" });
    // Never deleted right after a handoff (Android reads the URI later).
    expect(mockDeleteCached).not.toHaveBeenCalled();
    expect(detailOf("reels_handoff_ok")).toMatchObject({ path: "reels", byte_count: 1000, oversize: false });
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("iOS: moves to `returned` when the app is active again after a background trip", async () => {
    const { result } = await renderReady();
    await act(async () => {
      await result.current.handoff();
    });
    expect(result.current.stage).toBe("handing_off");
    act(() => appStateHandler?.("inactive"));
    act(() => appStateHandler?.("active"));
    expect(result.current.stage).toBe("handing_off"); // no background trip yet
    act(() => appStateHandler?.("background"));
    act(() => appStateHandler?.("active"));
    expect(result.current.stage).toBe("returned");
    expect(detailOf("returned_from_instagram")).toMatchObject({ path: "reels", elapsed_ms: expect.any(Number) });
    // Once only.
    act(() => appStateHandler?.("background"));
    act(() => appStateHandler?.("active"));
    expect(steps().filter((s) => s === "returned_from_instagram")).toHaveLength(1);
  });

  it("Android: done right after the handoff (caption was copyable before)", async () => {
    setOS("android");
    const { result } = await renderReady();
    expect(canOpenSpy).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.handoff();
    });
    expect(result.current.stage).toBe("done");
  });

  it("oversize is reported for the UI's advisory toast and is still a success", async () => {
    mockShareToReels.mockResolvedValue({ ok: true, stickerApplied: false, byteCount: 60_000_000, oversize: true });
    const { result } = await renderReady();
    await act(async () => {
      expect(await result.current.handoff()).toEqual({ ok: true, path: "reels", oversize: true });
    });
    expect(detailOf("reels_handoff_ok")).toMatchObject({ oversize: true });
    expect(result.current.error).toBeNull();
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  function reelsFails(failure: ReelsShareFailure) {
    return { ok: false, failure, message: REELS_FAILURE_MESSAGES[failure] };
  }

  it.each(["module-unavailable", "missing-app-id", "unsupported-platform"] as const)(
    "%s falls straight through to the share sheet",
    async (failure) => {
      mockShareToReels.mockResolvedValue(reelsFails(failure));
      const { result } = await renderReady();
      await act(async () => {
        await result.current.handoff();
      });
      expect(mockShareAsync).toHaveBeenCalledTimes(1);
      expect(result.current.stage).toBe("done");
      expect(detailOf("reels_handoff_failed")).toMatchObject({ failure });
    },
  );

  it.each(["instagram-unavailable", "too-short", "too-long"] as const)(
    "%s shows its message with the share-sheet fallback",
    async (failure) => {
      mockShareToReels.mockResolvedValue(reelsFails(failure));
      const { result } = await renderReady();
      await act(async () => {
        await result.current.handoff();
      });
      expect(result.current.stage).toBe("failed");
      expect(result.current.error).toEqual({
        kind: "reels",
        code: failure,
        message: REELS_FAILURE_MESSAGES[failure],
        canFallBack: true,
        retryable: false,
      });
      expect(mockShareAsync).not.toHaveBeenCalled();
      // "Use the share sheet" works on the same file.
      await act(async () => {
        await result.current.handoff("share_sheet");
      });
      expect(mockShareAsync).toHaveBeenCalledWith(FILE, expect.any(Object));
    },
  );

  it.each(["handoff-failed", "unknown"] as const)("%s offers Try again and the share sheet", async (failure) => {
    mockShareToReels.mockResolvedValue(reelsFails(failure));
    const { result } = await renderReady();
    await act(async () => {
      await result.current.handoff();
    });
    expect(result.current.error).toEqual({
      kind: "reels",
      code: failure,
      message: REELS_FAILURE_MESSAGES[failure],
      canFallBack: true,
      retryable: true,
    });
    mockShareToReels.mockResolvedValue({ ok: true, stickerApplied: false, byteCount: 1, oversize: false });
    await act(async () => {
      await result.current.handoff("reels");
    });
    expect(mockShareToReels).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it.each(["file-not-found", "unreadable-video"] as const)(
    "%s deletes the file, re-downloads once and retries once",
    async (failure) => {
      mockShareToReels.mockResolvedValueOnce(reelsFails(failure));
      const { result } = await renderReady();
      await act(async () => {
        await result.current.handoff();
      });
      expect(mockDeleteCached).toHaveBeenCalledWith(FILE);
      expect(mockPrepare).toHaveBeenCalledTimes(2);
      expect(mockDownload).toHaveBeenCalledTimes(2);
      expect(mockShareToReels).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBeNull();
      expect(result.current.stage).toBe("handing_off");
    },
  );

  it("file-not-found twice: retries only once, then the message and the share sheet", async () => {
    mockShareToReels.mockResolvedValue(reelsFails("file-not-found"));
    const { result } = await renderReady();
    await act(async () => {
      await result.current.handoff();
    });
    expect(mockShareToReels).toHaveBeenCalledTimes(2);
    expect(mockDownload).toHaveBeenCalledTimes(2);
    expect(result.current.error).toEqual({
      kind: "reels",
      code: "file-not-found",
      message: REELS_FAILURE_MESSAGES["file-not-found"],
      canFallBack: true,
      retryable: false,
    });
  });
});

describe("Save to Photos", () => {
  it("downloads on its own (after prepare), asks write-only permission and saves", async () => {
    const { result } = renderHook(() => useHighlightShare(params()));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    await act(async () => {
      expect(await result.current.saveToPhotos()).toEqual({ ok: true });
    });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissions).toHaveBeenCalledWith(true);
    expect(mockSaveToLibrary).toHaveBeenCalledWith(FILE);
    expect(steps()).toContain("saved_to_photos");
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(result.current.stage).toBe("idle");
  });

  it("reuses the share download when one is ready", async () => {
    const { result } = await renderReady();
    await act(async () => {
      expect(await result.current.saveToPhotos()).toEqual({ ok: true });
    });
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockSaveToLibrary).toHaveBeenCalledWith(FILE);
  });

  it("permission denied: save_permission_denied and the Settings copy", async () => {
    mockRequestPermissions.mockResolvedValue({ granted: false });
    const { result } = await renderReady();
    await act(async () => {
      expect(await result.current.saveToPhotos()).toEqual({ ok: false, kind: "permission" });
    });
    expect(mockSaveToLibrary).not.toHaveBeenCalled();
    expect(detailOf("save_permission_denied")).toMatchObject({ failure: "permission" });
    // Save reports through its return value only.
    expect(result.current.error).toBeNull();
    expect(result.current.stage).toBe("ready");
  });

  it("failure: save_failed and the retry copy", async () => {
    mockSaveToLibrary.mockRejectedValue(new Error("disk"));
    const { result } = await renderReady();
    await act(async () => {
      expect(await result.current.saveToPhotos()).toEqual({ ok: false, kind: "failed" });
    });
    expect(steps()).toContain("save_failed");
    expect(result.current.error).toBeNull();
  });

  it("is a no-op without the media-library module", async () => {
    mockNative.ExpoMediaLibrary = null;
    const { result } = await renderReady();
    await act(async () => {
      expect(await result.current.saveToPhotos()).toEqual({ ok: false, kind: "unavailable" });
    });
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(result.current.capabilities?.saveToPhotos).toBe(false);
  });
});

describe("caption", () => {
  it("builds the caption and the collab tip from the context", async () => {
    const { result } = renderHook(() => useHighlightShare(params()));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    expect(result.current.caption.split("\n")[0]).toBe("Took the win against Ana.");
    expect(result.current.collabTip).toMatch(/^Tag Ana as a collaborator/);
  });

  it("without a clipboard module: copyCaption is false and records the press-and-hold path", async () => {
    const { result } = renderHook(() => useHighlightShare(params()));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    expect(result.current.capabilities?.clipboard).toBe(false);
    let copied = true;
    await act(async () => {
      copied = await result.current.copyCaption();
    });
    expect(copied).toBe(false);
    expect(detailOf("caption_copied")).toMatchObject({ clipboard: "press_and_hold" });
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("with a clipboard module: copies, toasts and logs clipboard button", async () => {
    mockNative.ExpoClipboard = { setStringAsync: mockSetString };
    const { result } = renderHook(() => useHighlightShare(params()));
    await waitFor(() => expect(result.current.capabilities?.clipboard).toBe(true));
    let copied = false;
    await act(async () => {
      copied = await result.current.copyCaption();
    });
    expect(copied).toBe(true);
    expect(mockSetString).toHaveBeenCalledWith(result.current.caption, {});
    expect(detailOf("caption_copied")).toMatchObject({ clipboard: "button", source: "home" });
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});

describe("reset()", () => {
  it("returns to idle and forgets the file, so the next start asks the server again", async () => {
    const { result } = await renderReady();
    act(() => result.current.reset());
    expect(result.current.stage).toBe("idle");
    await act(async () => {
      await result.current.handoff("share_sheet");
    });
    expect(mockShareAsync).not.toHaveBeenCalled();
    act(() => result.current.start());
    await waitFor(() => expect(result.current.stage).toBe("ready"));
    expect(mockPrepare).toHaveBeenCalledTimes(2);
  });
});
