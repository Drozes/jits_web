/**
 * Keeps a blocking React Native <Modal> actually on screen.
 *
 * On iOS, RCTModalHostViewComponentView presents its view controller exactly
 * once and never retries. If the root view controller is already presenting
 * something (the profile-setup `presentation: "modal"` screen, another RN
 * Modal such as a select or date picker), UIKit refuses the presentation and
 * the gate silently fails open. `onShow` only fires once the Modal is really
 * presented, so until it does this hook bumps a `key` to remount the Modal:
 * first after `firstRetryMs`, then every `retryIntervalMs`, and on every
 * AppState "active", stopping for good once `onShow` fires.
 *
 * Android: ReactModalHostManager.kt still documents `onShow` as "iOS only",
 * but that comment is stale. ReactModalHostView.kt (~line 283) wires a
 * Dialog.OnShowListener that emits `onShow` when the dialog is shown, so the
 * watchdog also stops there and never remounts a presented Android modal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/**
 * Generous on purpose: onShow can land late on a busy JS thread right after
 * the splash, and a premature remount dismisses and re-presents the Modal
 * (a visible blink that can swallow a Restart tap).
 */
export const MODAL_FIRST_RETRY_MS = 1_500;
export const MODAL_RETRY_INTERVAL_MS = 1_500;

export function useModalPresentWatchdog(
  visible: boolean,
  firstRetryMs = MODAL_FIRST_RETRY_MS,
  retryIntervalMs = MODAL_RETRY_INTERVAL_MS,
): { modalKey: number; onShow: () => void } {
  const [modalKey, setModalKey] = useState(0);
  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      shownRef.current = false;
      setShown(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || shown) return;
    const remount = () => {
      if (!shownRef.current) setModalKey((k) => k + 1);
    };
    let interval: ReturnType<typeof setInterval> | null = null;
    const first = setTimeout(() => {
      remount();
      interval = setInterval(remount, retryIntervalMs);
    }, firstRetryMs);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") remount();
    });
    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
      sub.remove();
    };
  }, [visible, shown, firstRetryMs, retryIntervalMs]);

  const onShow = useCallback(() => {
    shownRef.current = true;
    setShown(true);
  }, []);

  return { modalKey, onShow };
}
