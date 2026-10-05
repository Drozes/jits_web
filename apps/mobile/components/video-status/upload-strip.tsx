import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle, Check, ChevronRight, Minus, Pause, Upload } from "lucide-react-native";
import { Button } from "@/components/ui/elo-system/button";
import { toneColor } from "@/components/video-status/film-status-bits";
import { matchDetailHref } from "@/lib/match-detail/href";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import type { UploadStripModel } from "@/lib/video/upload-strip";
import { TRY_AGAIN_A11Y, TRY_AGAIN_LABEL, useUploadActions } from "@/lib/video/use-upload-actions";
import { STRIP_COPY } from "@/lib/video/video-status-copy";
import { CONTROL_HEIGHT, ProgressTrack } from "./film-status-bits";

const LEAD = { uploading: Upload, paused: Pause, failed: AlertTriangle, terminal: Minus, uploaded: Check } as const;

/**
 * The app-wide upload strip (jits-n2im.2, boards P-VS-01 / P-VS-02): one
 * row above the tab bar (or above the safe area on a pushed screen), never in
 * the header. The row opens the match (the most recent job); paused and
 * retryable failures carry their own 44 px Try again.
 */
export function UploadStrip({ model, bottomInset = 0 }: { model: UploadStripModel; bottomInset?: number }) {
  const p = usePalette();
  const router = useRouter();
  const { retry } = useUploadActions(model.matchId);
  const color = toneColor(model.tone, p);
  const Lead = LEAD[model.kind];
  const open = () => router.push(matchDetailHref(model.matchId));

  return (
    <View
      testID="upload-strip"
      style={{ backgroundColor: p.panel, borderTopWidth: 1, borderTopColor: p.strong, paddingBottom: bottomInset }}
    >
      <View className="flex-row items-center" style={{ paddingHorizontal: 14, gap: 10 }}>
        <Pressable
          testID="upload-strip-open"
          accessibilityRole="button"
          accessibilityLabel={model.a11y}
          onPress={open}
          className="flex-1 flex-row items-center active:opacity-70"
          style={{ minHeight: CONTROL_HEIGHT, gap: 8, paddingVertical: 6 }}
        >
          <Lead size={14} color={model.kind === "uploading" || model.kind === "uploaded" ? p.text2 : color} />
          <View className="flex-1 min-w-0" style={{ gap: 2 }}>
            <Text numberOfLines={1} className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: model.kind === "uploading" || model.kind === "uploaded" ? p.text : color }, TABULAR]}>
              {model.label.toUpperCase()}
            </Text>
            {model.helper ? (
              <Text numberOfLines={2} className="font-body" style={[typeStep("caption"), { color: p.text2 }]}>
                {model.helper}
              </Text>
            ) : null}
          </View>
          {model.percent != null ? (
            <Text testID="upload-strip-percent" className="font-mono-bold" style={[typeStep("small"), { color: p.text }, TABULAR]}>
              {`${model.percent}%`}
            </Text>
          ) : null}
          {model.details ? (
            <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text }, TABULAR]}>
              {STRIP_COPY.details.toUpperCase()}
            </Text>
          ) : null}
          {model.kind === "uploading" || model.details ? <ChevronRight size={14} color={p.text2} /> : null}
        </Pressable>
        {model.retry ? (
          <Button testID="upload-strip-retry" variant="secondary" height={CONTROL_HEIGHT} label={TRY_AGAIN_LABEL} accessibilityLabel={TRY_AGAIN_A11Y} onPress={retry} />
        ) : null}
      </View>
      {model.kind === "uploading" && model.percent != null ? <ProgressTrack percent={model.percent} color={p.text2} testID="upload-strip-track" /> : null}
    </View>
  );
}
