import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { AlertTriangle, Check, Loader, Minus, Pause, Upload } from "lucide-react-native";
import { toneColor } from "@/components/video-status/film-status-bits";
import { CONTROL_HEIGHT, ProgressTrack } from "@/components/video-status/film-status-bits";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { useMatchUpload } from "@/lib/video/match-upload-store";
import { deriveCompactLine, type CompactLineModel } from "@/lib/video/upload-strip";
import { TRY_AGAIN_LABEL, useUploadActions } from "@/lib/video/use-upload-actions";
import { COMPACT_COPY } from "@/lib/video/video-status-copy";

const ICONS: Record<CompactLineModel["kind"], typeof Upload> = {
  preparing: Loader,
  uploading: Upload,
  paused: Pause,
  failed: AlertTriangle,
  terminal: Minus,
  uploaded: Check,
};

/**
 * One line under the End, Result and Confirm steps (jits-n2im.2, COPY-DECK
 * v2.2 section 3, board P-VS-02): this phone's upload for the match, so the
 * athlete never loses sight of it between the final whistle and the
 * verdict (which shows the full Film block). Paused and retryable failures
 * make the whole line a 44 px Try again.
 */
export function MatchUploadLine({ matchId }: { matchId: string }) {
  const p = usePalette();
  const entry = useMatchUpload(matchId);
  const { retry } = useUploadActions(matchId);
  const model = deriveCompactLine(entry, COMPACT_COPY);
  if (!model) return null;
  const color = model.tone === "progress" ? p.text2 : toneColor(model.tone, p);
  const Icon = ICONS[model.kind];

  if (model.retry) {
    return (
      <Pressable
        testID="match-upload-line"
        accessibilityRole="button"
        accessibilityLabel={`${model.text}. ${TRY_AGAIN_LABEL}`}
        onPress={retry}
        className="flex-row items-center active:opacity-70"
        style={{ minHeight: CONTROL_HEIGHT, gap: 7 }}
      >
        <Icon size={12} color={color} />
        <Text className="flex-1 font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color }, TABULAR]}>
          {model.text.toUpperCase()}
        </Text>
        <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text }, TABULAR]}>
          {TRY_AGAIN_LABEL.toUpperCase()}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      testID="match-upload-line"
      accessible
      accessibilityLabel={model.percent != null ? `${model.text}, ${model.percent} percent` : model.text}
      accessibilityRole={model.percent != null ? "progressbar" : undefined}
      accessibilityValue={model.percent != null ? { min: 0, max: 100, now: model.percent } : undefined}
      style={{ gap: 6, paddingVertical: 8 }}
    >
      <View className="flex-row items-center" style={{ gap: 7 }}>
        <Icon size={12} color={model.kind === "uploaded" ? p.text : color} />
        <Text className="flex-1 font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: model.kind === "uploaded" ? p.text : color }, TABULAR]}>
          {model.text.toUpperCase()}
        </Text>
        {model.percent != null ? (
          <Text className="font-mono-bold" style={[typeStep("micro"), { color: p.text2 }, TABULAR]}>
            {`${model.percent}%`}
          </Text>
        ) : null}
      </View>
      {model.percent != null ? <ProgressTrack percent={model.percent} color={p.text2} /> : null}
    </View>
  );
}
