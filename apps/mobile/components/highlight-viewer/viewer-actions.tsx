import * as React from "react";
import { Linking, Text, View } from "react-native";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import { SHARE_COPY, type SharePath } from "@/lib/highlight-share";
import { Button } from "@/components/ui/elo-system/button";

export interface ViewerActionsProps {
  /** `highlight_share_enabled`: false removes Share and Save entirely. */
  shareEnabled: boolean;
  /** From `useHighlightShare`; null hides Share (no share path on this build). */
  primaryPath: SharePath | null;
  canSaveToPhotos: boolean;
  saving: boolean;
  savePermissionDenied: boolean;
  improveDisabled: boolean;
  onShare: () => void;
  onSave: () => void;
  onImprove: () => void;
}

/**
 * The bottom action column. The ONE Signal Red CTA is Share ("Share to
 * Instagram" on the Reels path, "Share reel" on the share sheet), absent when
 * sharing is off or no share path exists; Save to Photos and Improve this
 * reel are outlines.
 */
export function ViewerActions(props: ViewerActionsProps) {
  const { shareEnabled, primaryPath, canSaveToPhotos, saving, savePermissionDenied } = props;
  const showShare = shareEnabled && primaryPath !== null;
  const showSave = shareEnabled && canSaveToPhotos;
  return (
    <View className="gap-2">
      {showShare ? (
        <Button
          height={44}
          testID="viewer-share"
          label={primaryPath === "reels" ? SHARE_COPY.shareToInstagram : SHARE_COPY.shareReel}
          variant="primary"
          onPress={props.onShare}
        />
      ) : null}
      {showSave ? (
        <Button
          height={44}
          testID="viewer-save"
          label={saving ? SHARE_COPY.saving : SHARE_COPY.saveToPhotos}
          variant="secondary"
          busy={saving}
          onPress={props.onSave}
        />
      ) : null}
      {showSave && savePermissionDenied ? (
        <View testID="viewer-save-permission" className="gap-2 py-1">
          <Text className="font-body text-[12px] text-ink-2">{SHARE_COPY.savePermissionDenied}</Text>
          <Button
            height={44}
            testID="viewer-open-settings"
            label={SHARE_COPY.openSettings}
            variant="ghost"
            className="self-center"
            onPress={() => void Linking.openSettings().catch(() => undefined)}
          />
        </View>
      ) : null}
      <Button
        height={44}
        testID="viewer-improve"
        label={HIGHLIGHT_COPY.improve}
        variant="secondary"
        disabled={props.improveDisabled}
        onPress={props.onImprove}
      />
    </View>
  );
}
