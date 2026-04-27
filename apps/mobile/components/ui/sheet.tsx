import * as React from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { cn } from "../../lib/cn";

interface SheetContextValue {
  ref: React.RefObject<BottomSheet | null>;
  open: () => void;
  close: () => void;
}

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error("Sheet subcomponents must be used inside <Sheet>");
  return ctx;
}

export interface SheetProps {
  children?: React.ReactNode;
}

export function Sheet({ children }: SheetProps) {
  const ref = React.useRef<BottomSheet | null>(null);
  const open = React.useCallback(() => ref.current?.expand(), []);
  const close = React.useCallback(() => ref.current?.close(), []);
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
  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "hsl(0, 0%, 100%)" }}
    >
      <BottomSheetView className={cn("flex-1 px-4 pb-4", className)}>
        {children}
      </BottomSheetView>
    </BottomSheet>
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
