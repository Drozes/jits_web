import * as React from "react";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";

/**
 * The device's real safe-area insets, for content that draws over the whole
 * window (RN `Modal` sheets and popovers). Under a pushed screen with the
 * upload strip showing, `StackStripFrame` gives the screens a bottom inset of
 * 0 (the strip pads it); a full-window sheet must not inherit that, or its
 * bottom padding collapses onto the home indicator (jits-n2im.2 review).
 */
const RealInsetsContext = React.createContext<EdgeInsets | null>(null);

export const RealInsetsProvider = RealInsetsContext.Provider;

export function useWindowInsets(): EdgeInsets {
  const real = React.useContext(RealInsetsContext);
  const insets = useSafeAreaInsets();
  return real ?? insets;
}
