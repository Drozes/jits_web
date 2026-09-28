import * as React from "react";
import { lockPortrait } from "./orientation";

/**
 * Locks the app to portrait once at launch. iOS already launches portrait
 * (the plugin writes the Info.plist mask), but on Android `orientation:
 * "default"` leaves the activity unlocked, so without this every screen
 * would rotate until the match flow first locked it. A no-op on binaries
 * without the native module. Renders null; placed in `_layout.tsx`.
 */
export function OrientationBootstrap() {
  React.useEffect(() => {
    void lockPortrait();
  }, []);
  return null;
}
