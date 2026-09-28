import * as React from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import {
  prepareHighlightShare,
  signHighlightDownload,
  type HighlightCaptionContext,
  type HighlightShareSource,
  type HighlightShareSourceTag,
  type HighlightShareStep,
} from "@jits/shared/api/highlight-share";
import { HIGHLIGHT_DOWNLOAD_URL_TTL_S, type HighlightShareEventDetail } from "@jits/shared/constants/highlights";
import { buildCollabTip, buildHighlightCaption } from "@jits/shared/utils";
import type { ReelsShareFailure } from "@/modules/instagram-reels";
import { getShareCapabilities, type ShareCapabilities } from "./capabilities";
import { copyText } from "./clipboard";
import { deleteCachedFile, downloadReel } from "./download";
import { handOffToReels, isWithinReelsWindow } from "./reels";
import { saveReelToPhotos } from "./save-photos";
import { SHARE_COPY } from "./share-copy";
import { openShareSheet } from "./share-sheet";
import { track } from "./telemetry";

export type SharePath = "reels" | "share_sheet";
export type ShareStage =
  | "idle"
  | "preparing"
  | "downloading"
  | "ready"
  | "handing_off"
  | "returned"
  | "done"
  | "failed";

/**
 * Why the share flow stopped. The Reels values are the module's
 * `ReelsShareFailure` vocabulary (the three "never really available" ones
 * never surface: they fall through to the share sheet).
 */
export type ShareErrorCode =
  | ReelsShareFailure
  | "disabled"
  | "download-failed"
  | "share-sheet-failed";

export interface ShareError {
  kind: "disabled" | "download" | "reels" | "share_sheet" | "save" | "permission";
  code: ShareErrorCode;
  /** User-facing copy (spec 16.6.3 / `REELS_FAILURE_MESSAGES`). */
  message: string;
  /** Offer "Use the share sheet" (the downloaded file is still in hand). */
  canFallBack: boolean;
  /** Offer "Try again" (repeat the step that failed: `start()` for a download, `handoff(path)` otherwise). */
  retryable: boolean;
}

/** What `handoff` did. `oversize`: show `REELS_OVERSIZE_WARNING` as an info toast (advisory only). */
export type HandoffOutcome =
  | { ok: true; path: SharePath; oversize: boolean }
  | { ok: false; error: ShareError | null };

/** What `saveToPhotos` did; the UI owns the toast / inline copy. */
export type SaveOutcome =
  | { ok: true }
  | { ok: false; kind: "permission" | "failed" | "disabled" | "download" | "unavailable" };

export interface UseHighlightShareResult {
  capabilities: ShareCapabilities | null;
  /** reels when capabilities.reels (and the duration fits), else share_sheet when available, else null (Share hidden). */
  primaryPath: SharePath | null;
  stage: ShareStage;
  /** Download progress as a 0..1 fraction; null before a download starts or when the size is unknown. */
  progress: number | null;
  error: ShareError | null;
  caption: string;
  collabTip: string;
  /** prepare_highlight_share -> sign (300 s) -> download. */
  start(): void;
  handoff(path?: SharePath): Promise<HandoffOutcome>;
  saveToPhotos(): Promise<SaveOutcome>;
  /** True when the caption is on the clipboard; false without a clipboard module (press-and-hold) or on failure. */
  copyCaption(): Promise<boolean>;
  reset(): void;
}

export interface UseHighlightShareParams {
  highlightId: string;
  shareEnabled: boolean;
  durationS: number | null;
  captionContext: HighlightCaptionContext | null;
  source: HighlightShareSourceTag;
}

interface ReadyFile {
  uri: string;
  byteCount: number;
  source: HighlightShareSource;
}

type Acquired = { ok: true; file: ReadyFile } | { ok: false; error: ShareError };

const DISABLED_ERROR: ShareError = {
  kind: "disabled",
  code: "disabled",
  message: SHARE_COPY.shareDisabled,
  canFallBack: false,
  retryable: false,
};
const DOWNLOAD_ERROR: ShareError = {
  kind: "download",
  code: "download-failed",
  message: SHARE_COPY.downloadFailed,
  canFallBack: false,
  retryable: true,
};
function shareSheetError(retryable: boolean): ShareError {
  return {
    kind: "share_sheet",
    code: "share-sheet-failed",
    message: SHARE_COPY.shareSheetFailed,
    canFallBack: false,
    retryable,
  };
}

