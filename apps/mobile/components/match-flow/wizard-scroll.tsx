import * as React from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

type Listener = (y: number) => void;

export interface WizardScroll {
  subscribe: (listener: Listener) => () => void;
}

/**
 * The wizard ScrollView's vertical offset, for steps that react to it (the
 * verdict's status bar over its photo hero). A subscription rather than
 * state, so scrolling re-renders only the listeners whose answer changes.
 */
export const WizardScrollContext = React.createContext<WizardScroll | null>(null);

/** The context value and the ScrollView `onScroll` that feeds it. */
export function useWizardScrollSource(): {
  value: WizardScroll;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const listeners = React.useRef(new Set<Listener>());
  const value = React.useMemo<WizardScroll>(
    () => ({
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
    }),
    [],
  );
  const onScroll = React.useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    listeners.current.forEach((l) => l(y));
  }, []);
  return { value, onScroll };
}

/** True once the wizard has scrolled further than `threshold` (false outside it). */
export function useScrolledPast(threshold: number): boolean {
  const scroll = React.useContext(WizardScrollContext);
  const [past, setPast] = React.useState(false);
  React.useEffect(() => {
    if (!scroll) return;
    return scroll.subscribe((y) => setPast(y > threshold));
  }, [scroll, threshold]);
  return past;
}
