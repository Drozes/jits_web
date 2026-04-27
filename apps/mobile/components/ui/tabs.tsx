import * as React from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";
import { cn } from "../../lib/cn";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("Tabs subcomponents must be used inside <Tabs>");
  return ctx;
}

export interface TabsProps extends ViewProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children?: React.ReactNode;
}

export function Tabs({ value: controlled, defaultValue, onValueChange, className, children, ...props }: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const value = controlled ?? internal;
  const handleChange = React.useCallback(
    (next: string) => {
      if (controlled === undefined) setInternal(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );
  return (
    <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
      <View className={cn("gap-2", className)} {...props}>
        {children}
      </View>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn(
        "flex-row items-center justify-center rounded-md bg-muted p-1",
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}

export interface TabsTriggerProps {
  value: string;
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

export function TabsTrigger({ value, className, textClassName, children, disabled }: TabsTriggerProps) {
  const ctx = useTabsContext();
  const active = ctx.value === value;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => ctx.onValueChange(value)}
      className={cn(
        "flex-1 items-center justify-center rounded-sm px-3 py-1.5",
        active && "bg-background",
        disabled && "opacity-50",
        className,
      )}
    >
      {typeof children === "string" ? (
        <Text
          className={cn(
            "text-sm font-medium",
            active ? "text-foreground" : "text-muted-foreground",
            textClassName,
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: ViewProps & { value: string; className?: string; children?: React.ReactNode }) {
  const ctx = useTabsContext();
  if (ctx.value !== value) return null;
  return (
    <View className={cn(className)} {...props}>
      {children}
    </View>
  );
}
