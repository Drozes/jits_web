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
  | "not-ready"
  | "not-found"
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
  | { ok: false; kind: "permission" | "failed" | "disabled" | "download" | "unavailable" | "not_ready" };

export interface UseHighlightShareResult {
  capabilities: ShareCapabilities | null;
  /** reels when capabilities.reels (and the duration fits), else share_sheet when available, else null (Share hidden). */
  primaryPath: SharePath | null;
  /**
   * The path the flow is ACTUALLY on: `primaryPath` until something reroutes
   * it (the downloaded file is outside the Reels window, a Reels failure fell
   * through, the athlete chose "Use the share sheet"), then `share_sheet`.
   * The UI derives the CTA label and the iOS caption rule from this.
   */
  activePath: SharePath | null;
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

/** A `prepare_highlight_share` refusal as the share flow's error (null: a transient failure). */
function prepareRefusal(code: string): ShareError | null {
  if (code === "HIGHLIGHT_SHARE_DISABLED") return DISABLED_ERROR;
  if (code === "HIGHLIGHT_NOT_READY") return NOT_READY_ERROR;
  if (code === "HIGHLIGHT_NOT_FOUND") return NOT_FOUND_ERROR;
  return null;
}

/** iOS Reels: if the app never went to the background this long after the handoff, stop waiting. */
export const IOS_HANDOFF_FALLBACK_MS = 8_000;

const DISABLED_ERROR: ShareError = {
  kind: "disabled",
  code: "disabled",
  message: SHARE_COPY.shareDisabled,
  canFallBack: false,
  retryable: false,
};
/** The reel no longer has a shareable live version (replaced / being re-analysed). */
const NOT_READY_ERROR: ShareError = {
  kind: "download",
  code: "not-ready",
  message: SHARE_COPY.notReady,
  canFallBack: false,
  retryable: false,
};
const NOT_FOUND_ERROR: ShareError = {
  kind: "download",
  code: "not-found",
  message: SHARE_COPY.notFound,
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
  const handoffTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A `start()` already ran in this sheet session: later ones are retries. */
  const sessionStartedRef = React.useRef(false);
  /** The press-and-hold intent is logged at most once per session. */
  const pressHoldLoggedRef = React.useRef(false);
  const [reroutedPath, setReroutedPathState] = React.useState<SharePath | null>(null);
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
  const setRerouted = React.useCallback((next: SharePath | null) => {
    if (mountedRef.current) setReroutedPathState(next);
  }, []);
  const clearHandoffTimer = React.useCallback(() => {
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    handoffTimerRef.current = null;
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      seqRef.current += 1;
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
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
    sessionStartedRef.current = false;
    pressHoldLoggedRef.current = false;
    clearHandoffTimer();
    setRerouted(null);
    setStage("idle");
    setProgress(null);
    setError(null);
  }, [clearHandoffTimer, setError, setProgress, setRerouted, setStage]);

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
   * The server-side gate, asked before EVERY action (start, handoff, save),
   * so the kill switch holds even for a file already in the cache.
   */
  const gate = React.useCallback(async (): Promise<{ ok: true; source: HighlightShareSource } | { ok: false; error: ShareError }> => {
    const prepared = await prepareHighlightShare(supabase, paramsRef.current.highlightId);
    if (prepared.ok) return { ok: true, source: prepared.data };
    return { ok: false, error: prepareRefusal(prepared.error.code) ?? DOWNLOAD_ERROR };
  }, []);

  /**
   * prepare (kill switch) -> sign 300 s -> download. `onDownloading` fires
   * once the download itself begins. Logs download_ok / download_failed once
   * per acquisition (not for a caller that joined an in-flight download).
   */
  const acquire = React.useCallback(
    async (onDownloading?: () => void, onProgress?: (fraction: number | null) => void): Promise<Acquired> => {
      const prepared = await prepareHighlightShare(supabase, paramsRef.current.highlightId);
      if (!prepared.ok) {
        const refusal = prepareRefusal(prepared.error.code);
        if (refusal === DISABLED_ERROR) return { ok: false, error: DISABLED_ERROR };
        const failure = refusal === NOT_READY_ERROR ? "not_ready" : refusal === NOT_FOUND_ERROR ? "not_found" : "unknown";
        log("download_failed", { failure });
        return { ok: false, error: refusal ?? DOWNLOAD_ERROR };
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
        // A caller that joined an in-flight download does not log it again.
        if (result.joined) return { ok: false, error: DOWNLOAD_ERROR };
        log("download_failed", {
          failure: result.failure,
          elapsed_ms: result.elapsedMs,
          ...(result.status !== undefined ? { http_status: result.status } : {}),
        });
        return { ok: false, error: DOWNLOAD_ERROR };
      }
      if (!result.joined) {
        log("download_ok", { elapsed_ms: result.elapsedMs, byte_count: result.byteCount, reused: result.reused });
      }
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
  const activePath: SharePath | null = primaryPath === null ? null : (reroutedPath ?? primaryPath);
  const activePathRef = React.useRef(activePath);
  activePathRef.current = activePath;

  /** Whether this file can go to Reels: capability, App ID and the 3-60 s window. */
  const reelsPossible = React.useCallback((file: ReadyFile) => {
    // A server duration coerced to 0 (missing) is "unknown", not "too short".
    const duration = file.source.durationS > 0 ? file.source.durationS : paramsRef.current.durationS;
    return capsRef.current?.reels === true && !!env.facebookAppId && isWithinReelsWindow(duration);
  }, []);

  const start = React.useCallback(() => {
    if (!enabledRef.current || busyRef.current) return;
    busyRef.current = true;
    const seq = ++seqRef.current;
    fileRef.current = null;
    handoffRef.current = null;
    setError(null);
    setProgress(null);
    setStage("preparing");
    const retry = sessionStartedRef.current;
    sessionStartedRef.current = true;
    log("share_tapped", {
      ...(activePathRef.current ? { path: activePathRef.current } : {}),
      ...(retry ? { retry: true } : {}),
    });
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
      // Known before the handoff: a file Reels cannot take goes to the share sheet.
      if (activePathRef.current === "reels" && !reelsPossible(acquired.file)) setRerouted("share_sheet");
      setProgress(1);
      setStage("ready");
    })();
  }, [acquire, log, reelsPossible, setError, setProgress, setRerouted, setStage]);

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
      setRerouted("share_sheet");
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
    [fail, log, setError, setRerouted, setStage],
  );

