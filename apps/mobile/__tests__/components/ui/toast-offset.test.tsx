/**
 * Toasts sit below the status bar AND the 56 pt header bar (review round 1,
 * UX defect 6): the library default (40 pt) drew them under the Dynamic
 * Island, over the header wordmark and the status chip they are about.
 *
 * Source: apps/mobile/components/ui/toast.tsx
 */
import * as React from "react";
import { renderHook } from "@testing-library/react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useToastBelowScreenBar, useToastTopOffset } from "@/components/ui/toast";
/** The Arena control bar's height (`MAT_CONTROL_BAR_HEIGHT` in mat-board.tsx). */
const MAT_CONTROL_BAR_HEIGHT = 49;

it("is the top inset plus the header bar plus a 4 pt gap", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SafeAreaInsetsContext.Provider value={{ top: 59, bottom: 34, left: 0, right: 0 }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  );
  const { result } = renderHook(() => useToastTopOffset(), { wrapper });
  expect(result.current).toBe(59 + 56 + 4);
});

it("without a safe area provider it still clears the header bar", () => {
  const { result } = renderHook(() => useToastTopOffset());
  expect(result.current).toBe(60);
});

it("QA C: a focused screen with a sticky bar (the Arena) moves toasts below it, and only while focused", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SafeAreaInsetsContext.Provider value={{ top: 59, bottom: 34, left: 0, right: 0 }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  );
  const offset = renderHook(() => useToastTopOffset(), { wrapper });
  expect(offset.result.current).toBe(119);
  const screenHook = renderHook(({ focused }: { focused: boolean }) => useToastBelowScreenBar(focused, MAT_CONTROL_BAR_HEIGHT), {
    initialProps: { focused: true },
  });
  offset.rerender({});
  expect(offset.result.current).toBe(119 + MAT_CONTROL_BAR_HEIGHT);
  // Blurred (another tab): back to the header placement.
  screenHook.rerender({ focused: false });
  offset.rerender({});
  expect(offset.result.current).toBe(119);
  screenHook.unmount();
});
