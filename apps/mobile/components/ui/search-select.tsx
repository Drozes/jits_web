import * as React from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";
import { useThemedTokens } from "@/lib/theme/use-theme";

export interface SearchSelectOption {
  label: string;
  value: string;
}

interface SearchSelectProps {
  /** Current selected value (an option value, or free-text string for cities). */
  value: string;
  /**
   * Label shown in the closed trigger. For option lists pass the selected
   * option's label; for free-text fields (city) leave undefined to show `value`.
   */
  displayLabel?: string;
  onSelect: (value: string) => void;
  /** Header shown at the top of the overlay (e.g. "City", "Home Gym"). */
  title: string;
  /** Closed-trigger placeholder. */
  placeholder: string;
  /** Overlay search-input placeholder. */
  searchPlaceholder?: string;
  /**
   * Compute the rows for a (trimmed, possibly empty) query. Should return
   * already-ranked options. Keep it memoized by the parent so the per-keystroke
   * filter does not re-run needlessly.
   */
  getOptions: (query: string) => SearchSelectOption[];
  /** Allow committing the typed text verbatim as the value (cities). */
  allowFreeText?: boolean;
  /** Hint shown when there is nothing to pick yet (empty query, no results). */
  emptyHint?: string;
  /** Fired when the overlay opens, e.g. to lazy-load a dataset. */
  onOpen?: () => void;
  disabled?: boolean;
}

type Row =
  | { kind: "free"; label: string; value: string }
  | { kind: "option"; label: string; value: string };

/**
 * Single search-overlay primitive shared by every long picker on mobile (the
 * city field and the gym field). Tapping the trigger opens a full-screen Modal
 * with the search input pinned to the top and a results list filling the space
 * between it and the keyboard, the standard mobile autocomplete pattern.
 *
 * This pattern (rather than an inline dropdown) is deliberate: on the React
 * Native New Architecture an inline list opens behind the keyboard at the bottom
 * of a form and nests a second vertical scroller inside the screen scroll. The
 * overlay sidesteps all of that and scales to large option lists via FlatList
 * virtualization.
 *
 * The Modal MUST be `transparent` (not `presentationStyle="fullScreen"`): a
 * full-screen modal presents in a separate native window where the root
 * ThemeProvider's NativeWind CSS variables never cascade in, so every themed
 * class (`bg-surface`, `text-ink`, ...) resolves to nothing and the overlay
 * renders blank. A transparent modal stays in the same window (proven by the
 * DOB picker); we paint the opaque full-screen surface ourselves via an inline
 * token background so it never depends on a className var resolving.
 */
export function SearchSelect({
  value,
  displayLabel,
  onSelect,
  title,
  placeholder,
  searchPlaceholder = "Start typing to search",
  getOptions,
  allowFreeText = false,
  emptyHint = "Start typing to search.",
  onOpen,
  disabled,
}: SearchSelectProps) {
  const tokens = useThemedTokens();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const trimmed = query.trim();
  const rows = React.useMemo<Row[]>(() => {
    const options = getOptions(trimmed);
    const list: Row[] = options.map((o) => ({ kind: "option", ...o }));
    if (
      allowFreeText &&
      trimmed.length > 0 &&
      !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())
    ) {
      list.unshift({ kind: "free", label: trimmed, value: trimmed });
    }
    return list;
  }, [getOptions, trimmed, allowFreeText]);

  const openPicker = () => {
    if (disabled) return;
    setQuery("");
    setOpen(true);
    onOpen?.();
  };
  const close = () => setOpen(false);
  const select = (next: string) => {
    onSelect(next);
    setOpen(false);
  };

  const shown = displayLabel || value;

  return (
    <>
      {/*
       * The press-feedback variant (active:) MUST live on the Pressable, not on a
       * child View. On NativeWind v4 an interaction variant on a nested non-press
       * component makes css-interop attach a press responder to that View, which
       * swallows the touch so the parent Pressable's onPress never fires (the
       * trigger looks dead). This mirrors the working ui/select.tsx trigger.
       */}
      <Pressable
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        className="active:opacity-70"
      >
        <View
          className={cn(
            "bg-surface-3 border border-hairline-strong rounded-xs h-12 px-4 flex-row items-center justify-between",
            disabled && "opacity-50",
          )}
        >
          <Text
            className={cn(
              "text-[14px] font-body flex-1",
              shown ? "text-ink" : "text-ink-3",
            )}
            numberOfLines={1}
          >
            {shown || placeholder}
          </Text>
          <Text className="text-[14px] text-ink-3 ml-2">{"⌕"}</Text>
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
        statusBarTranslucent
      >
        <View
          style={{
            flex: 1,
            paddingTop: insets.top,
            backgroundColor: tokens.bgPrimary,
          }}
        >
          <View className="px-4 pt-2 pb-3 gap-3 border-b border-hairline">
            <View className="flex-row items-center justify-between">
              <Text className="font-heading text-[12px] text-ink uppercase tracking-caps-l">
                {title}
              </Text>
              <Pressable
                onPress={close}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                accessibilityRole="button"
              >
                <Text className="font-heading text-[14px] text-cta uppercase tracking-caps-l">
                  Done
                </Text>
              </Pressable>
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={tokens.textTertiary}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType={allowFreeText ? "done" : "search"}
              onSubmitEditing={() => {
                if (allowFreeText && trimmed) select(trimmed);
              }}
              className="bg-surface-3 border border-hairline-strong rounded-xs px-4 py-3 text-[14px] font-body text-ink"
            />
          </View>

          <FlatList
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              data={rows}
              keyExtractor={(r) => `${r.kind}:${r.value}`}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              // Input is pinned at the top, but the results list runs to the
              // bottom; track the keyboard so the lowest matches stay reachable
              // (iOS-only, no-op elsewhere) since there is no KeyboardAvoidingView.
              automaticallyAdjustKeyboardInsets
              ListEmptyComponent={
                <View className="px-4 py-6">
                  <Text className="font-body text-[13px] text-ink-3">
                    {trimmed.length === 0
                      ? emptyHint
                      : allowFreeText
                        ? "No matches. Press Done to keep what you typed."
                        : "No matches."}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const selected = item.kind === "option" && item.value === value;
                return (
                  <Pressable
                    onPress={() => select(item.value)}
                    accessibilityRole="button"
                    className="px-4 min-h-11 flex-row items-center justify-between border-b border-hairline active:bg-surface-3"
                  >
                    <Text
                      className={cn(
                        "text-[14px] font-body flex-1 py-3",
                        selected ? "text-cta" : "text-ink",
                      )}
                      numberOfLines={1}
                    >
                      {item.kind === "free" ? `Use "${item.label}"` : item.label}
                    </Text>
                    {selected ? (
                      <Text className="text-cta text-[14px] ml-2">{"✓"}</Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
        </View>
      </Modal>
    </>
  );
}
