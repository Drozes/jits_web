import * as React from "react";
import { Text, View } from "react-native";
import { VIEWER_COPY } from "./viewer-copy";
import { ViewerButton } from "./viewer-button";

interface CaptionCardProps {
  caption: string;
  /** `expo-clipboard` is in this build: offer the button, else press-and-hold. */
  clipboard: boolean;
  /** Render the outline "Copy caption" here (off when the surface's red CTA copies). */
  showCopyButton: boolean;
  onCopy: () => void;
}

/**
 * "Suggested caption": the text is always selectable, so press-and-hold
 * copies it on a build without the clipboard module (every tier-1 build).
 */
export function CaptionCard({ caption, clipboard, showCopyButton, onCopy }: CaptionCardProps) {
  return (
    <View testID="share-caption" className="gap-2">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {VIEWER_COPY.captionLabel}
      </Text>
      <View className="bg-surface-3 border border-hairline rounded-md px-3 py-3">
        <Text testID="share-caption-text" selectable className="font-body text-[13px] text-ink">
          {caption}
        </Text>
      </View>
      {clipboard ? (
        showCopyButton ? (
          <ViewerButton testID="share-copy-caption" label={VIEWER_COPY.copyCaption} variant="outline" onPress={onCopy} />
        ) : null
      ) : (
        <Text testID="share-press-hold" className="font-body text-[12px] text-ink-3">
          {VIEWER_COPY.pressAndHold}
        </Text>
      )}
    </View>
  );
}
