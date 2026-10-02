import * as React from "react";
import { Pressable, Text, View, type ViewProps, type ViewStyle } from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
} from "@gorhom/bottom-sheet";
import { cn } from "../../lib/cn";
import { useThemedTokens } from "../../lib/theme/use-theme";
import { ON_MEDIA } from "../../lib/theme/palette";
import { useSheetAnimationConfigs } from "../../lib/motion/use-modal-animation";
import type { ColorTokens } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Shared sheet chrome (DESIGN.md, "Sheet"). Every gorhom sheet in the app
// takes its background, handle, backdrop and present animation from here, so
// no sheet keeps gorhom's default 15px radius or its own scrim.
// ---------------------------------------------------------------------------

/** `radius-sheet`: the top corners of every sheet, the ceiling of the radius scale. */
export const SHEET_RADIUS = 8;

/**
 * The sheet surface: `panel` fill, `radius-sheet` top corners, a square
 * bottom and a `hairline` top edge. `borderRadius: 0` overrides gorhom's
 * default 15px on the bottom corners too.
 */
export function sheetBackgroundStyle(tokens: ColorTokens): ViewStyle {
  return {
    backgroundColor: tokens.bgSecondary,
    borderRadius: 0,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
    borderTopColor: tokens.borderHairline,
  };
}

/** The drag handle: a 30x4 `ink-3` bar. */
export function sheetHandleIndicatorStyle(tokens: ColorTokens): ViewStyle {
  return { backgroundColor: tokens.textTertiary, width: 30, height: 4, borderRadius: 2 };
}

/**
 * The sheet background view. Purely visual: gorhom's default background is a
 * VoiceOver stop ("Bottom Sheet", adjustable) with nothing to adjust.
 */
export function SheetBackground({ style, pointerEvents }: BottomSheetBackgroundProps) {
  return <View pointerEvents={pointerEvents} accessible={false} importantForAccessibility="no" style={style} />;
}

/**
 * The backdrop behind every gorhom sheet: the one `on-media-scrim`
 * (black 55%), faded in with the sheet's position. `pressBehavior` defaults
 * to closing the sheet; gorhom labels it as a button ("Bottom sheet backdrop").
 */
export function SheetBackdrop(props: BottomSheetBackdropProps & { pressBehavior?: "none" | "close" }) {
  const { style, pressBehavior = "close", ...rest } = props;
  const scrimStyle = React.useMemo(() => [style, { backgroundColor: ON_MEDIA.scrim }], [style]);
  return (
    <BottomSheetBackdrop
      {...rest}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={1}
      pressBehavior={pressBehavior}
      style={scrimStyle}
    />
  );
}

/**
 * Spread onto a `BottomSheetModal`: the shared background, handle and the
 * Reduce-Motion-aware present animation ("Sheet / modal present" in the
 * Motion registry). Pass `backdropComponent` yourself (with `SheetBackdrop`)
 * when the sheet needs its own press behavior.
 */
export function useSheetChrome() {
  const tokens = useThemedTokens();
  const animationConfigs = useSheetAnimationConfigs();
  return React.useMemo(
    () => ({
      backgroundComponent: SheetBackground,
      backgroundStyle: sheetBackgroundStyle(tokens),
      handleIndicatorStyle: sheetHandleIndicatorStyle(tokens),
      animationConfigs,
    }),
    [tokens, animationConfigs],
  );
}

interface SheetContextValue {
  ref: React.RefObject<BottomSheetModal | null>;
  open: () => void;
  close: () => void;
}

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error("Sheet subcomponents must be used inside <Sheet>");
  return ctx;
}

export interface SheetController {
  open: () => void;
  close: () => void;
}

export interface SheetProps {
  children?: React.ReactNode;
  /**
   * Optional handle for the PARENT that renders <Sheet>. The parent sits above
   * the SheetContext provider so it can't call useSheetContext(); this lets it
   * imperatively close the sheet after a successful mutation (e.g. dismiss the
   * "New Session" form once the session is created). Children should still use
   * <SheetTrigger>/<SheetClose>/useSheetContext() instead.
   */
  controllerRef?: React.Ref<SheetController>;
}

export function Sheet({ children, controllerRef }: SheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  // BottomSheetModal portals its content to the root <BottomSheetModalProvider>,
  // so the sheet always measures the full window and snaps correctly no matter
  // where the trigger sits. The old inline (non-modal) <BottomSheet> measured its
  // immediate parent, so a trigger placed in AppHeader's ~32px right-action slot
  // collapsed the sheet into a tiny box pinned to the top-right corner.
  const open = React.useCallback(() => ref.current?.present(), []);
  const close = React.useCallback(() => ref.current?.dismiss(), []);
  React.useImperativeHandle(controllerRef, () => ({ open, close }), [open, close]);
  return (
    <SheetContext.Provider value={{ ref, open, close }}>
      {children}
    </SheetContext.Provider>
  );
}

export function SheetTrigger({ children, asChild }: { children: React.ReactElement; asChild?: boolean }) {
  const { open } = useSheetContext();
  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as { onPress?: () => void };
    return React.cloneElement(children as React.ReactElement<{ onPress?: () => void }>, {
      onPress: () => {
        childProps.onPress?.();
        open();
      },
    });
  }
  return (
    <Pressable onPress={open} accessibilityRole="button">
      {children}
    </Pressable>
  );
}

const renderBackdrop = (props: BottomSheetBackdropProps) => <SheetBackdrop {...props} />;

export interface SheetContentProps {
  className?: string;
  snapPoints?: (string | number)[];
  children?: React.ReactNode;
}

export function SheetContent({ className, snapPoints = ["50%", "90%"], children }: SheetContentProps) {
  const { ref } = useSheetContext();
  const chrome = useSheetChrome();
  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      {...chrome}
    >
      <BottomSheetView className={cn("flex-1 px-4 pb-4", className)}>
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

export const SheetHeader = ({ className, ...props }: ViewProps & { className?: string }) => (
  <View className={cn("gap-1.5 pb-3", className)} {...props} />
);
export const SheetFooter = ({ className, ...props }: ViewProps & { className?: string }) => (
  <View className={cn("flex-row items-center justify-end gap-2 pt-3", className)} {...props} />
);
export const SheetTitle = ({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) => (
  <Text
    accessibilityRole="header"
    className={cn("font-heading text-callout uppercase tracking-caps-l text-ink", className)}
    {...props}
  />
);
export const SheetDescription = ({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) => (
  <Text className={cn("font-body text-body text-ink-2", className)} {...props} />
);

export function SheetClose({ children, asChild }: { children: React.ReactElement; asChild?: boolean }) {
  const { close } = useSheetContext();
  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as { onPress?: () => void };
    return React.cloneElement(children as React.ReactElement<{ onPress?: () => void }>, {
      onPress: () => {
        childProps.onPress?.();
        close();
      },
    });
  }
  return (
    <Pressable onPress={close} accessibilityRole="button">
      {children}
    </Pressable>
  );
}
