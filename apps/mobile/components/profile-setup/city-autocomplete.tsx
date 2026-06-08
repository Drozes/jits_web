import * as React from "react";
import { Keyboard, Pressable, ScrollView, Text, View } from "react-native";
import { EloTextInput } from "./elo-form-field";

type SearchFn = (query: string, limit?: number) => string[];

interface CityAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * Priority suggestions (e.g. the cities of active gyms) shown before the
   * user types. The full US + Canada dataset powers matches once they start.
   */
  suggestions?: string[];
}

const LIMIT = 8;

/**
 * Typeahead city field for the profile-setup wizard. Backed by the bundled
 * offline US + Canada dataset (`@jits/shared/geo`), lazy-`import()`ed on mount
 * so the ~21k-entry list stays off the cold-start path. The field is free-text:
 * a user can type a city we don't list and still proceed, so it never blocks
 * activation. Results render inline (not an absolute overlay) to avoid the RN
 * ScrollView clipping that overlays hit inside the wizard.
 */
export function CityAutocomplete({
  value,
  onChange,
  placeholder = "Start typing your city",
  suggestions = [],
}: CityAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState<SearchFn | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void import("@jits/shared/geo").then((m) => {
      if (!cancelled) setSearch(() => m.searchCities);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const query = value.trim();
  const results = React.useMemo(() => {
    if (!query) return suggestions.slice(0, LIMIT);
    if (search) return search(query, LIMIT);
    // Dataset still loading: fall back to filtering the priority suggestions.
    const q = query.toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, LIMIT);
  }, [query, search, suggestions]);

  const select = (city: string) => {
    onChange(city);
    setOpen(false);
    Keyboard.dismiss();
  };

  // Hide once the field already holds the single exact match (nothing to pick).
  const showDropdown =
    open && results.length > 0 && !(results.length === 1 && results[0] === value);

  return (
    <View>
      <EloTextInput
        value={value}
        onChangeText={(text) => {
          onChange(text);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {showDropdown ? (
        <View className="mt-1 rounded-xs border border-hairline-strong bg-surface-3 overflow-hidden">
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={{ maxHeight: 224 }}
          >
            {results.map((city, i) => (
              <Pressable
                key={city}
                onPress={() => select(city)}
                accessibilityRole="button"
                className={`px-4 py-3 active:opacity-70 ${
                  i < results.length - 1 ? "border-b border-hairline" : ""
                }`}
              >
                <Text className="font-body text-[14px] text-ink" numberOfLines={1}>
                  {city}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
