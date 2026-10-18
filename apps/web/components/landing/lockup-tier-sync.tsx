"use client";

import { useLayoutEffect } from "react";
import { pickTier, type TierList } from "./lockup-tier";
import { prefersReducedMotion } from "./use-prefers-reduced-motion";

/** The intro ends at 2,650 ms (section 6.1); this is the fallback for "done". */
export const INTRO_DONE_FALLBACK_MS = 2700;

function syncTier(hero: HTMLElement) {
  const dpr = window.devicePixelRatio || 1;
  hero.style.setProperty("--dpr", String(dpr));
  const sets = Array.from(hero.querySelectorAll<HTMLElement>("[data-lockup-set]"));
  const set = sets.find((s) => getComputedStyle(s).display !== "none");
  if (!set) return;
  const tiers = JSON.parse(set.dataset.tiers ?? "[]") as TierList;
  if (tiers.length === 0) return;
  const tier = pickTier(set.getBoundingClientRect().width, Number(set.dataset.frac ?? 1), dpr, tiers);
  if (set.dataset.tier !== tier) set.dataset.tier = tier;
}

/**
 * Client side of the hero (P17, P18): re-picks each lockup set's drawing by
 * device px on mount and resize, and marks the intro done so a later tier
 * change never replays it. Renders nothing.
 */
export function LockupTierSync() {
  useLayoutEffect(() => {
    const hero = document.querySelector<HTMLElement>("[data-hero-root]");
    if (!hero) return;
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => syncTier(hero));
    };
    const done = () => {
      hero.dataset.intro = "done";
      clearTimeout(timer);
      hero.removeEventListener("animationend", onAnimationEnd);
    };
    const onAnimationEnd = (e: AnimationEvent) => {
      if ((e.target as Element | null)?.getAttribute?.("data-lk") === "soon") done();
    };
    syncTier(hero);
    window.addEventListener("resize", onResize);
    hero.addEventListener("animationend", onAnimationEnd);
    const timer = setTimeout(done, prefersReducedMotion() ? 0 : INTRO_DONE_FALLBACK_MS);
    return () => {
      window.removeEventListener("resize", onResize);
      hero.removeEventListener("animationend", onAnimationEnd);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  return null;
}
