import * as React from "react";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { SheetBackground } from "@/components/match-detail/highlight/highlight-sheet-background";

interface PreShareSheetProps {
  open: boolean;
  /** Fired once the sheet has fully closed (swipe, backdrop, or `open` -> false). */
  onClosed: () => void;
  children: React.ReactNode;
}

/**
 * The gorhom modal around the pre-share flow. Per `challenge-prompt-sheet.tsx`,
 * only `dismiss()` a sheet this component presented and that has not closed
 * itself, or gorhom sticks in DISMISSING and the next `present()` is blank.
 */
export function PreShareSheet({ open, onClosed, children }: PreShareSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const presentedRef = React.useRef(false);
  const tokens = useThemedTokens();
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
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
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
      backgroundComponent={SheetBackground}
      backgroundStyle={{ backgroundColor: tokens.bgSecondary }}
      handleIndicatorStyle={{ backgroundColor: tokens.textTertiary }}
    >
      <BottomSheetView style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 16 }}>
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
