"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readMatchLocationRequired } from "./match-location";

/**
 * `match_location_required`, read on mount, again each time the tab comes
 * back (the web's "foreground") and each time the Arena is navigated to
 * (`arenaFocused` turning true), so an owner's mid-session flip reaches a
 * running tab. Mounted only by `<ArenaBootstrap />`.
 *
 * `ensure()` resolves to the current value, waiting for a read still in
 * flight, so a Go Live tapped during the first read is not treated as "off".
 *
 * `mark(on)` takes a server answer that proves the flag's state (a HINT
 * `location_required` / `proximity_required` says on; a flag-off reply says
 * off). It wins over any read that was already in flight.
 */
export function useMatchLocationRequired({ arenaFocused = false }: { arenaFocused?: boolean } = {}): {
  required: boolean;
  ensure: () => Promise<boolean>;
  /** A server answer proved the flag on or off, whatever the last read said. */
  mark: (on: boolean) => void;
  /** The server said it is on (a HINT) although the read said off. */
  markRequired: () => void;
} {
  const [required, setRequired] = useState(false);
  const valueRef = useRef(false);
  const pending = useRef<Promise<boolean> | null>(null);
  /** Bumped by every `mark`, so an older read never overrides it. */
  const generation = useRef(0);

  const read = useCallback(() => {
    const gen = generation.current;
    const p = readMatchLocationRequired(createClient()).then((v) => {
      if (pending.current === p) pending.current = null;
      if (gen !== generation.current) return valueRef.current;
      valueRef.current = v;
      setRequired(v);
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

  // Arena focus: the page that shows the flag's variants reads it fresh.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // the mount read above covers the first render
    }
    if (arenaFocused) void read();
  }, [arenaFocused, read]);

  const ensure = useCallback(
    () => pending.current ?? Promise.resolve(valueRef.current),
    [],
  );
  const mark = useCallback((on: boolean) => {
    generation.current += 1;
    pending.current = null;
    valueRef.current = on;
    setRequired(on);
  }, []);
  const markRequired = useCallback(() => mark(true), [mark]);

  return { required, ensure, mark, markRequired };
}
