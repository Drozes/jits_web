import { useMemo } from "react";
import { ReduceMotion, type WithTimingConfig } from "react-native-reanimated";
import { useReduceMotion } from "@/lib/match-flow/use-reduce-motion";
import { duration, easing } from "./tokens";

/**
 * "Sheet / modal present" (DESIGN.md, Motion registry, Reactive tier): the
 * one way a modal surface appears and leaves. Every RN `Modal` takes its
 * `animationType` from `useModalAnimation()` and every gorhom sheet takes its
 * `animationConfigs` from `useSheetAnimationConfigs()` (already wired into
 * `useSheetChrome()` in `components/ui/sheet.tsx`). Under Reduce Motion the
 * surface appears and disappears in place: no slide, no fade.
 */

/** How a modal surface presents: bottom sheets slide, centered dialogs fade. */
export type ModalPresentation = "slide" | "fade";

/** The RN `Modal` `animationType` for a presentation and the Reduce Motion setting. */
export function modalAnimationFor(
  presentation: ModalPresentation,
  reduceMotion: boolean,
): ModalPresentation | "none" {
  return reduceMotion ? "none" : presentation;
}

/**
 * The RN `Modal` `animationType`: `presentation` normally, `"none"` under
 * Reduce Motion. Use `"slide"` for a bottom sheet or full-screen picker and
 * `"fade"` for a centered dialog.
 */
export function useModalAnimation(presentation: ModalPresentation): ModalPresentation | "none" {
  return modalAnimationFor(presentation, useReduceMotion());
}

/**
 * gorhom `animationConfigs`: a `fast` (240ms) brand ease-out timing for the
 * present, the dismiss and the snap after a drag. Under Reduce Motion it is
 * `ReduceMotion.Always`, so the sheet lands at its snap point at once (the
 * same end state Reanimated's `ReduceMotion.System` default already gave).
 */
export function sheetAnimationConfigsFor(reduceMotion: boolean): WithTimingConfig {
  return {
    duration: duration.fast,
    easing: easing.brandOut,
    reduceMotion: reduceMotion ? ReduceMotion.Always : ReduceMotion.System,
  };
}

/** `sheetAnimationConfigsFor` bound to the live Reduce Motion setting. */
export function useSheetAnimationConfigs(): WithTimingConfig {
  const reduceMotion = useReduceMotion();
  return useMemo(() => sheetAnimationConfigsFor(reduceMotion), [reduceMotion]);
}
