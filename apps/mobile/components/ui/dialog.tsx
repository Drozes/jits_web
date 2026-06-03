import * as React from "react";
import { Modal, Pressable, Text, View, type ViewProps } from "react-native";
import { cn } from "../../lib/cn";

interface DialogContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error("Dialog subcomponents must be used inside <Dialog>");
  return ctx;
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

export function Dialog({ open: controlled, defaultOpen, onOpenChange, children }: DialogProps) {
  const [internal, setInternal] = React.useState(defaultOpen ?? false);
  const open = controlled ?? internal;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlled === undefined) setInternal(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  return (
    <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>
  );
}

export function DialogTrigger({ children, asChild }: { children: React.ReactElement; asChild?: boolean }) {
  const { setOpen } = useDialogContext();
  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as { onPress?: () => void };
    return React.cloneElement(children as React.ReactElement<{ onPress?: () => void }>, {
      onPress: () => {
        childProps.onPress?.();
        setOpen(true);
      },
    });
  }
  return <Pressable onPress={() => setOpen(true)}>{children}</Pressable>;
}

export function DialogContent({
  className,
  children,
  ...props
}: ViewProps & { className?: string; children?: React.ReactNode }) {
  const { open, setOpen } = useDialogContext();
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => setOpen(false)}
    >
      <Pressable
        onPress={() => setOpen(false)}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-md">
          <View
            className={cn(
              "rounded-lg border border-border bg-card p-4 gap-3",
              className,
            )}
            {...props}
          >
            {children}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const DialogHeader = ({ className, ...props }: ViewProps & { className?: string }) => (
  <View className={cn("gap-1.5", className)} {...props} />
);
export const DialogFooter = ({ className, ...props }: ViewProps & { className?: string }) => (
  <View className={cn("flex-row items-center justify-end gap-2 pt-2", className)} {...props} />
);
export const DialogTitle = ({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) => (
  <Text className={cn("text-lg font-semibold text-card-foreground", className)} {...props} />
);
export const DialogDescription = ({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) => (
  <Text className={cn("text-sm text-muted-foreground", className)} {...props} />
);

export function DialogClose({ children, asChild }: { children: React.ReactElement; asChild?: boolean }) {
  const { setOpen } = useDialogContext();
  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as { onPress?: () => void };
    return React.cloneElement(children as React.ReactElement<{ onPress?: () => void }>, {
      onPress: () => {
        childProps.onPress?.();
        setOpen(false);
      },
    });
  }
  return <Pressable onPress={() => setOpen(false)}>{children}</Pressable>;
}
