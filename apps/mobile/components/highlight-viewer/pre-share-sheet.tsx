import * as React from "react";
import { BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSheetSchemeScope } from "@/lib/theme/use-sheet-scheme-scope";
import { SheetBackdrop, useSheetChrome } from "@/components/ui/sheet";

interface PreShareSheetProps {
  open: boolean;
  /** Fired once the sheet has fully closed (swipe, backdrop, or `open` -> false). */
  onClosed: () => void;
  children: React.ReactNode;
}

/**
 * The gorhom modal around the pre-share flow. Per `notification-panel.tsx`,
 * only `dismiss()` a sheet this component presented and that has not closed
 * itself, or gorhom sticks in DISMISSING and the next `present()` is blank.
 */
export function PreShareSheet({ open, onClosed, children }: PreShareSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const presentedRef = React.useRef(false);
  // Background and handle come from the opener's scheme (forced dark in the
  // viewer); the portalled content re-enters that same scheme.
  const chrome = useSheetChrome();
  const scope = useSheetSchemeScope();
  const insets = useSafeAreaInsets();

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
      <SheetBackdrop {...props} pressBehavior="close" />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      onChange={handleChange}
      accessible={false} // else the whole sheet is one "Bottom Sheet" leaf to VoiceOver
      backdropComponent={renderBackdrop}
      {...chrome}
    >
      <BottomSheetView style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 16 }}>
        {scope(children)}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
