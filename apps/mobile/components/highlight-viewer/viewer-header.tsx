import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { darkTokens } from "@/lib/tokens";
import { VIEWER_COPY } from "./viewer-copy";
import { SHARE_COPY } from "@/lib/highlight-share";

/** Close (top left) and the a11y header "Your highlight". */
export function ViewerHeader({ onClose }: { onClose: () => void }) {
  return (
    <View className="flex-row items-center gap-3 px-4" style={{ minHeight: 44 }}>
      <Pressable
        testID="viewer-close"
        accessibilityRole="button"
        accessibilityLabel={VIEWER_COPY.close}
        hitSlop={10}
        onPress={onClose}
        className="p-2 -ml-2 active:opacity-70"
      >
        <X size={22} color={darkTokens.textPrimary} />
      </Pressable>
      <Text accessibilityRole="header" className="font-heading text-[14px] text-ink uppercase tracking-caps">
        {SHARE_COPY.viewerTitle}
      </Text>
    </View>
  );
}
