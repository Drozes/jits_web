import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { markHighlightSeen } from "@jits/shared/api/highlight-share";
import { notifyHighlightsChanged } from "./highlight-store";

/**
 * Marks the athlete's reel seen once per version while `highlightId` and
 * `version` are both set (jr_be spec 014 section 16.6.2, the match-detail
 * ready card): watching it there clears the Home card and the bell's unread
 * state. Fire and forget; a failure only leaves the item unread. Once the
 * mark lands, the bell and the Home card are told to re-read.
 */
export function useMarkHighlightSeen(highlightId: string | null, version: number | null): void {
  const marked = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!highlightId || version == null || version < 1) return;
    const key = `${highlightId}:${version}`;
    if (marked.current.has(key)) return;
    marked.current.add(key);
    void markHighlightSeen(supabase, highlightId, version)
      .then((res) => {
        if (res.ok) notifyHighlightsChanged();
      })
      .catch(() => {});
  }, [highlightId, version]);
}
