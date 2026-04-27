"use client";

import { useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;

/**
 * Polls /api/version on an interval, on window focus, and when a PWA
 * resumes from the background (visibilitychange). When the server's
 * build ID differs from the client's, shows a toast prompting refresh.
 */
export function useDeploymentCheck(): void {
  const hasPrompted = useRef(false);

  const check = useCallback(async () => {
    if (hasPrompted.current) return;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const { buildId } = (await res.json()) as { buildId: string };
      if (buildId && buildId !== CLIENT_BUILD_ID) {
        hasPrompted.current = true;
        toast("A new version is available", {
          duration: Infinity,
          action: {
            label: "Refresh",
            onClick: () => window.location.reload(),
          },
        });
      }
    } catch {
      // Network error — silently ignore, will retry next interval
    }
  }, []);

  useEffect(() => {
    // Delay first check so it doesn't compete with initial page load
    const timeout = setTimeout(check, 10_000);
    const interval = setInterval(check, POLL_INTERVAL_MS);

    const onFocus = () => check();
    window.addEventListener("focus", onFocus);

    // visibilitychange is the reliable signal for PWAs resuming from background
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [check]);
}
