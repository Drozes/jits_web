import * as React from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Native option picker built on `@react-native-picker/picker`. A pressable
 * field shows the current selection label (or a placeholder); tapping opens a
 * modal bottom container holding the native picker wheel (iOS) / control
 * (Android) with a "Done" button. Replaces the custom bottom-sheet `Select`
 * for the gym and city fields in the profile-setup wizard.
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
  // The picker wheel commits continuously; keep a draft so "Done" applies and
  // tapping the backdrop without confirming does not mutate the form. Seeded on
  // open from the current value, so an unselected field (value "") keeps the
  // placeholder row highlighted and "Done" without scrolling stays unselected.
  const [draft, setDraft] = React.useState(value);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  const open = () => {
    if (disabled) return;
    setDraft(value);
    setVisible(true);
  };
  const confirm = () => {
    // Always propagate the draft (including "" to clear) so validation re-blocks
    // when the user confirms without making a real selection.
    onValueChange(draft);
    setVisible(false);
  };
  const cancel = () => setVisible(false);

  return (
    <>
      <Pressable onPress={open} disabled={disabled}>
        <View
          className={cn(
            TRIGGER_CLASS,
            "border-hairline-strong",
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
        onRequestClose={cancel}
        statusBarTranslucent
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={cancel}
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
                paddingTop: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                }}
              >
                <Pressable onPress={confirm} hitSlop={8} accessibilityRole="button">
                  <Text className="font-heading text-[14px] text-cta uppercase tracking-caps-l">
                    Done
                  </Text>
                </Pressable>
              </View>
              <Picker
                selectedValue={draft}
                onValueChange={(v) => setDraft(String(v))}
                itemStyle={
                  Platform.OS === "ios"
                    ? { color: tokens.cardForeground }
                    : undefined
                }
              >
                <Picker.Item
                  label={placeholder}
                  value=""
                  color={tokens.cardForeground}
                />
                {options.map((o) => (
                  <Picker.Item
                    key={o.value}
                    label={o.label}
                    value={o.value}
                    color={tokens.cardForeground}
                  />
                ))}
              </Picker>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
