import * as React from "react";
import { Text, View } from "react-native";
import { SHARE_COPY, type SharePath, type ShareStage, type UseHighlightShareResult } from "@/lib/highlight-share";
import { ViewerButton } from "./viewer-button";
import { CaptionCard } from "./caption-card";
import { CollabTip } from "./collab-tip";
import { ShareProgress } from "./share-progress";
import { ShareReturned } from "./share-returned";
import { ShareFailed } from "./share-failed";

const DOWNLOADING: ReadonlySet<ShareStage> = new Set<ShareStage>(["idle", "preparing", "downloading"]);
const CAN_HAND_OFF: ReadonlySet<ShareStage> = new Set<ShareStage>(["ready", "done"]);

interface ShareSheetBodyProps {
  share: UseHighlightShareResult;
  /** The viewer's handoff (toasts the oversize advisory). */
  onHandoff: (path: SharePath) => void;
  /** iOS + Reels: the handoff replaces the pasteboard, so no caption copy before it. */
  iosReels: boolean;
  onCopy: () => void;
  onDone: () => void;
}

/**
 * The pre-share sheet's content per `useHighlightShare` stage. Every stage
 * has at most ONE Signal Red CTA: "Open Instagram" / "Share" (disabled until
 * the download is ready), "Try again" when failed, "Copy caption" when back
 * from Instagram.
 */
export function ShareSheetBody({ share, onHandoff, iosReels, onCopy, onDone }: ShareSheetBodyProps) {
  const { stage, error, capabilities, activePath } = share;
  // The caption is shown whenever it can travel: off the iOS Reels path, or
  // once the flow is done (e.g. Instagram never came up).
  const showCaption = !iosReels || stage === "done";
  const clipboard = capabilities?.clipboard ?? false;
  if (stage === "returned") {
    return <ShareReturned caption={share.caption} clipboard={clipboard} onCopy={onCopy} onDone={onDone} />;
  }
  return (
    <View testID={`share-stage-${stage}`} className="gap-4">
      <Text accessibilityRole="header" className="font-heading text-[16px] text-ink">
        {SHARE_COPY.sheetTitle}
      </Text>
      {stage === "failed" && error ? (
        <ShareFailed
          error={error}
          onRetry={() => (error.kind === "download" ? share.start() : onHandoff(error.kind === "reels" ? "reels" : "share_sheet"))}
          onFallback={() => onHandoff("share_sheet")}
        />
      ) : (
        <>
          {DOWNLOADING.has(stage) ? <ShareProgress progress={share.progress} /> : null}
          {!showCaption ? (
            <View testID="share-ios-reels-note" className="gap-1">
              <Text className="font-body text-[13px] text-ink">{SHARE_COPY.iosReelsNote[0]}</Text>
              <Text className="font-body text-[12px] text-ink-2">{SHARE_COPY.iosReelsNote[1]}</Text>
            </View>
          ) : (
            <CaptionCard caption={share.caption} clipboard={clipboard} showCopyButton onCopy={onCopy} />
          )}
          <CollabTip tip={share.collabTip} />
          {activePath ? (
            <ViewerButton
              testID="share-handoff"
              label={activePath === "reels" ? SHARE_COPY.openInstagram : SHARE_COPY.share}
              variant="primary"
              disabled={!CAN_HAND_OFF.has(stage)}
              busy={stage === "handing_off"}
              onPress={() => onHandoff(activePath)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
