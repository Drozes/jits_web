import * as React from "react";
import { Audio } from "expo-av";

/**
 * Reference-counted "play through the iOS silent switch" audio mode.
 *
 * iOS routes audio through the ringer switch by default, so with the silent
 * switch on a match video plays with no sound at all. Every mounted player
 * screen needs the override, and two can be stacked (watch a video, open
 * the match, watch the opponent's video). A plain set-on-mount /
 * reset-on-unmount let the TOP screen's unmount switch it off while the
 * screen underneath was still playing. So the mode is switched on by the
 * first holder and only handed back when the last one lets go.
 */
let holders = 0;

function apply(on: boolean): void {
  void Audio.setAudioModeAsync({ playsInSilentModeIOS: on }).catch(() => undefined);
}

export function acquireSilentModePlayback(): () => void {
  holders += 1;
  if (holders === 1) apply(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) apply(false);
  };
}

/** Holds the silent-switch override for as long as the caller is mounted. */
export function usePlaysInSilentMode(): void {
  React.useEffect(() => acquireSilentModePlayback(), []);
}

/** Test-only reset. Never called from app code. */
export function __resetSilentMode(): void {
  holders = 0;
}