/** Reels failures that mean "Reels was never really available": go straight to the share sheet. */
const FALL_THROUGH: ReadonlySet<ReelsShareFailure> = new Set<ReelsShareFailure>([
  "module-unavailable",
  "missing-app-id",
  "unsupported-platform",
]);
/** The cached file is bad: delete it, re-download once, retry once. */
const REDOWNLOAD: ReadonlySet<ReelsShareFailure> = new Set<ReelsShareFailure>(["file-not-found", "unreadable-video"]);
/** Worth a plain "Try again". */
const RETRYABLE: ReadonlySet<ReelsShareFailure> = new Set<ReelsShareFailure>(["handoff-failed", "unknown"]);

/**
 * The share funnel for ONE own highlight (jr_be spec 014 section 16.6.1).
 *
 * Rules it enforces:
 * 1. `shareEnabled === false`: every action is a no-op that touches no
 *    native module, no network and no telemetry (capabilities stay null).
 * 2. `start()` ALWAYS calls `prepare_highlight_share` first, so the server
 *    kill switch (HIGHLIGHT_SHARE_DISABLED) stops a screen opened before the
 *    flag flipped: stage `failed`, error `disabled`, no download.
 * 3. Reels failures follow the spec table (fall through / re-download once /
 *    message + "Use the share sheet" / + "Try again").
 * 4. iOS + Reels: the handoff replaces the pasteboard, so the caption is
 *    offered AFTER it: when the app is active again after a background trip
 *    the stage becomes `returned` (and `returned_from_instagram` is logged).
 * 5. Save to Photos is independent of the share path (own download, shared
 *    cache) and reports through its return value, never `error` / `stage`.
 * 6. Every share-flow step is logged fire-and-forget with `source`
 *    (`share_tapped` by `start()`). The UI logs only viewer_opened,
 *    notification_opened, improve_tapped, profile_row_tapped (and the
 *    discovery surfaces their own taps).
 *
 * The hook shows NO toasts: it returns outcomes (`handoff` -> `oversize`,
 * `saveToPhotos` -> `SaveOutcome`, `copyCaption` -> boolean) and the UI owns
 * every toast and line of copy.
 */
