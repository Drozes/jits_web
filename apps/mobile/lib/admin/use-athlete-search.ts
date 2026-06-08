import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import {
  searchAthletes,
  type AthleteSearchResult,
} from "@jits/shared/api/queries";

interface UseAthleteSearchResult {
  query: string;
  setQuery: (q: string) => void;
  results: AthleteSearchResult[];
  isSearching: boolean;
}

const DEBOUNCE_MS = 300;

/**
 * Debounced athlete-name search for the admin roles screen. Each keystroke
 * resets a 300ms timer; the trailing call hits `searchAthletes`. A cancellation
 * flag gates state writes so a stale in-flight search never clobbers newer
 * results (per the mobile async pattern).
 */
export function useAthleteSearch(): UseAthleteSearchResult {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<AthleteSearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      const rows = await searchAthletes(supabase, q);
      if (cancelled) return;
      setResults(rows);
      setIsSearching(false);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return { query, setQuery, results, isSearching };
}
