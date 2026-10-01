"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readMatchLocationRequired } from "./match-location";

/**
 * `match_location_required`, read once on mount and again each time the tab
 * comes back (the web's "foreground"). Mounted only by `<ArenaBootstrap />`.
 *
 * `ensure()` resolves to the current value, waiting for a read still in
 * flight, so a Go Live tapped during the first read is not treated as "off".
 */
export function useMatchLocationRequired(): {
  required: boolean;
  ensure: () => Promise<boolean>;
  /** The server said it is on (a HINT) although the read said off. */
  markRequired: () => void;
} {
  const [required, setRequired] = useState(false);
  const valueRef = useRef(false);
  const pending = useRef<Promise<boolean> | null>(null);

  const read = useCallback(() => {
    const p = readMatchLocationRequired(createClient()).then((v) => {
      valueRef.current = v;
      setRequired(v);
      if (pending.current === p) pending.current = null;
      return v;
    });
    pending.current = p;
    return p;
  }, []);

  useEffect(() => {
    void read();
    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [read]);

  const ensure = useCallback(
    () => pending.current ?? Promise.resolve(valueRef.current),
    [],
  );
  const markRequired = useCallback(() => {
    valueRef.current = true;
    setRequired(true);
  }, []);

  return { required, ensure, markRequired };
}