export function useHighlightShare(params: UseHighlightShareParams): UseHighlightShareResult {
  const { highlightId, shareEnabled, durationS, captionContext, source } = params;

  const [capabilities, setCapabilities] = React.useState<ShareCapabilities | null>(null);
  const [stage, setStageState] = React.useState<ShareStage>("idle");
  const [progress, setProgressState] = React.useState<number | null>(null);
  const [error, setErrorState] = React.useState<ShareError | null>(null);

  const mountedRef = React.useRef(true);
  const enabledRef = React.useRef(shareEnabled);
  const capsRef = React.useRef<ShareCapabilities | null>(null);
  const fileRef = React.useRef<ReadyFile | null>(null);
  const seqRef = React.useRef(0);
  const busyRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const handoffRef = React.useRef<{ at: number; sawBackground: boolean; confirmed: boolean } | null>(null);
  const paramsRef = React.useRef({ highlightId, source, durationS });

  enabledRef.current = shareEnabled;
  paramsRef.current = { highlightId, source, durationS };

  const setStage = React.useCallback((next: ShareStage) => {
    if (mountedRef.current) setStageState(next);
  }, []);
  const setProgress = React.useCallback((next: number | null) => {
    if (mountedRef.current) setProgressState(next);
  }, []);
  const setError = React.useCallback((next: ShareError | null) => {
    if (mountedRef.current) setErrorState(next);
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      seqRef.current += 1;
    };
  }, []);

  const log = React.useCallback((step: HighlightShareStep, detail: HighlightShareEventDetail = {}) => {
    const { highlightId: id, source: tag } = paramsRef.current;
    track(id, step, { source: tag, ...detail });
  }, []);

  // Capabilities are read only while sharing is enabled (rule 1).
  React.useEffect(() => {
    if (!shareEnabled) {
      capsRef.current = null;
      setCapabilities(null);
      return;
    }
    let cancelled = false;
    getShareCapabilities()
      .then((caps) => {
        if (cancelled) return;
        capsRef.current = caps;
        setCapabilities(caps);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shareEnabled]);

  const resetState = React.useCallback(() => {
    seqRef.current += 1;
    busyRef.current = false;
    fileRef.current = null;
    handoffRef.current = null;
    setStage("idle");
    setProgress(null);
    setError(null);
  }, [setError, setProgress, setStage]);

  // A different highlight starts from scratch.
  const lastIdRef = React.useRef(highlightId);
  React.useEffect(() => {
    if (lastIdRef.current !== highlightId) {
      lastIdRef.current = highlightId;
      resetState();
    }
  }, [highlightId, resetState]);

  // Killing the flag mid-flow drops whatever was in progress.
  React.useEffect(() => {
    if (!shareEnabled) resetState();
  }, [shareEnabled, resetState]);

  /**
   * prepare (kill switch) -> sign 300 s -> download. `onDownloading` fires
   * once the download itself begins. Logs download_ok / download_failed.
   */
  const acquire = React.useCallback(
    async (onDownloading?: () => void, onProgress?: (fraction: number | null) => void): Promise<Acquired> => {
      const id = paramsRef.current.highlightId;
      const prepared = await prepareHighlightShare(supabase, id);
      if (!prepared.ok) {
        if (prepared.error.code === "HIGHLIGHT_SHARE_DISABLED") return { ok: false, error: DISABLED_ERROR };
        log("download_failed", { failure: "unknown" });
        return { ok: false, error: DOWNLOAD_ERROR };
      }
      if (!enabledRef.current) return { ok: false, error: DISABLED_ERROR };
      const signed = await signHighlightDownload(supabase, prepared.data.storagePath, HIGHLIGHT_DOWNLOAD_URL_TTL_S);
      if (!signed.ok) {
        log("download_failed", { failure: "unknown" });
        return { ok: false, error: DOWNLOAD_ERROR };
      }
      if (!enabledRef.current) return { ok: false, error: DISABLED_ERROR };
      onDownloading?.();
      const result = await downloadReel(prepared.data, signed.data.url, onProgress);
      if (!result.ok) {
        log("download_failed", {
          failure: result.failure,
          elapsed_ms: result.elapsedMs,
          ...(result.status !== undefined ? { http_status: result.status } : {}),
        });
        return { ok: false, error: DOWNLOAD_ERROR };
      }
      log("download_ok", { elapsed_ms: result.elapsedMs, byte_count: result.byteCount, reused: result.reused });
      return { ok: true, file: { uri: result.uri, byteCount: result.byteCount, source: prepared.data } };
    },
    [log],
  );

  const primaryPath: SharePath | null = React.useMemo(() => {
    if (!shareEnabled || !capabilities) return null;
    if (capabilities.reels && isWithinReelsWindow(durationS)) return "reels";
    return capabilities.shareSheet ? "share_sheet" : null;
  }, [shareEnabled, capabilities, durationS]);
  const primaryPathRef = React.useRef(primaryPath);
  primaryPathRef.current = primaryPath;

  const start = React.useCallback(() => {
    if (!enabledRef.current || busyRef.current) return;
    busyRef.current = true;
    const seq = ++seqRef.current;
    fileRef.current = null;
    handoffRef.current = null;
    setError(null);
    setProgress(null);
    setStage("preparing");
    log("share_tapped", primaryPathRef.current ? { path: primaryPathRef.current } : {});
    void (async () => {
      const acquired = await acquire(
        () => {
          if (seq !== seqRef.current) return;
          setStage("downloading");
          setProgress(0);
        },
        (fraction) => {
          if (seq === seqRef.current && fraction !== null) setProgress(fraction);
        },
      );
      if (seq !== seqRef.current) return;
      busyRef.current = false;
      if (!acquired.ok) {
        setError(acquired.error);
        setStage("failed");
        return;
      }
      fileRef.current = acquired.file;
      setProgress(1);
      setStage("ready");
    })();
  }, [acquire, log, setError, setProgress, setStage]);

  const fail = React.useCallback(
    (next: ShareError): HandoffOutcome => {
      setError(next);
      setStage("failed");
      return { ok: false, error: next };
    },
    [setError, setStage],
  );

  const shareSheet = React.useCallback(
    async (file: ReadyFile, seq: number): Promise<HandoffOutcome> => {
      if (!capsRef.current?.shareSheet) return fail(shareSheetError(false));
      setError(null);
      setStage("handing_off");
      const result = await openShareSheet(file.uri);
      if (seq !== seqRef.current) return { ok: false, error: null };
      if (result.ok) {
        log("share_sheet_opened", { path: "share_sheet" });
        setStage("done");
        return { ok: true, path: "share_sheet", oversize: false };
      }
      log("share_sheet_failed", { path: "share_sheet", failure: "unknown" });
      return fail(shareSheetError(true));
    },
    [fail, log, setError, setStage],
  );

  const reels = React.useCallback(
    async (file: ReadyFile, seq: number, mayRedownload: boolean): Promise<HandoffOutcome> => {
      const appId = env.facebookAppId;
      if (!capsRef.current?.reels || !appId || !isWithinReelsWindow(file.source.durationS)) {
        return shareSheet(file, seq);
      }
      setError(null);
      setStage("handing_off");
      const pending = { at: Date.now(), sawBackground: false, confirmed: false };
      handoffRef.current = pending;
      const result = await handOffToReels(file.uri, appId);
      if (seq !== seqRef.current) return { ok: false, error: null };

      if (result.ok) {
        log("reels_handoff_ok", { path: "reels", byte_count: result.byteCount, oversize: result.oversize });
        const outcome: HandoffOutcome = { ok: true, path: "reels", oversize: result.oversize };
        if (Platform.OS !== "ios") {
          handoffRef.current = null;
          setStage("done");
          return outcome;
        }
        pending.confirmed = true;
        // Already back (the promise settled after the return trip).
        if (pending.sawBackground && AppState.currentState === "active") {
          handoffRef.current = null;
          log("returned_from_instagram", { path: "reels", elapsed_ms: Date.now() - pending.at });
          setStage("returned");
        }
        return outcome;
      }

      handoffRef.current = null;
      log("reels_handoff_failed", { path: "reels", failure: result.failure });
      if (FALL_THROUGH.has(result.failure)) return shareSheet(file, seq);
      if (REDOWNLOAD.has(result.failure) && mayRedownload) {
        await deleteCachedFile(file.uri);
        fileRef.current = null;
        setStage("downloading");
        setProgress(0);
        const again = await acquire(undefined, (fraction) => {
          if (seq === seqRef.current && fraction !== null) setProgress(fraction);
        });
        if (seq !== seqRef.current) return { ok: false, error: null };
        if (!again.ok) return fail(again.error);
        fileRef.current = again.file;
        setProgress(1);
        return reels(again.file, seq, false);
      }
      return fail({
        kind: "reels",
        code: result.failure,
        message: result.message,
        canFallBack: capsRef.current?.shareSheet === true,
        retryable: RETRYABLE.has(result.failure),
      });
    },
    [acquire, fail, log, setError, setProgress, setStage, shareSheet],
  );

  const handoff = React.useCallback(
    async (path?: SharePath): Promise<HandoffOutcome> => {
      if (!enabledRef.current || busyRef.current) return { ok: false, error: null };
      const file = fileRef.current;
      const chosen = path ?? primaryPathRef.current;
      if (!file || !chosen) return { ok: false, error: null };
      busyRef.current = true;
      const seq = seqRef.current;
      try {
        return chosen === "reels" ? await reels(file, seq, true) : await shareSheet(file, seq);
      } finally {
        if (seq === seqRef.current) busyRef.current = false;
      }
    },
    [reels, shareSheet],
  );

  // iOS Reels: the return trip from Instagram.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const pending = handoffRef.current;
      if (!pending) return;
      if (next === "background") {
        pending.sawBackground = true;
        return;
      }
      if (next === "active" && pending.sawBackground && pending.confirmed) {
        handoffRef.current = null;
        log("returned_from_instagram", { path: "reels", elapsed_ms: Date.now() - pending.at });
        setStage("returned");
      }
    });
    return () => sub.remove();
  }, [log, setStage]);

  const saveToPhotos = React.useCallback(async (): Promise<SaveOutcome> => {
    if (!enabledRef.current) return { ok: false, kind: "disabled" };
    if (!capsRef.current?.saveToPhotos || savingRef.current) return { ok: false, kind: "unavailable" };
    savingRef.current = true;
    try {
      let file = fileRef.current;
      if (!file) {
        const acquired = await acquire();
        if (!acquired.ok) return { ok: false, kind: acquired.error.kind === "disabled" ? "disabled" : "download" };
        file = acquired.file;
      }
      if (!enabledRef.current) return { ok: false, kind: "disabled" };
      const result = await saveReelToPhotos(file.uri);
      if (result.ok) {
        log("saved_to_photos");
        return { ok: true };
      }
      if (result.reason === "permission") {
        log("save_permission_denied", { failure: "permission" });
        return { ok: false, kind: "permission" };
      }
      log("save_failed", { failure: "unknown" });
      return { ok: false, kind: result.reason === "unavailable" ? "unavailable" : "failed" };
    } finally {
      savingRef.current = false;
    }
  }, [acquire, log]);

  const caption = React.useMemo(
    () => (captionContext ? buildHighlightCaption(captionContext) : ""),
    [captionContext],
  );
  const collabTip = React.useMemo(
    () => buildCollabTip(captionContext?.opponentName ?? null),
    [captionContext],
  );

  const copyCaption = React.useCallback(async (): Promise<boolean> => {
    if (!enabledRef.current || !caption) return false;
    if (!capsRef.current?.clipboard) {
      // No clipboard module: the UI renders the caption selectable and calls
      // this from its long press, so this records the press-and-hold intent.
      log("caption_copied", { clipboard: "press_and_hold" });
      return false;
    }
    const copied = await copyText(caption);
    if (copied) log("caption_copied", { clipboard: "button" });
    return copied;
  }, [caption, log]);

  const reset = React.useCallback(() => {
    resetState();
  }, [resetState]);

  return {
    capabilities,
    primaryPath,
    stage,
    progress,
    error,
    caption,
    collabTip,
    start,
    handoff,
    saveToPhotos,
    copyCaption,
    reset,
  };
}
