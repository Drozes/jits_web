import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import { retryHighlightRender } from "@jits/shared/api/highlights";
import { highlightErrorCopy } from "./highlight-copy";

/**
 * "Try again" on a failed reel with no playable version: re-arms the render
 * with the same segments (`retryHighlightRender`), then re-reads progress so
 * the card moves to `rendering`. Errors toast the spec 9.5 copy.
 */
export function useHighlightRetry(highlightId: string | null, onRetried: () => void) {
  const [busy, setBusy] = React.useState(false);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const retry = React.useCallback(async () => {
    if (!highlightId || busy) return;
    setBusy(true);
    const result = await retryHighlightRender(supabase, highlightId);
    if (!mountedRef.current) return;
    setBusy(false);
    if (!result.ok) toast.error(highlightErrorCopy(result.error));
    onRetried();
  }, [highlightId, busy, onRetried]);

  return { busy, retry };
}
