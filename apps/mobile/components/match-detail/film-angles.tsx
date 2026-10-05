import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { TRACKING, typeStep } from "@/lib/typography";
import { PlayCircle } from "lucide-react-native";
import { formatVideoDuration } from "@jits/shared/utils";
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { usePalette, TABULAR, type Palette } from "@/lib/theme/palette";
import { angleName, angleText } from "@/components/film-room/angle-switcher";
import { angleTag } from "@jits/shared/utils";
import {
  angleCounts,
  angleOwnerName,
  angleRowA11yLabel,
  angleStatus,
  angleWatchable,
  type AngleTone,
  type LocalAngleJob,
} from "@/lib/video/angle-status";
import { shortName } from "@/lib/film-room/format";

/** "Your recording" reads "Watch your recording"; a name keeps its case. */
export function watchLabel(angleLabel: string): string {
  return angleLabel === "Your recording" ? "Watch your recording" : `Watch ${angleLabel}`;
}

/** The deck's color class for a row's tag (COPY-DECK v2.2 section 0.8). */
export function toneColor(tone: AngleTone, p: Palette): string {
  switch (tone) {
    case "progress":
      return p.text2;
    case "waiting":
      return p.amber;
    case "negative":
      return p.red;
    case "info":
      return p.text3;
    default:
      return p.text2;
  }
}

interface FilmAnglesProps {
  videos: MatchDetailVideo[];
  opponentName: string | null;
  onWatch: (videoId: string) => void;
  /** This phone's job for "Your angle" while it has not landed; it wins over the server row (deck 2a). */
  local?: LocalAngleJob | null;
}

/**
 * FILM: one row per recording, each a Watch for that angle. Keeps the
 * match-loop harness contract of the old cards: testID
 * `match-video-watch-<id>`, label "Watch your recording" / "Watch <Name>'s
 * recording" while it can play. A row that cannot play yet is disabled and
 * labelled with its state (deck 10.2: "{label}, {tag}, {helper}").
 */
export function FilmAngles({ videos, opponentName, onWatch, local = null }: FilmAnglesProps) {
  const p = usePalette();
  // The deck's count is of usable angles: an abandoned reservation is not one.
  const count = videos.filter(angleCounts).length;
  return (
    <View testID="film-angles" style={{ gap: 10 }}>
      <Text accessibilityRole="header" className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-xl"], color: p.text }, TABULAR]}>
        {count > 1 ? `FILM · ${count} ANGLES` : "FILM"}
      </Text>
      <View style={{ borderTopWidth: 1, borderTopColor: p.hairline }}>
        {videos.map((v) => {
          // Nothing plays until the angle has bytes (deck rule 4).
          const processing = !angleWatchable(v);
          const status = angleStatus(v, {
            name: angleOwnerName(v, opponentName, shortName),
            local: v.is_mine ? local : null,
          });
          const tag = angleTag(v.recording_type);
          const label = processing ? angleRowA11yLabel(angleText(v, opponentName), tag, status) : watchLabel(v.angle_label);
          const duration = status.right ?? formatVideoDuration(v.duration_seconds);
          return (
            <Pressable
              key={v.id}
              testID={`match-video-watch-${v.id}`}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled: processing }}
              accessibilityValue={status.percent != null ? { min: 0, max: 100, now: status.percent } : undefined}
              disabled={processing}
              onPress={() => onWatch(v.id)}
              className="flex-row items-center active:opacity-70"
              style={{ minHeight: 60, gap: 12, borderBottomWidth: 1, borderBottomColor: p.hairline, opacity: processing ? 0.7 : 1 }}
            >
              <View className="flex-1 min-w-0" style={{ gap: 5 }}>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text numberOfLines={1} className="font-heading" style={[typeStep("callout"), { flexShrink: 1, letterSpacing: TRACKING.loose, color: p.text }]}>
                    {angleName(v, opponentName)}
                  </Text>
                  {tag ? (
                    <Text testID={`angle-tag-${v.id}`} className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text3 }, TABULAR]}>
                      {tag.toUpperCase()}
                    </Text>
                  ) : null}
                </View>
                <Text numberOfLines={1} className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: toneColor(status.tone, p) }, TABULAR]}>
                  {status.tag.toUpperCase()}
                </Text>
                {status.helper ? (
                  <Text className="font-body" style={[typeStep("small"), { color: p.text2 }]}>
                    {status.helper}
                  </Text>
                ) : null}
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
