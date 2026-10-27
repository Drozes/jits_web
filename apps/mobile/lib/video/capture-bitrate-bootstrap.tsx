import * as React from "react";
import { primeCaptureCodecCache } from "./capture-codecs";
import { primeCaptureBitrateOff, readCaptureBitrateOff } from "./use-capture-bitrate";

/**
 * App-start priming for the dynamic capture bitrate (spec 7.3, D6, D9):
 * the iOS codec list and the last kill switch answer from disk (no native
 * call), so a relaunch re-entry into a live match can decide on its first
 * render; then one fresh read of the kill switch. Mounted once in
 * `app/(app)/_layout.tsx`. Renders nothing.
 */
export function CaptureBitrateBootstrap() {
  React.useEffect(() => {
    void primeCaptureCodecCache();
    void primeCaptureBitrateOff().then(() => readCaptureBitrateOff());
  }, []);
  return null;
}
