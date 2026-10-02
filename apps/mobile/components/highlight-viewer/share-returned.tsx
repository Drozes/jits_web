import * as React from "react";
import { Linking, Text, View } from "react-native";
import { INSTAGRAM_APP_URL, SHARE_COPY } from "@/lib/highlight-share";
import { CaptionCard } from "./caption-card";
import { Button } from "@/components/ui/elo-system/button";

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
        <Text accessibilityRole="header" className="font-heading text-subhead text-ink">
          {SHARE_COPY.returnedTitle}
        </Text>
        <Text className="font-body text-body text-ink-2">{SHARE_COPY.returnedBody}</Text>
      </View>
      <CaptionCard caption={caption} clipboard={clipboard} showCopyButton={false} onCopy={onCopy} />
      {clipboard ? (
        <Button height={44} testID="share-returned-copy" label={SHARE_COPY.copyCaption} variant="primary" onPress={onCopy} />
      ) : null}
      <Button
        height={44}
        testID="share-open-instagram-again"
        label={SHARE_COPY.openInstagramAgain}
        variant="secondary"
        onPress={() => void Linking.openURL(INSTAGRAM_APP_URL).catch(() => undefined)}
      />
      <Button height={44} testID="share-done" label={SHARE_COPY.done} variant="ghost" className="self-center" onPress={onDone} />
    </View>
  );
}
