import * as React from "react";
import { Pressable } from "react-native";
import { Volume2, VolumeX } from "lucide-react-native";
import { ON_MEDIA } from "@/lib/theme/palette";
import { setReelMuted, useReelMuted } from "@/lib/highlight/reel-prefs";
import { VIEWER_COPY } from "./viewer-copy";

/**
 * The 44 pt speaker toggle (COPY-DECK section 5): the viewer starts with
 * sound unless the athlete muted it last time; the choice persists per
 * install and applies to every pooled player at once.
 */
export function ReelMuteButton() {
  const muted = useReelMuted();
  const Icon = muted ? VolumeX : Volume2;
  return (
    <Pressable
      testID="viewer-mute"
      accessibilityRole="button"
      accessibilityLabel={muted ? VIEWER_COPY.unmute : VIEWER_COPY.mute}
      hitSlop={6}
      onPress={() => setReelMuted(!muted)}
      className="items-center justify-center rounded-md active:opacity-70"
      style={{ width: 44, height: 44, backgroundColor: ON_MEDIA.scrim }}
    >
      <Icon size={20} color={ON_MEDIA.text} />
    </Pressable>
  );
}
