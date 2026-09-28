import * as React from "react";
import { StatusBar } from "expo-status-bar";
import { useResolvedColorScheme } from "./use-theme";

/**
 * Status bar content that follows the APP theme (the in-app Light / Dark /
 * System choice), which `style="auto"` does not: auto follows the system
 * appearance only. Mount it on a themed screen; camera and video screens
 * mount their own `<StatusBar style="light" />` above it while they are up.
 * `overMedia` turns it light while a photo hero with a dark top scrim sits
 * under the status bar.
 */
export function ThemedStatusBar({ overMedia = false }: { overMedia?: boolean }) {
  const dark = useResolvedColorScheme() === "dark";
  return <StatusBar style={overMedia || dark ? "light" : "dark"} />;
}
