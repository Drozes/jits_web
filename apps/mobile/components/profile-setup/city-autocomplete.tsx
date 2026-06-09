import * as React from "react";
import {
  SearchSelect,
  type SearchSelectOption,
} from "@/components/ui/search-select";

type SearchFn = (query: string, limit?: number) => string[];

interface CityAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * Priority suggestions (e.g. the cities of active gyms) shown before the user
   * types. The full US + Canada dataset powers matches once they start typing.
   */
  suggestions?: string[];
}

const LIMIT = 30;

/**
 * City field for the profile-setup wizard. A thin wrapper over the shared
 * {@link SearchSelect} overlay: it lazy-loads the bundled offline US + Canada
 * dataset (`@jits/shared/geo`) on first open so the ~18k-entry list stays off
 * the cold-start path, and allows free text so a user can commit a city we do
 * not list (the field must never block activation).
 */
export function CityAutocomplete({
  value,
  onChange,
  placeholder = "Select your city",
  suggestions = [],
}: CityAutocompleteProps) {
  const [search, setSearch] = React.useState<SearchFn | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => () => void (mounted.current = false), []);

  const loadDataset = React.useCallback(() => {
    if (search) return;
    void import("@jits/shared/geo").then((m) => {
      if (mounted.current) setSearch(() => m.searchCities);
    });
  }, [search]);

  const getOptions = React.useCallback(
    (q: string): SearchSelectOption[] => {
      const labels =
        q.length < 2
          ? suggestions.slice(0, LIMIT)
          : search
            ? search(q, LIMIT)
            : // Dataset still loading: filter the priority suggestions for now.
              suggestions
                .filter((s) => s.toLowerCase().includes(q.toLowerCase()))
                .slice(0, LIMIT);
      return labels.map((l) => ({ label: l, value: l }));
    },
    [search, suggestions],
  );

  return (
    <SearchSelect
      value={value}
      onSelect={onChange}
      title="City"
      placeholder={placeholder}
      searchPlaceholder="Start typing your city"
      getOptions={getOptions}
      allowFreeText
      emptyHint="Start typing to search US and Canada cities."
      onOpen={loadDataset}
    />
  );
}
