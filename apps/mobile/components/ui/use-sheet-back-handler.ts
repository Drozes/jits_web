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
   * `ref.current?.dismiss()`, or the sheet's own cancel path). Called at most
   * once per opening: further presses while the sheet animates out are
   * consumed and ignored, so gorhom is never dismissed twice.
   */
  onBack: () => void;
}

/**
 * Android hardware back for a gorhom `BottomSheetModal` (jits-mafl.2 M7).
 * gorhom does not listen to the back button, so without this it passes
 * through the sheet and pops the screen behind it. While `open`, the back
 * closes the sheet and returns true; while closed nothing is registered.
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
export function useSheetBackHandler({ open, busy = false, onBack }: SheetBackHandlerOptions): void {
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;
  const busyRef = React.useRef(busy);
  busyRef.current = busy;

  React.useEffect(() => {
    if (!open) return;
    let closing = false;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (closing || busyRef.current) return true;
      closing = true;
      onBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, [open]);
}
