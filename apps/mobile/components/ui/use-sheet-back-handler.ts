import * as React from "react";
import { BackHandler } from "react-native";

export interface SheetBackHandlerOptions {
  /**
   * The sheet is showing: this component presented it and it has not closed
   * itself yet. Only then is the hardware back consumed.
   */
  open: boolean;
  /**
   * The sheet cannot close right now (a submit is running): the back is still
   * consumed, so it never reaches the screen behind, but `onBack` is not called.
   */
  busy?: boolean;
  /**
   * Closes the sheet the way a swipe down or a backdrop tap would (normally
   * `ref.current?.dismiss()`, or the sheet's own cancel path) and returns
   * true when it STARTED a close. After a true, further presses while the
   * sheet animates out are consumed and ignored, so gorhom is never
   * dismissed twice; after a false, the next press calls it again. It may be
   * called again for the same opening when that close did not take (see
   * `onChange`), so it must not clear its own "presented" guard: clear that
   * in the sheet's `onChange(-1)` / `onDismiss` instead.
   */
  onBack: () => boolean;
}

export interface SheetBackHandle {
  /**
   * Call from the sheet's `onChange` with every index. An open index (>= 0)
   * after a back started a close means gorhom dropped that dismiss (a back
   * during the present animation, jits-mafl.2.1): the close is issued again
   * now that the sheet has settled open, so the back still ends closed.
   */
  onChange: (index: number) => void;
}

/**
 * Backstop for a close that never reports back (no `onChange`, no
 * `onDismiss`): after this long the next press calls `onBack` again instead
 * of being swallowed forever. Longer than the ~300 ms present / dismiss
 * animation, so a normal close never reaches it.
 */
export const SHEET_BACK_CLOSE_WATCHDOG_MS = 800;

/**
 * Android hardware back for a gorhom `BottomSheetModal` (jits-mafl.2 M7).
 * gorhom does not listen to the back button, so without this it passes
 * through the sheet and pops the screen behind it. While `open`, the back
 * closes the sheet and returns true; while closed nothing is registered.
 *
 * A back during the present animation (jits-mafl.2.1): gorhom 5 can drop that
 * `dismiss()` (the sheet is not measured yet, so `forceClose` is a no-op) and
 * settle open, or close without ever firing `onChange(-1)` (its index never
 * reached 0, so only `onDismiss` fires). So the owner must (1) pass every
 * `onChange` index to the returned `onChange`, which re-issues a dropped
 * close, and (2) treat `onDismiss` as closed, exactly like `onChange(-1)`.
 * The watchdog above is the backstop: the "closing" latch never outlives it.
 *
 * The CLAUDE.md sheet rule still applies: `onBack` may only `dismiss()` a sheet
 * this component presented and that has not closed itself (see
 * `notification-panel.tsx`), so pass `open` from the same "presented" state
 * the sheet's own effect uses.
 *
 * Register it once per sheet, in the component that owns the
 * `BottomSheetModal` (`Sheet`, `FormSheet`, ...), never again in a wrapper
 * around it, or one press would be handled twice. Stacked sheets need no
 * coordination: React Native calls the newest listener first, and a listener
 * is added when its sheet opens, so the top sheet closes first.
 *
 * BackHandler does nothing on iOS, so this is safe to call on every platform.
 */
export function useSheetBackHandler({ open, busy = false, onBack }: SheetBackHandlerOptions): SheetBackHandle {
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;
  const busyRef = React.useRef(busy);
  busyRef.current = busy;
  const openRef = React.useRef(open);
  openRef.current = open;
  const closingRef = React.useRef(false);
  const watchdogRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = React.useCallback(() => {
    closingRef.current = false;
    if (watchdogRef.current !== null) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  }, []);

  const startClose = React.useCallback(() => {
    if (!onBackRef.current()) return;
    closingRef.current = true;
    if (watchdogRef.current !== null) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      watchdogRef.current = null;
      closingRef.current = false;
    }, SHEET_BACK_CLOSE_WATCHDOG_MS);
  }, []);

  React.useEffect(() => {
    settle();
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!closingRef.current && !busyRef.current) startClose();
      return true;
    });
    return () => {
      sub.remove();
      settle();
    };
  }, [open, settle, startClose]);

  const onChange = React.useCallback(
    (index: number) => {
      if (index < 0 || !closingRef.current) return;
      // The back's close did not take: the sheet settled open. Close it now.
      settle();
      if (openRef.current && !busyRef.current) startClose();
    },
    [settle, startClose],
  );

  return React.useMemo(() => ({ onChange }), [onChange]);
}
