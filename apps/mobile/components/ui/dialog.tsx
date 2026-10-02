import * as React from "react";
import { Modal, Pressable, Text, View, type ViewProps } from "react-native";
import { cn } from "../../lib/cn";
import { useModalAnimation } from "../../lib/motion/use-modal-animation";

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
  return (
    <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
      {children}
    </Pressable>
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: ViewProps & { className?: string; children?: React.ReactNode }) {
  const { open, setOpen } = useDialogContext();
  // A centered dialog fades in; under Reduce Motion it appears in place.
  const animationType = useModalAnimation("fade");
  return (
    <Modal
      visible={open}
      transparent
      animationType={animationType}
      onRequestClose={() => setOpen(false)}
    >
      <View
        testID="dialog-scrim"
        // The VoiceOver escape gesture (two-finger Z) closes the dialog.
        onAccessibilityEscape={() => setOpen(false)}
        className="flex-1 items-center justify-center bg-on-media-scrim px-6"
      >
        {/* The scrim closes the dialog. It is a sibling of the card, not its
            parent, so VoiceOver reaches the card's own controls instead of
            reading the whole dialog as one "Close" button. The card is not
            `accessibilityViewIsModal`: that would hide this button, the only
            way out of a dialog with no close action (Compare Stats). */}
        <Pressable
          testID="dialog-backdrop"
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
          // A VoiceOver double-tap activates the frame's center, which sits
          // under the centered card; close on the accessibility tap itself.
          onAccessibilityTap={() => setOpen(false)}
          className="absolute inset-0"
        />
        <View
          testID="dialog-card"
          className={cn(
            "w-full max-w-md rounded-lg border border-hairline bg-surface-2 p-4 gap-3",
            className,
          )}
          {...props}
        >
          {children}
        </View>
      </View>
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
  <Text
    accessibilityRole="header"
    className={cn("font-heading text-[14px] uppercase tracking-caps-l text-ink", className)}
    {...props}
  />
);
export const DialogDescription = ({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) => (
  <Text className={cn("font-body text-[13px] text-ink-2", className)} {...props} />
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
  return (
    <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
      {children}
    </Pressable>
  );
}
