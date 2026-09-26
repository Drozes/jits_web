"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MATCH_EXIT_COPY, type MatchExitReason } from "@/lib/match-flow/match-state";

/**
 * A cancelled or voided match has nothing for the wizard to show: say why and
 * leave for the exit. Client-side because a server redirect cannot toast.
 */
export function MatchExitRedirect({
  exitHref,
  reason,
}: {
  exitHref: string;
  reason: MatchExitReason;
}) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    toast.info(MATCH_EXIT_COPY[reason]);
    router.replace(exitHref);
  }, [router, exitHref, reason]);

  return null;
}
