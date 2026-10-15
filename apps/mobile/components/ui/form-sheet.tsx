import * as React from "react";
import { BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { useSheetSchemeScope } from "@/lib/theme/use-sheet-scheme-scope";
import { SheetBackdrop, useSheetChrome } from "./sheet";
import { useSheetBackHandler } from "./use-sheet-back-handler";

export interface FormSheetProps {
  open: boolean;
  /** A submit is running: no swipe or backdrop close until it settles. */
  busy: boolean;
  /** Fired once the sheet has fully closed (swipe, backdrop, or `open` -> false). */
  onClosed: () => void;
  children: React.ReactNode;
}

/**
 * A state-driven gorhom sheet around a short form (the highlight feedback
 * form, the report and block sheets): dynamic height, keyboard aware, no
 * swipe or backdrop close while busy, the shared chrome, and the opener's
 * forced scheme re-applied to the portalled content. Per `notification-panel.tsx`,
 * only `dismiss()` a sheet this component presented and that has not closed
 * itself, or gorhom sticks in DISMISSING and the next `present()` is blank.
 */
export function FormSheet({ open, busy, onClosed, children }: FormSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const presentedRef = React.useRef(false);
  // Background and handle come from the opener's scheme (forced dark in the
  // viewer); the portalled content re-enters that same scheme.
  const chrome = useSheetChrome();
  const scope = useSheetSchemeScope();

  React.useEffect(() => {
    if (open) {
      ref.current?.present();
      presentedRef.current = true;
    } else if (presentedRef.current) ref.current?.dismiss();
  }, [open]);

  // Android back: closes like a swipe; while busy it is swallowed, like the swipe (jits-mafl.2 M7).
  const back = useSheetBackHandler({
    open,
    busy,
    onBack: () => {
      if (!presentedRef.current) return false;
      ref.current?.dismiss();
      return true;
    },
  });

  // Closed: onChange(-1), or only onDismiss for a close during the present
  // animation (jits-mafl.2.1). Whichever comes first reports it, once.
  const handleClosed = React.useCallback(() => {
    if (!presentedRef.current) return;
    presentedRef.current = false;
    onClosed();
  }, [onClosed]);
  const handleChange = React.useCallback(
    (index: number) => {
      back.onChange(index);
      if (index === -1) handleClosed();
    },
    [back, handleClosed],
  );

  const renderBackdrop = React.useCallback(
    (props: BottomSheetBackdropProps) => (
      <SheetBackdrop {...props} pressBehavior={busy ? "none" : "close"} />
    ),
    [busy],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose={!busy}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      onChange={handleChange}
      onDismiss={handleClosed}
      accessible={false} // else the whole sheet is one "Bottom Sheet" leaf to VoiceOver
      backdropComponent={renderBackdrop}
      {...chrome}
    >
      <BottomSheetView>{scope(children)}</BottomSheetView>
    </BottomSheetModal>
  );
}
