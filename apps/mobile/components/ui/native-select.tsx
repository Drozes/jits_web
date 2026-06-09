import * as React from "react";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";

/**
 * Option picker for the profile-setup wizard (the gym field). A thin wrapper
 * over the shared {@link SearchSelect} overlay so the gym list and the city
 * field use one searchable picker, important now that the gym list is expected
 * to grow large. The list is filtered locally by label; unlike the city field
 * it does NOT allow free text (a gym must be picked from the real list, with
 * "Free agent" folded in as an option by the caller).
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
  /** Header shown atop the search overlay; defaults to `placeholder`. */
  title?: string;
  /** Search-input placeholder inside the overlay. */
  searchPlaceholder?: string;
  disabled?: boolean;
}

export function NativeSelect({
  value,
  onValueChange,
  options,
  placeholder,
  title,
  searchPlaceholder = "Search",
  disabled,
}: NativeSelectProps) {
  const getOptions = React.useCallback(
    (q: string): SearchSelectOption[] => {
      if (!q) return options;
      const ql = q.toLowerCase();
      return options.filter((o) => o.label.toLowerCase().includes(ql));
    },
    [options],
  );

  const displayLabel = options.find((o) => o.value === value)?.label;

  return (
    <SearchSelect
      value={value}
      displayLabel={displayLabel}
      onSelect={onValueChange}
      title={title ?? placeholder}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      getOptions={getOptions}
      emptyHint="No matches."
      disabled={disabled}
    />
  );
}
