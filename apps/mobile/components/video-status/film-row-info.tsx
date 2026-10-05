import * as React from "react";
import { Text, View } from "react-native";
import { AlertTriangle, Check, Clock, Minus, Pause, Upload } from "lucide-react-native";
import { toneColor } from "@/components/video-status/film-status-bits";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import type { FilmRow, FilmRowGlyph } from "@/lib/video/film-status";
import { BEST_ANGLE } from "@/lib/video/video-status-copy";
import { ProgressTrack, RowChip } from "./film-status-bits";

const GLYPHS: Record<FilmRowGlyph, typeof Upload> = {
  upload: Upload,
  clock: Clock,
  pause: Pause,
  check: Check,
  alert: AlertTriangle,
  minus: Minus,
};

/** True for a row drawn as an upload in progress (track + percent). */
export function rowUploading(row: FilmRow): boolean {
  return row.percent != null && row.tone === "progress";
}

/**
 * The left part of a Film status row (deck section 2, board P-VS-09): the
 * glyph, the label with its Timekeeper / Best angle tags, the state tag in
 * its class color, the helper, and a 2 px track while uploading.
 */
export function FilmRowInfo({ row }: { row: FilmRow }) {
  const p = usePalette();
  const color = toneColor(row.tone, p);
  const Glyph = GLYPHS[row.glyph];
  return (
    <>
      <View style={{ width: 16, paddingTop: 1 }}>
        <Glyph size={16} color={color} />
      </View>
      <View className="flex-1 min-w-0" style={{ gap: 4 }}>
        <View className="flex-row flex-wrap items-center" style={{ gap: 7 }}>
          <Text numberOfLines={1} className="font-heading" style={[typeStep("body"), { flexShrink: 1, letterSpacing: TRACKING.loose, color: p.text }]}>
            {row.label.toUpperCase()}
          </Text>
          {row.roleTag ? <RowChip p={p} label={row.roleTag} testID={`film-row-role-${row.key}`} /> : null}
          {row.best ? <RowChip p={p} label={BEST_ANGLE} testID={`film-row-best-${row.key}`} /> : null}
        </View>
        <Text testID={`film-row-tag-${row.key}`} className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color }, TABULAR]}>
          {row.tag.toUpperCase()}
        </Text>
        {row.helper ? (
          <Text testID={`film-row-helper-${row.key}`} className="font-body" style={[typeStep("small"), { color: p.text2 }]}>
            {row.helper}
          </Text>
        ) : null}
        {rowUploading(row) ? (
          <View style={{ paddingTop: 3 }}>
            <ProgressTrack percent={row.percent!} color={p.text2} />
          </View>
        ) : null}
      </View>
    </>
  );
}
