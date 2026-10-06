import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { ON_MEDIA } from "@/lib/theme/palette";
import { VIEWER_COPY } from "./viewer-copy";
import { SHARE_COPY } from "@/lib/highlight-share";
import { ReelMuteButton } from "./reel-mute-button";

/**
 * Overlaid on the full-bleed reel, under the top safe area: Close (top left,
 * on the on-media scrim), the a11y header "Your highlight", and the mute
 * toggle (top right). Close and the system back gesture are the only ways
 * out; a swipe never closes.
 */
export function ViewerHeader({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="flex-row items-center gap-3 px-4"
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
      <View className="flex-1 flex-row">
        <View className="rounded-xs px-2 py-1" style={{ backgroundColor: ON_MEDIA.badge }}>
          <Text accessibilityRole="header" className="font-heading text-callout uppercase tracking-caps" style={{ color: ON_MEDIA.text }}>
            {SHARE_COPY.viewerTitle}
          </Text>
        </View>
      </View>
      <ReelMuteButton />
    </View>
  );
}
