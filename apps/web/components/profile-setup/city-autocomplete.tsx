"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SearchFn = (query: string, limit?: number) => string[];

interface CityAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Priority suggestions (e.g. active-gym cities) shown before the user types. */
  suggestions?: string[];
  inputStyle: React.CSSProperties;
  placeholder?: string;
}

const LIMIT = 8;

/**
 * Typeahead city field backed by the bundled offline US + Canada dataset
 * (`@jits/shared/geo`), lazy-`import()`ed so the ~21k-entry list is code-split
 * out of the initial signup bundle. Free-text: a user can keep a city we don't
 * list, so it never blocks signup. Mirrors the mobile `CityAutocomplete`.
 */
export function CityAutocomplete({
  value,
  onChange,
  suggestions = [],
  inputStyle,
  placeholder = "Start typing your city",
}: CityAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<SearchFn | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@jits/shared/geo").then((m) => {
      if (!cancelled) setSearch(() => m.searchCities);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const query = value.trim();
  const results = useMemo(() => {
    if (!query) return suggestions.slice(0, LIMIT);
    // searchCities returns [] for queries under 2 chars (a single letter only
    // yields an alphabetical slice), so the dropdown stays empty until the
    // second keystroke; that is intentional, shared with mobile.
    if (search) return search(query, LIMIT);
    const q = query.toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, LIMIT);
  }, [query, search, suggestions]);

  const showDropdown =
    open && results.length > 0 && !(results.length === 1 && results[0] === value);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        autoComplete="off"
        style={inputStyle}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showDropdown && (
        <ul
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            margin: 0,
            padding: 0,
            listStyle: "none",
            maxHeight: 240,
            overflowY: "auto",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-hairline-strong)",
            borderRadius: "var(--radius-xs)",
          }}
        >
          {results.map((city) => (
            <li key={city}>
              <button
                type="button"
                // Select before the input's blur so the click always registers.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(city);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border-hairline)",
                  padding: "var(--space-3) var(--space-4)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--size-body-s)",
                  cursor: "pointer",
                }}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
