import * as React from "react";
import { Linking, Text, View } from "react-native";
import { VIEWER_COPY } from "./viewer-copy";
import { ViewerButton } from "./viewer-button";
import { CaptionCard } from "./caption-card";

interface ShareReturnedProps {
  caption: string;
  clipboard: boolean;
  onCopy: () => void;
  onDone: () => void;
}

/**
 * iOS Reels, after the athlete comes back from Instagram: the handoff replaced
 * the pasteboard, so the caption is offered only now. "Copy caption" is the
 * surface's one red CTA; without the clipboard module the selectable caption
 * and the press-and-hold helper stand in for it.
 */
export function ShareReturned({ caption, clipboard, onCopy, onDone }: ShareReturnedProps) {
  return (
    <View testID="share-returned" className="gap-4">
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-heading text-[16px] text-ink">
          {VIEWER_COPY.returnedTitle}
        </Text>
        <Text className="font-body text-[13px] text-ink-2">{VIEWER_COPY.returnedBody}</Text>
      </View>
      <CaptionCard caption={caption} clipboard={clipboard} showCopyButton={false} onCopy={onCopy} />
      {clipboard ? (
        <ViewerButton testID="share-returned-copy" label={VIEWER_COPY.copyCaption} variant="primary" onPress={onCopy} />
      ) : null}
      <ViewerButton
        testID="share-open-instagram-again"
        label={VIEWER_COPY.openInstagramAgain}
        variant="outline"
        onPress={() => void Linking.openURL("instagram://").catch(() => undefined)}
      />
      <ViewerButton testID="share-done" label={VIEWER_COPY.done} variant="text" onPress={onDone} />
    </View>
  );
}