  const reels = React.useCallback(
    async (file: ReadyFile, seq: number, mayRedownload: boolean): Promise<HandoffOutcome> => {
      const appId = env.facebookAppId;
      if (!appId || !reelsPossible(file)) return shareSheet(file, seq);
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
          return outcome;
        }
        // Instagram never came up (the app never left the foreground): stop
        // waiting so the sheet is not stuck in handing_off.
        clearHandoffTimer();
        handoffTimerRef.current = setTimeout(() => {
          handoffTimerRef.current = null;
          if (handoffRef.current !== pending || pending.sawBackground || seq !== seqRef.current) return;
          handoffRef.current = null;
          setStage("done");
        }, IOS_HANDOFF_FALLBACK_MS);
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
    [acquire, clearHandoffTimer, fail, log, reelsPossible, setError, setProgress, setStage, shareSheet],
  );

  const handoff = React.useCallback(
    async (path?: SharePath): Promise<HandoffOutcome> => {
      if (!enabledRef.current || busyRef.current) return { ok: false, error: null };
      const cached = fileRef.current;
      const chosen = path ?? activePathRef.current;
      if (!cached || !chosen) return { ok: false, error: null };
      busyRef.current = true;
      const seq = seqRef.current;
      try {
        // The kill switch (and the reel still existing) is re-checked on every handoff.
        const gated = await gate();
        if (seq !== seqRef.current) return { ok: false, error: null };
        if (!gated.ok) return fail(gated.error);
        let file = cached;
        if (gated.source.fileName !== cached.source.fileName) {
          // A new live version landed since the download: hand off that one.
          setStage("downloading");
          setProgress(0);
          const again = await acquire(undefined, (fraction) => {
            if (seq === seqRef.current && fraction !== null) setProgress(fraction);
          });
          if (seq !== seqRef.current) return { ok: false, error: null };
          if (!again.ok) return fail(again.error);
          file = again.file;
          fileRef.current = file;
          setProgress(1);
        }
        return chosen === "reels" ? await reels(file, seq, true) : await shareSheet(file, seq);
      } finally {
        if (seq === seqRef.current) busyRef.current = false;
      }
    },
    [acquire, fail, gate, reels, setProgress, setStage, shareSheet],
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
        clearHandoffTimer();
        log("returned_from_instagram", { path: "reels", elapsed_ms: Date.now() - pending.at });
        setStage("returned");
      }
    });
    return () => sub.remove();
  }, [clearHandoffTimer, log, setStage]);

  const saveToPhotos = React.useCallback(async (): Promise<SaveOutcome> => {
    if (!enabledRef.current) return { ok: false, kind: "disabled" };
    if (!capsRef.current?.saveToPhotos || savingRef.current) return { ok: false, kind: "unavailable" };
    savingRef.current = true;
    try {
      const saveRefusal = (e: ShareError): SaveOutcome => ({
        ok: false,
        kind: e.kind === "disabled" ? "disabled" : e.code === "not-ready" || e.code === "not-found" ? "not_ready" : "download",
      });
      let file = fileRef.current;
      if (file) {
        // A cached file is only saved after the server gate says yes again.
        const gated = await gate();
        if (!gated.ok) return saveRefusal(gated.error);
        if (gated.source.fileName !== file.source.fileName) file = null;
      }
      if (!file) {
        const acquired = await acquire();
        if (!acquired.ok) return saveRefusal(acquired.error);
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
  }, [acquire, gate, log]);

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
      if (!pressHoldLoggedRef.current) {
        pressHoldLoggedRef.current = true;
        log("caption_copied", { clipboard: "press_and_hold" });
      }
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
    activePath,
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
