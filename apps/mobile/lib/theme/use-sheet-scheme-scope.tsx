import * as React from "react";
import { ForcedSchemeContext } from "./forced-scheme-context";
import { ForceDarkTheme } from "./force-dark-theme";

/**
 * For a gorhom BottomSheetModal: returns a wrapper for the sheet's content
 * that re-applies the scheme the sheet was OPENED under. The modal portals
 * its content to the root `BottomSheetModalProvider`, outside any
 * `ForceDarkTheme` around the opener, so without this the sheet's background
 * (computed at the opener, forced dark) and its content (NativeWind classes
 * and theme hooks, back on the app theme) disagree: dark ink on a dark sheet
 * in the light theme. On a themed screen it is a pass-through.
 */
export function useSheetSchemeScope(): (content: React.ReactNode) => React.ReactNode {
  const forced = React.useContext(ForcedSchemeContext);
  return React.useCallback(
    (content: React.ReactNode) =>
      forced === "dark" ? <ForceDarkTheme fill={false}>{content}</ForceDarkTheme> : content,
    [forced],
  );
}
