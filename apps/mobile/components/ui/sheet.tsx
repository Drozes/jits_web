import * as React from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { cn } from "../../lib/cn";
import { useThemedTokens } from "../../lib/theme/use-theme";

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
  return <Pressable onPress={open}>{children}</Pressable>;
}

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

export interface SheetContentProps {
  className?: string;
  snapPoints?: (string | number)[];
  children?: React.ReactNode;
}

export function SheetContent({ className, snapPoints = ["50%", "90%"], children }: SheetContentProps) {
  const { ref } = useSheetContext();
  const tokens = useThemedTokens();
  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: tokens.card }}
      handleIndicatorStyle={{ backgroundColor: tokens.mutedForeground }}
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
  <Text className={cn("text-lg font-semibold text-foreground", className)} {...props} />
);
export const SheetDescription = ({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) => (
  <Text className={cn("text-sm text-muted-foreground", className)} {...props} />
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
  return <Pressable onPress={close}>{children}</Pressable>;
}
