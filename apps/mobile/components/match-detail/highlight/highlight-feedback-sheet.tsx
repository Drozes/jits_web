import * as React from "react";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useSheetSchemeScope } from "@/lib/theme/use-sheet-scheme-scope";
import { SheetBackground } from "./highlight-sheet-background";

interface HighlightFeedbackSheetProps {
  open: boolean;
  /** A submit is running: no swipe or backdrop close until it settles. */
  busy: boolean;
  /** Fired once the sheet has fully closed (swipe, backdrop, or `open` -> false). */
  onClosed: () => void;
  children: React.ReactNode;
}

/**
 * The gorhom modal around the feedback form. Per `notification-panel.tsx`,
 * only `dismiss()` a sheet this component presented and that has not closed
 * itself, or gorhom sticks in DISMISSING and the next `present()` is blank.
 */
export function HighlightFeedbackSheet({ open, busy, onClosed, children }: HighlightFeedbackSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const presentedRef = React.useRef(false);
  // Background and handle come from the opener's scheme (forced dark in the
  // viewer); the portalled content re-enters that same scheme.
  const tokens = useThemedTokens();
  const scope = useSheetSchemeScope();

  React.useEffect(() => {
    if (open) {
      ref.current?.present();
      presentedRef.current = true;
    } else if (presentedRef.current) ref.current?.dismiss();
  }, [open]);

  const handleChange = React.useCallback(
    (index: number) => {
      if (index !== -1 || !presentedRef.current) return;
      presentedRef.current = false;
      onClosed();
    },
    [onClosed],
  );

  const renderBackdrop = React.useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior={busy ? "none" : "close"} />
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
      accessible={false} // else the whole sheet is one "Bottom Sheet" leaf to VoiceOver
      backdropComponent={renderBackdrop}
      backgroundComponent={SheetBackground}
      backgroundStyle={{ backgroundColor: tokens.bgSecondary }}
      handleIndicatorStyle={{ backgroundColor: tokens.textTertiary }}
    >
      <BottomSheetView>{scope(children)}</BottomSheetView>
    </BottomSheetModal>
  );
}
