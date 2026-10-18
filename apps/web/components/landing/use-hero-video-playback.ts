"use client";

import { useEffect, type RefObject } from "react";
import { prefersReducedMotion, usePrefersReducedMotion } from "./use-prefers-reduced-motion";

function wantsSaveData(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return nav.connection?.saveData === true;
}

/**
 * Plays the hero video only while it may move (P12, P25): motion allowed,
 * no save-data request, the tab visible and the hero on screen. Pauses
 * whenever any of those stops holding, resumes when they hold again. A
 * refused play() is ignored, so the poster stays.
 */
export function useHeroVideoPlayback(ref: RefObject<HTMLVideoElement | null>) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let inView = true;
    const update = () => {
      const allowed = !reduced && !prefersReducedMotion() && !wantsSaveData();
      if (allowed && inView && document.visibilityState !== "hidden") {
        if (!video.paused) return;
        video.muted = true; // Safari refuses unmuted autoplay
        video.play()?.catch(() => {});
      } else {
        video.pause();
      }
    };
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => {
            inView = entries.some((e) => e.isIntersecting);
            update();
          })
        : null;
    observer?.observe(video);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [ref, reduced]);
}
