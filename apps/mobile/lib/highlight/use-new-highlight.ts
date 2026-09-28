import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { signPosterKey } from "@jits/shared/api/queries";
import {
  getMyHighlights,
  markHighlightSeen,
  type MyHighlightItem,
} from "@jits/shared/api/highlight-share";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import { logHighlightEvent } from "@/lib/highlight/highlight-event";

/** Poster URLs are signed for an hour; Home re-reads far more often. */
const POSTER_TTL_S = 3600;

export interface NewHighlight {
  item: MyHighlightItem;
  posterUrl: string | null;
}

function keyOf(item: MyHighlightItem): string {
  return `${item.highlightId}:${item.version}`;
}

/**
 * The athlete's latest UNSEEN ready reel, for Home's "Your new highlight"
 * card (jr_be spec 014 section 16.6.4). `get_my_highlights` returns no items
 * while `highlight_clips_enabled` is off, so the card follows the clips flag.
 *
 * Re-read on every focus, on return to the foreground, whenever a match
 * screen closes (match exits pop back without refocusing) and on
 * `refresh()` (Home's pull to refresh). Only the newest read writes, none
 * after unmount. A failed read keeps what was on screen and stays quiet.
 * Never navigates by itself.
 */
export function useNewHighlight(athleteId: string | undefined): {
  highlight: NewHighlight | null;
  refresh: () => void;
  dismiss: () => void;
} {
  const [highlight, setHighlight] = React.useState<NewHighlight | null>(null);
  const current = React.useRef<NewHighlight | null>(null);
  const commit = React.useCallback((next: NewHighlight | null) => {
    current.current = next;
    setHighlight(next);
  }, []);
  // Dismissed this process: a read racing the seen-mark must not bring it back.
  const dismissed = React.useRef(new Set<string>());
  const seq = React.useRef(0);
  React.useEffect(
    () => () => {
      seq.current += 1;
    },
    [],
  );

  const refresh = React.useCallback(() => {
    const id = ++seq.current;
    if (!athleteId) {
      if (current.current) commit(null);
      return;
    }
    void (async () => {
      const res = await getMyHighlights(supabase, { limit: 1, unseenOnly: true });
      if (id !== seq.current || !res.ok) return;
      const item = res.data.clipsEnabled ? (res.data.items[0] ?? null) : null;
      if (!item || !item.unseen || dismissed.current.has(keyOf(item))) {
        if (current.current) commit(null);
        return;
      }
      const prev = current.current;
      if (prev && keyOf(prev.item) === keyOf(item) && prev.item.posterPath === item.posterPath) {
        return; // unchanged: keep the signed poster, no re-render
      }
      const posterUrl = await signPosterKey(supabase, item.posterPath, POSTER_TTL_S);
      if (id !== seq.current) return;
      commit({ item, posterUrl });
    })().catch(() => {});
  }, [athleteId, commit]);

  useFocusEffect(refresh);

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const exits = useMatchExitCount();
  const seenExits = React.useRef(exits);
  React.useEffect(() => {
    if (exits === seenExits.current) return;
    seenExits.current = exits;
    refresh();
  }, [exits, refresh]);

  const dismiss = React.useCallback(() => {
    const shown = current.current;
    if (!shown) return;
    const { highlightId, version } = shown.item;
    dismissed.current.add(keyOf(shown.item));
    seq.current += 1; // drop any read in flight
    commit(null);
    void markHighlightSeen(supabase, highlightId, version).catch(() => {});
    logHighlightEvent(highlightId, "home_card_dismissed", { source: "home" });
  }, [commit]);

  return { highlight, refresh, dismiss };
}
