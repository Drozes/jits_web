import * as React from "react";
import { View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
} from "@gorhom/bottom-sheet";
import { useThemedTokens } from "@/lib/theme/use-theme";

/** Purely visual background: no gorhom "Bottom Sheet" a11y stop, 8 px modal cap. */
function SheetBackground({ style, pointerEvents }: BottomSheetBackgroundProps) {
  return (
    <View
      pointerEvents={pointerEvents}
      accessible={false}
      importantForAccessibility="no"
      style={[style, { borderTopLeftRadius: 8, borderTopRightRadius: 8 }]}
    />
  );
}

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

interface HighlightFeedbackSheetProps {
  open: boolean;
  /** Fired once the sheet has fully closed (swipe, backdrop, or `open` -> false). */
  onClosed: () => void;
  children: React.ReactNode;
}

/**
 * The gorhom modal around the feedback form. Follows the
 * `challenge-prompt-sheet.tsx` rule: only `dismiss()` a sheet this component
 * presented and that has not already closed itself, or gorhom sticks in
 * DISMISSING and the next `present()` renders nothing.
 */
export function HighlightFeedbackSheet({ open, onClosed, children }: HighlightFeedbackSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const presentedRef = React.useRef(false);
  const tokens = useThemedTokens();

  React.useEffect(() => {
    if (open) {
      ref.current?.present();
      presentedRef.current = true;
    } else if (presentedRef.current) {
      ref.current?.dismiss();
    }
  }, [open]);

  const handleChange = React.useCallback(
    (index: number) => {
      if (index === -1 && presentedRef.current) {
        presentedRef.current = false;
        onClosed();
      }
    },
    [onClosed],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      onChange={handleChange}
      // gorhom makes the content container one accessible leaf labelled
      // "Bottom Sheet"; off, so VoiceOver reaches the chips and buttons.
      accessible={false}
      backdropComponent={renderBackdrop}
      backgroundComponent={SheetBackground}
      backgroundStyle={{ backgroundColor: tokens.bgSecondary }}
      handleIndicatorStyle={{ backgroundColor: tokens.textTertiary }}
    >
      <BottomSheetView>{children}</BottomSheetView>
    </BottomSheetModal>
  );
}
