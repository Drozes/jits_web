import * as React from "react";
import { Linking, Text, View } from "react-native";
import type { SharePath } from "@/lib/highlight-share";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import { VIEWER_COPY } from "./viewer-copy";
import { ViewerButton } from "./viewer-button";

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
        <ViewerButton
          testID="viewer-share"
          label={primaryPath === "reels" ? VIEWER_COPY.shareInstagram : VIEWER_COPY.shareReel}
          variant="primary"
          onPress={props.onShare}
        />
      ) : null}
      {showSave ? (
        <ViewerButton
          testID="viewer-save"
          label={saving ? VIEWER_COPY.saving : VIEWER_COPY.saveToPhotos}
          variant="outline"
          busy={saving}
          disabled={saving}
          onPress={props.onSave}
        />
      ) : null}
      {showSave && savePermissionDenied ? (
        <View testID="viewer-save-permission" className="gap-2 py-1">
          <Text className="font-body text-[12px] text-ink-2">{VIEWER_COPY.savePermission}</Text>
          <ViewerButton
            testID="viewer-open-settings"
            label={VIEWER_COPY.openSettings}
            variant="text"
            onPress={() => void Linking.openSettings().catch(() => undefined)}
          />
        </View>
      ) : null}
      <ViewerButton
        testID="viewer-improve"
        label={HIGHLIGHT_COPY.improve}
        variant="outline"
        disabled={props.improveDisabled}
        onPress={props.onImprove}
      />
    </View>
  );
}
