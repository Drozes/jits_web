import * as React from "react";
import { Modal, Pressable, ScrollView, Text, View, type ViewProps } from "react-native";
import { cn } from "../../lib/cn";

interface SelectContextValue {
  value: string | undefined;
  setValue: (next: string) => void;
  open: boolean;
  setOpen: (next: boolean) => void;
  registerLabel: (value: string, label: string) => void;
  labels: Record<string, string>;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("Select subcomponents must be used inside <Select>");
  return ctx;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
}

export function Select({ value: controlled, defaultValue, onValueChange, children }: SelectProps) {
  const [internal, setInternal] = React.useState<string | undefined>(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const value = controlled ?? internal;
  const setValue = React.useCallback(
    (next: string) => {
      if (controlled === undefined) setInternal(next);
      onValueChange?.(next);
      setOpen(false);
    },
    [controlled, onValueChange],
  );
  const registerLabel = React.useCallback((v: string, label: string) => {
    setLabels((prev) => (prev[v] === label ? prev : { ...prev, [v]: label }));
  }, []);
  return (
    <SelectContext.Provider value={{ value, setValue, open, setOpen, registerLabel, labels }}>
      {children}
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  className,
  children,
  ...props
}: ViewProps & { className?: string; children?: React.ReactNode }) {
  const { setOpen } = useSelectContext();
  return (
    <Pressable onPress={() => setOpen(true)}>
      <View
        className={cn(
          "h-10 flex-row items-center justify-between rounded-md border border-input bg-background px-3",
          className,
        )}
        {...props}
      >
        {children}
      </View>
    </Pressable>
  );
}

export function SelectValue({ placeholder, className }: { placeholder?: string; className?: string }) {
  const { value, labels } = useSelectContext();
  const display = value !== undefined ? (labels[value] ?? value) : undefined;
  return (
    <Text
      className={cn("text-sm", display ? "text-foreground" : "text-muted-foreground", className)}
      numberOfLines={1}
    >
      {display ?? placeholder ?? ""}
    </Text>
  );
}

export function SelectContent({ className, children }: { className?: string; children?: React.ReactNode }) {
  const { open, setOpen } = useSelectContext();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable onPress={() => setOpen(false)} className="flex-1 justify-end bg-black/50">
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            className={cn(
              "max-h-[60%] rounded-t-2xl border border-border bg-card pb-6 pt-2",
              className,
            )}
          >
            <ScrollView>{children}</ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export interface SelectItemProps {
  value: string;
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
}

export function SelectItem({ value, className, textClassName, children }: SelectItemProps) {
  const ctx = useSelectContext();
  const label = typeof children === "string" ? children : value;
  React.useEffect(() => {
    ctx.registerLabel(value, label);
  }, [ctx, value, label]);
  const active = ctx.value === value;
  return (
    <Pressable
      onPress={() => ctx.setValue(value)}
      className={cn("px-4 py-3", active && "bg-muted", className)}
    >
      {typeof children === "string" ? (
        <Text className={cn("text-sm text-foreground", textClassName)}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
