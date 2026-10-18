"use client";

import { useEffect, useState } from "react";
import styles from "./hero-ticker.module.css";
import { HeroTickerLine } from "./hero-ticker-line";
import { formatTick, nextTick, type TickSample } from "./ticker-samples";
import { prefersReducedMotion, usePrefersReducedMotion } from "./use-prefers-reduced-motion";

/** Section 7.4: first tick at 4 s, a new one every 2.2 s from 7.2 s. */
export const TICKER_TIMING = { first: 4000, firstRotate: 7200, every: 2200, swap: 240 } as const;

/**
 * The bottom-right sample ticker: decorative (aria-hidden), labelled SAMPLE,
 * empty on the server and the first render, never shown under reduced
 * motion, and paused while the tab is hidden.
 */
export function HeroTicker() {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState<TickSample | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (reduced || prefersReducedMotion()) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
    };
    const clearAll = () => { timers.forEach(clearTimeout); timers.clear(); };
    let current: TickSample | null = null;
    const swap = () => {
      current = nextTick(current);
      setTick(current);
      setLeaving(false);
      later(rotate, TICKER_TIMING.every - TICKER_TIMING.swap);
    };
    const rotate = () => { setLeaving(true); later(swap, TICKER_TIMING.swap); };
    const show = () => {
      current = nextTick(null);
      setTick(current);
      later(rotate, TICKER_TIMING.firstRotate - TICKER_TIMING.first);
    };
    const onVisibility = () => {
      clearAll();
      setLeaving(false);
      if (document.visibilityState === "hidden") return;
      if (current) later(rotate, TICKER_TIMING.every);
      else later(show, TICKER_TIMING.first);
    };
    // A tab opened in the background starts on its first visibilitychange.
    if (document.visibilityState !== "hidden") later(show, TICKER_TIMING.first);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearAll();
      document.removeEventListener("visibilitychange", onVisibility);
      setTick(null);
      setLeaving(false);
    };
  }, [reduced]);

  const live = tick !== null && !reduced;
  return (
    <div aria-hidden="true" data-testid="hero-ticker" className={`${styles.ticker} ${live ? styles.shown : ""}`}>
      {live && (
        <>
          <span className={styles.tag}>SAMPLE</span>
          <HeroTickerLine key={formatTick(tick)} tick={tick} leaving={leaving} />
        </>
      )}
    </div>
  );
}
