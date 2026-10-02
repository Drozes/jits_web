import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { TRACKING, typeStep } from "@/lib/typography";
import { PlayCircle } from "lucide-react-native";
import { formatVideoDuration } from "@jits/shared/utils";
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { usePalette, TABULAR, type Palette } from "@/lib/theme/palette";
import { angleName } from "@/components/film-room/angle-switcher";

/** "Your recording" reads "Watch your recording"; a name keeps its case. */
export function watchLabel(angleLabel: string): string {
  return angleLabel === "Your recording" ? "Watch your recording" : `Watch ${angleLabel}`;
}

const PIPELINE = new Set(["processing", "slicing", "analyzing", "merging"]);

function statusOf(v: MatchDetailVideo, p: Palette): { text: string; color: string } {
  if (v.playability === "processing") return { text: v.status === "uploading" ? "UPLOADING" : "PROCESSING", color: p.amber };
  if (v.playability === "failed") return { text: "ANALYSIS FAILED · MAY STILL PLAY", color: p.red };
  if (v.has_analysis) return { text: "BREAKDOWN READY", color: p.text2 };
  if (PIPELINE.has(v.status)) return { text: "ANALYZING", color: p.amber };
  return { text: "READY TO WATCH", color: p.text2 };
}

interface FilmAnglesProps {
  videos: MatchDetailVideo[];
  opponentName: string | null;
  onWatch: (videoId: string) => void;
}

/**
 * FILM: one row per recording, each a Watch for that angle. Keeps the
 * match-loop harness contract of the old cards: testID
 * `match-video-watch-<id>`, label "Watch your recording" / "Watch <Name>'s
 * recording", and a disabled "Processing" while the clip is still uploading.
 */
export function FilmAngles({ videos, opponentName, onWatch }: FilmAnglesProps) {
  const p = usePalette();
  return (
    <View testID="film-angles" style={{ gap: 10 }}>
      <Text accessibilityRole="header" className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-xl"], color: p.text }, TABULAR]}>
        {videos.length > 1 ? "FILM · 2 ANGLES" : "FILM"}
      </Text>
      <View style={{ borderTopWidth: 1, borderTopColor: p.hairline }}>
        {videos.map((v) => {
          const processing = v.playability === "processing";
          const status = statusOf(v, p);
          const duration = formatVideoDuration(v.duration_seconds);
          return (
            <Pressable
              key={v.id}
              testID={`match-video-watch-${v.id}`}
              accessibilityRole="button"
              accessibilityLabel={processing ? "Processing" : watchLabel(v.angle_label)}
              accessibilityState={{ disabled: processing }}
              disabled={processing}
              onPress={() => onWatch(v.id)}
              className="flex-row items-center active:opacity-70"
              style={{ minHeight: 60, gap: 12, borderBottomWidth: 1, borderBottomColor: p.hairline, opacity: processing ? 0.7 : 1 }}
            >
              <View className="flex-1 min-w-0" style={{ gap: 5 }}>
                <Text numberOfLines={1} className="font-heading" style={[typeStep("callout"), { letterSpacing: TRACKING.loose, color: p.text }]}>
                  {angleName(v, opponentName)}
                </Text>
                <Text numberOfLines={1} className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: status.color }, TABULAR]}>
                  {status.text}
                </Text>
              </View>
              {duration ? (
                <Text className="font-mono-medium" style={[typeStep("small"), { color: p.text2 }, TABULAR]}>
                  {duration}
                </Text>
              ) : null}
              {processing ? null : <PlayCircle size={22} color={p.text} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
