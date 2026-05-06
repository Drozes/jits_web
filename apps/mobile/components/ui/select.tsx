import * as React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../../lib/cn";
import { useThemedTokens } from "../../lib/theme/use-theme";

interface SelectContextValue {
  value: string | undefined;
  setValue: (next: string) => void;
  open: () => void;
  close: () => void;
  registerLabel: (value: string, label: string) => void;
  labels: Record<string, string>;
  visible: boolean;
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
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [visible, setVisible] = React.useState(false);
  const value = controlled ?? internal;

  const setValue = React.useCallback(
    (next: string) => {
      if (controlled === undefined) setInternal(next);
      onValueChange?.(next);
      setVisible(false);
    },
    [controlled, onValueChange],
  );

  const open = React.useCallback(() => setVisible(true), []);
  const close = React.useCallback(() => setVisible(false), []);

  const registerLabel = React.useCallback((v: string, label: string) => {
    setLabels((prev) => (prev[v] === label ? prev : { ...prev, [v]: label }));
  }, []);

  return (
    <SelectContext.Provider value={{ value, setValue, open, close, registerLabel, labels, visible }}>
      {children}
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  className,
  children,
  ...props
}: ViewProps & { className?: string; children?: React.ReactNode }) {
  const { open } = useSelectContext();
  return (
    <Pressable onPress={open}>
      <View
        className={cn(
          "h-10 flex-row items-center justify-between rounded-md border border-input bg-background px-3",
          className,
        )}
        {...props}
      >
        {children}
        <Text className="text-xs text-muted-foreground ml-1">{"\u25BC"}</Text>
      </View>
    </Pressable>
  );
}

export function SelectValue({ placeholder, className }: { placeholder?: string; className?: string }) {
  const { value, labels } = useSelectContext();
  const display = value !== undefined ? (labels[value] ?? value) : undefined;
  return (
    <Text
      className={cn("text-sm flex-1", display ? "text-foreground" : "text-muted-foreground", className)}
      numberOfLines={1}
    >
      {display ?? placeholder ?? ""}
    </Text>
  );
}

export function SelectContent({ children }: { className?: string; children?: React.ReactNode }) {
  const { visible, close } = useSelectContext();
  const tokens = useThemedTokens();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={close}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            paddingBottom: insets.bottom || 16,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: tokens.card,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              maxHeight: "50%",
              paddingTop: 12,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: tokens.mutedForeground,
                alignSelf: "center",
                marginBottom: 8,
              }}
            />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              bounces={false}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              {children}
            </ScrollView>
          </Pressable>
        </View>
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
  }, [value, label]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = ctx.value === value;
  return (
    <Pressable
      onPress={() => ctx.setValue(value)}
      className={cn("px-4 py-3", active && "bg-muted", className)}
    >
      {typeof children === "string" ? (
        <Text className={cn("text-base text-foreground", active && "font-semibold", textClassName)}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
