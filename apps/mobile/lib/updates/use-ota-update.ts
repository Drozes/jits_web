/**
 * In-app OTA update controller (jits-5i2w). The only file that imports
 * `expo-updates`; all decisions live in the pure `update-policy.ts`.
 *
 * - Launch: the native ON_LOAD check already runs and downloads in the
 *   background; `useUpdates()` reflects it. No JS check on mount.
 * - Foreground (background -> active only, `inactive` round trips ignored):
 *   a throttled check + fetch, errors swallowed. Allowed mid-match: only the
 *   UI and the reload are deferred while a match screen is mounted.
 * - Disabled (dev, Expo Go, updates off): prompt is always "none", no
 *   Updates API is called and no AppState listener is registered.
 *
 * `useUpdates()` is called unconditionally (hooks rule). It is safe when
 * updates are disabled: it only reads the native module's `initialContext`
 * and subscribes to its state-change emitter, issuing no native calls. The
 * ExpoUpdates native module is compiled into every build (and Expo Go) that
 * can run this bundle, and jest-expo ships a mock for it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Updates from "expo-updates";
import { useIsInArenaMatch } from "@/lib/arena/arena-store";
import { toast } from "@/components/ui/toast";
import {
  decideUpdatePrompt,
  extraFromUpdateManifest,
  isCriticalUpdate,
  isOtaControlEnabled,
  readCriticalIndex,
  readUpdateNotice,
  shouldCheckForUpdate,
  type PendingUpdate,
  type UpdatePrompt,
} from "./update-policy";

export interface OtaUpdateState {
  prompt: UpdatePrompt;
  notice: string | null;
  restarting: boolean;
  /** Set when a restart failed; rendered inline by the modal (a toast would sit under it). */
  restartError: string | null;
  restart: () => void;
  dismiss: () => void;
}

export const RESTART_FAILED_MESSAGE = "Couldn't restart. Close and reopen the app.";
/** reloadAsync resolved but the app is still running: give up waiting after this. */
export const RESTART_STUCK_MS = 10_000;

type Pending = PendingUpdate & { notice: string | null };

function readPending(
  isUpdatePending: boolean,
  downloaded: Updates.UpdateInfo | undefined,
): Pending | null {
  if (!isUpdatePending || !downloaded) return null;
  if (downloaded.type !== Updates.UpdateInfoType.NEW) {
    return { updateId: null, critical: false, notice: null };
  }
  // Defensive: never offer a restart into the bundle that is already running.
  if (Updates.updateId && downloaded.updateId === Updates.updateId) return null;
  const updateExtra = extraFromUpdateManifest(downloaded.manifest);
  return {
    updateId: downloaded.updateId,
    critical: isCriticalUpdate(
      readCriticalIndex(Constants.expoConfig?.extra),
      readCriticalIndex(updateExtra),
    ),
    notice: readUpdateNotice(updateExtra),
  };
}

export function useOtaUpdate({ suppressed }: { suppressed: boolean }): OtaUpdateState {
  const enabled = isOtaControlEnabled({
    isDev: __DEV__,
    updatesEnabled: Updates.isEnabled,
    isExpoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  });
  const { isUpdatePending, downloadedUpdate, isStartupProcedureRunning } = Updates.useUpdates();
  const inMatch = useIsInArenaMatch();
  const [dismissedUpdateId, setDismissedUpdateId] = useState<string | null>(null);
  const [rollbackDismissed, setRollbackDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const restartingRef = useRef(false);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptRef = useRef<UpdatePrompt>("none");
  // Read by the AppState listener, which is registered once.
  const startupRef = useRef(isStartupProcedureRunning);
  const pendingRef = useRef(false);
  useEffect(() => {
    startupRef.current = isStartupProcedureRunning;
  }, [isStartupProcedureRunning]);

  const pending = useMemo(
    () => (enabled ? readPending(isUpdatePending, downloadedUpdate) : null),
    [enabled, isUpdatePending, downloadedUpdate],
  );
  // Keyed off the COMPUTED pending, not raw isUpdatePending: natively that can
  // go true with no manifest (e.g. a failed or no-op download still ends in
  // downloadComplete), and the running-id guard nulls it too. Skipping on the
  // raw flag would then show nothing AND stop checking until the next cold start.
  useEffect(() => {
    pendingRef.current = pending !== null;
  }, [pending]);
  const effectivePending = pending?.updateId === null && rollbackDismissed ? null : pending;

  useEffect(() => {
    if (!enabled) return;
    let lastCheckAt: number | null = Date.now();
    let inFlight = false;
    let prev: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      const cameFromBackground = prev === "background";
      if (next !== "inactive") prev = next;
      if (next !== "active" || !cameFromBackground) return;
      // Nothing to gain while one is already downloaded or native is busy.
      if (startupRef.current || pendingRef.current) return;
      const now = Date.now();
      if (!shouldCheckForUpdate({ now, lastCheckAt, inFlight })) return;
      inFlight = true;
      lastCheckAt = now;
      void (async () => {
        try {
          const result = await Updates.checkForUpdateAsync();
          if (result.isAvailable) await Updates.fetchUpdateAsync();
        } catch {
          // Silent by design: the next eligible foreground tries again.
        } finally {
          inFlight = false;
        }
      })();
    });
    return () => sub.remove();
  }, [enabled]);

  useEffect(
    () => () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    },
    [],
  );

  const dismiss = useCallback(() => {
    if (!pending) return;
    if (pending.updateId === null) setRollbackDismissed(true);
    else setDismissedUpdateId(pending.updateId);
  }, [pending]);

  const restart = useCallback(() => {
    if (restartingRef.current || inMatch || !enabled) return;
    restartingRef.current = true;
    setRestarting(true);
    setRestartError(null);
    const fail = () => {
      restartingRef.current = false;
      setRestarting(false);
      setRestartError(RESTART_FAILED_MESSAGE);
      // Under the opaque modal a toast is invisible; the modal shows the error inline.
      if (promptRef.current !== "modal") toast.error(RESTART_FAILED_MESSAGE);
    };
    Updates.reloadAsync().then(() => {
      stuckTimerRef.current = setTimeout(fail, RESTART_STUCK_MS);
    }, fail);
  }, [inMatch, enabled]);

  const prompt = decideUpdatePrompt({
    pending: effectivePending,
    inMatch,
    suppressed,
    dismissedUpdateId,
  });
  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);
  return {
    prompt,
    notice: prompt === "modal" ? (effectivePending?.notice ?? null) : null,
    restarting,
    restartError,
    restart,
    dismiss,
  };
}
