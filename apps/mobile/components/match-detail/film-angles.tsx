import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { PlayCircle } from "lucide-react-native";
import { formatVideoDuration } from "@jits/shared/utils";
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { FILM, TABULAR } from "@/lib/film-room/film-palette";
import { angleName } from "@/components/film-room/angle-switcher";

/** "Your recording" reads "Watch your recording"; a name keeps its case. */
export function watchLabel(angleLabel: string): string {
  return angleLabel === "Your recording" ? "Watch your recording" : `Watch ${angleLabel}`;
}

const PIPELINE = new Set(["processing", "slicing", "analyzing", "merging"]);

function statusOf(v: MatchDetailVideo): { text: string; color: string } {
  if (v.playability === "processing") return { text: v.status === "uploading" ? "UPLOADING" : "PROCESSING", color: FILM.amber };
  if (v.playability === "failed") return { text: "ANALYSIS FAILED · MAY STILL PLAY", color: FILM.redText };
  if (v.has_analysis) return { text: "BREAKDOWN READY", color: FILM.text2 };
  if (PIPELINE.has(v.status)) return { text: "ANALYZING", color: FILM.amber };
  return { text: "READY TO WATCH", color: FILM.text2 };
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
  return (
    <View testID="film-angles" style={{ gap: 10 }}>
      <Text accessibilityRole="header" className="font-mono-bold" style={{ fontSize: 10, letterSpacing: 2.52, color: FILM.text }}>
        {videos.length > 1 ? "FILM · 2 ANGLES" : "FILM"}
      </Text>
      <View style={{ borderTopWidth: 1, borderTopColor: FILM.hairline }}>
        {videos.map((v) => {
          const processing = v.playability === "processing";
          const status = statusOf(v);
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
              style={{ minHeight: 60, gap: 12, borderBottomWidth: 1, borderBottomColor: FILM.hairline, opacity: processing ? 0.7 : 1 }}
            >
              <View className="flex-1 min-w-0" style={{ gap: 5 }}>
                <Text numberOfLines={1} className="font-heading" style={{ fontSize: 14, letterSpacing: 0.4, color: FILM.text }}>
                  {angleName(v, opponentName)}
                </Text>
                <Text numberOfLines={1} className="font-mono-bold" style={{ fontSize: 9, letterSpacing: 1.6, color: status.color }}>
                  {status.text}
                </Text>
              </View>
              {duration ? (
                <Text className="font-mono-medium" style={[{ fontSize: 12, color: FILM.text2 }, TABULAR]}>
                  {duration}
                </Text>
              ) : null}
              {processing ? null : <PlayCircle size={22} color={FILM.text} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
