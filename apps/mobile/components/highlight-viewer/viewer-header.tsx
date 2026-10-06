import * as React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { ON_MEDIA } from "@/lib/theme/palette";
import { VIEWER_COPY } from "./viewer-copy";
import { ReelMuteButton } from "./reel-mute-button";

/**
 * Overlaid on the full-bleed reel under the top safe area (spec 8.2): Close
 * (top left, C-V4) and the mute toggle (top right, C-V3), nothing else. The
 * row itself passes touches through, so a tap beside the controls still
 * reaches the video (tap to pause). Close and the system back gesture are
 * the only ways out; a swipe never closes.
 */
export function ViewerHeader({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="flex-row items-center justify-between px-4"
      style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 4, minHeight: 44 }}
    >
      <Pressable
        testID="viewer-close"
        accessibilityRole="button"
        accessibilityLabel={VIEWER_COPY.close}
        hitSlop={6}
        onPress={onClose}
        className="items-center justify-center rounded-md active:opacity-70"
        style={{ width: 44, height: 44, backgroundColor: ON_MEDIA.scrim }}
      >
        <X size={22} color={ON_MEDIA.text} />
      </Pressable>
      <ReelMuteButton />
    </View>
  );
}
