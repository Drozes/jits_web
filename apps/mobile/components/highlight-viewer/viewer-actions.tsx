import * as React from "react";
import { View } from "react-native";
import { Download, Send, SlidersHorizontal } from "lucide-react-native";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import { SHARE_COPY, type SharePath } from "@/lib/highlight-share";
import { ReelRailButton, SettingsRailItem } from "./reel-rail-button";
import { VIEWER_COPY } from "./viewer-copy";

export interface ViewerActionsProps {
  /** `canManageReel`: false (not the athlete's reel) renders no rail at all. */
  canManage: boolean;
  /** `highlight_share_enabled`: false removes Share and Save entirely. */
  shareEnabled: boolean;
  /** From `useHighlightShare`; null hides Share (no share path on this build). */
  primaryPath: SharePath | null;
  canSaveToPhotos: boolean;
  saving: boolean;
  /** The last Save to Photos was refused by the Photos permission: the rail offers Settings (C-V9). */
  savePermissionDenied: boolean;
  improveDisabled: boolean;
  onShare: () => void;
  onSave: () => void;
  onImprove: () => void;
}

/** Save is offered (the permission note under the meta follows the same rule). */
export function showsSave(p: Pick<ViewerActionsProps, "canManage" | "shareEnabled" | "canSaveToPhotos">): boolean {
  return p.canManage && p.shareEnabled && p.canSaveToPhotos;
}

/**
 * The right rail (spec 8.2), top to bottom: Share (the ONE Signal Red CTA,
 * "Share to Instagram" on the Reels path, "Share reel" on the share sheet;
 * absent when sharing is off or no share path exists), Save to Photos, and
 * Improve this reel, with Settings (C-V9) after Save when the Photos
 * permission was refused. A reel that is not the athlete's offers none of them, so
 * no rail renders at all (owner decision 2026-10-06, spec 8.6).
 */
export function ViewerActions(props: ViewerActionsProps) {
  const { canManage, shareEnabled, primaryPath, saving } = props;
  if (!canManage) return null;
  const showShare = shareEnabled && primaryPath !== null;
  return (
    <View testID="viewer-rail" pointerEvents="box-none" className="items-center gap-5">
      {showShare ? (
        <ReelRailButton
          testID="viewer-share"
          variant="primary"
          Icon={Send}
          label={VIEWER_COPY.railShare}
          a11yLabel={primaryPath === "reels" ? SHARE_COPY.shareToInstagram : SHARE_COPY.shareReel}
          onPress={props.onShare}
        />
      ) : null}
      {showsSave(props) ? (
        <ReelRailButton
          testID="viewer-save"
          variant="secondary"
          Icon={Download}
          label={VIEWER_COPY.railSave}
          a11yLabel={saving ? SHARE_COPY.saving : SHARE_COPY.saveToPhotos}
          busy={saving}
          onPress={props.onSave}
        />
      ) : null}
      {showsSave(props) && props.savePermissionDenied ? <SettingsRailItem /> : null}
      <ReelRailButton
        testID="viewer-improve"
        variant="secondary"
        Icon={SlidersHorizontal}
        label={VIEWER_COPY.railImprove}
        a11yLabel={HIGHLIGHT_COPY.improve}
        disabled={props.improveDisabled}
        onPress={props.onImprove}
      />
    </View>
  );
}
