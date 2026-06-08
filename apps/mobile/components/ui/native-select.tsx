import * as React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Option picker for the profile-setup wizard (gym field). A pressable field
 * shows the current selection label (or a placeholder); tapping opens a modal
 * bottom sheet with a scrollable list of options, tap a row to select.
 *
 * Implemented with plain Views/Pressables rather than the native
 * `@react-native-picker/picker` wheel: that wheel renders blank inside a
 * `Modal` on the React Native New Architecture (Fabric, enabled here via
 * `newArchEnabled`), which broke the gym picker. A custom list is New-Arch-safe.
 *
 * `value === ""` is treated as the unselected/placeholder state; never pass an
 * empty string as a real option value.
 */
interface NativeSelectOption {
  label: string;
  value: string;
}

interface NativeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: NativeSelectOption[];
  placeholder: string;
  disabled?: boolean;
}

const TRIGGER_CLASS =
  "bg-surface-3 border rounded-xs h-12 px-4 flex-row items-center justify-between";

export function NativeSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
}: NativeSelectProps) {
  const tokens = useThemedTokens();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = React.useState(false);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  const open = () => {
    if (!disabled) setVisible(true);
  };
  const select = (next: string) => {
    onValueChange(next);
    setVisible(false);
  };

  return (
    <>
      <Pressable onPress={open} disabled={disabled} accessibilityRole="button">
        <View
          className={cn(
            TRIGGER_CLASS,
            "border-hairline-strong active:opacity-70",
            disabled && "opacity-50",
          )}
        >
          <Text
            className={cn(
              "text-[14px] font-body flex-1",
              selectedLabel ? "text-ink" : "text-ink-3",
            )}
            numberOfLines={1}
          >
            {selectedLabel ?? placeholder}
          </Text>
          <Text className="text-[12px] text-ink-3 ml-1">{"▼"}</Text>
        </View>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
        statusBarTranslucent
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setVisible(false)}
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
                maxHeight: 380,
                overflow: "hidden",
              }}
            >
              <View className="flex-row items-center justify-between px-4 py-3">
                <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
                  {placeholder}
                </Text>
                <Pressable
                  onPress={() => setVisible(false)}
                  hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
                  accessibilityRole="button"
                  className="active:opacity-70"
                >
                  <Text className="font-heading text-[14px] text-cta uppercase tracking-caps-l">
                    Done
                  </Text>
                </Pressable>
              </View>
              <View className="h-px bg-hairline-faint" />
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 320 }}
              >
                {options.map((o) => {
                  const selected = o.value === value;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => select(o.value)}
                      accessibilityRole="button"
                      className="px-4 py-3 flex-row items-center justify-between min-h-11 active:bg-surface-4"
                    >
                      <Text
                        className={cn(
                          "text-[15px] font-body flex-1",
                          selected ? "text-cta" : "text-ink",
                        )}
                        numberOfLines={1}
                      >
                        {o.label}
                      </Text>
                      {selected ? (
                        <Text className="text-cta text-[15px] ml-2">{"✓"}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
