import * as React from "react";
import { Text, View } from "react-native";
import { SHARE_COPY } from "@/lib/highlight-share";
import { Button } from "@/components/ui/elo-system/button";

interface CaptionCardProps {
  caption: string;
  /** The clipboard native module is in this build: offer the button, else press-and-hold. */
  clipboard: boolean;
  /** Render the outline "Copy caption" here (off when the surface's red CTA copies). */
  showCopyButton: boolean;
  onCopy: () => void;
}

/**
 * "Suggested caption": the text is always selectable, so press-and-hold
 * copies it on a build without the clipboard module (every tier-1 build);
 * the long press also calls `onCopy` there, which records the
 * press-and-hold intent (`caption_copied`, `clipboard: press_and_hold`).
 */
export function CaptionCard({ caption, clipboard, showCopyButton, onCopy }: CaptionCardProps) {
  return (
    <View testID="share-caption" className="gap-2">
      <Text className="font-mono-bold text-micro text-ink-3 uppercase tracking-caps-xl tabular-nums">
        {SHARE_COPY.captionLabel}
      </Text>
      <View className="bg-surface-3 border border-hairline rounded-md px-3 py-3">
        <Text
          testID="share-caption-text"
          selectable
          onLongPress={clipboard ? undefined : onCopy}
          className="font-body text-body text-ink"
        >
          {caption}
        </Text>
      </View>
      {clipboard ? (
        showCopyButton ? (
          <Button height={44} testID="share-copy-caption" label={SHARE_COPY.copyCaption} variant="secondary" onPress={onCopy} />
        ) : null
      ) : (
        <Text testID="share-press-hold" className="font-body text-small text-ink-3">
          {SHARE_COPY.pressAndHoldToCopy}
        </Text>
      )}
    </View>
  );
}
