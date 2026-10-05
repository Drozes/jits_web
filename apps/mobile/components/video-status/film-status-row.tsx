import * as React from "react";
import { Pressable, Text, View, type DimensionValue } from "react-native";
import { AlertTriangle, Check, ChevronRight, Clock, Minus, Pause, Upload } from "lucide-react-native";
import { Button } from "@/components/ui/elo-system/button";
import { toneColor } from "@/components/match-detail/film-angles";
import { usePalette, type Palette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { filmRowA11yLabel, type FilmRow, type FilmRowGlyph } from "@/lib/video/film-status";
import { BEST_ANGLE } from "@/lib/video/video-status-copy";
import { DISCARD_LABEL, TRY_AGAIN_A11Y, TRY_AGAIN_LABEL } from "@/lib/video/use-upload-actions";

/** Every new control is 44 px tall (deck convention 10). */
export const CONTROL_HEIGHT = 44;

const GLYPHS: Record<FilmRowGlyph, typeof Upload> = {
  upload: Upload,
  clock: Clock,
  pause: Pause,
  check: Check,
  alert: AlertTriangle,
  minus: Minus,
};

/** A 2 px progress track (data, not decoration: no elevation). */
export function ProgressTrack({ percent, color, testID }: { percent: number; color: string; testID?: string }) {
  const p = usePalette();
  const w = `${Math.max(0, Math.min(100, Math.round(percent)))}%` as DimensionValue;
  return (
    <View style={{ height: 2, width: "100%", backgroundColor: p.strong }}>
      <View testID={testID} style={{ height: 2, width: w, backgroundColor: color }} />
    </View>
  );
}

/** A small bordered mono caps tag ("TIMEKEEPER", "BEST ANGLE"). */
export function RowChip({ label, testID, p }: { label: string; testID?: string; p: Palette }) {
  return (
    <View
      testID={testID}
      style={{ height: 18, paddingHorizontal: 5, borderRadius: 2, borderWidth: 1, borderColor: p.strong, justifyContent: "center" }}
    >
      <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text2 }, TABULAR]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

interface FilmStatusRowProps {
  row: FilmRow;
  last: boolean;
  onWatch?: (videoId: string) => void;
  /** Harness-compatible label for a ready row ("Watch your recording"). */
  watchLabel?: (row: FilmRow) => string;
  onRetry: () => void;
  onDiscard: () => void;
}

/**
 * One angle in the Film status plate (COPY-DECK v2.2 section 2, boards
 * P-VS-09): glyph, label (+ Timekeeper / Best angle tags), the state tag in
 * its class color, the helper, a 2 px track while uploading, and on the
 * right the percent, the duration and chevron of a ready angle, or the
 * 44 px Try again / Discard. A ready row is the Watch control (the harness
 * keeps `match-video-watch-<id>`); any other row is one accessible element
 * (deck 10.2) with its action beside it.
 */
export function FilmStatusRow({ row, last, onWatch, watchLabel, onRetry, onDiscard }: FilmStatusRowProps) {
  const p = usePalette();
  const color = toneColor(row.tone, p);
  const Glyph = GLYPHS[row.glyph];
  const a11y = filmRowA11yLabel(row, BEST_ANGLE);
  const uploading = row.percent != null && row.tone === "progress";

  const info = (
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
        {uploading ? (
          <View style={{ paddingTop: 3 }}>
            <ProgressTrack percent={row.percent!} color={p.text2} />
          </View>
        ) : null}
      </View>
    </>
  );

  const border = last ? undefined : { borderBottomWidth: 1, borderBottomColor: p.hairline };

  if (row.watchable && row.videoId && onWatch) {
    const id = row.videoId;
    return (
      <Pressable
        testID={`match-video-watch-${id}`}
        accessibilityRole="button"
        accessibilityLabel={[watchLabel ? watchLabel(row) : `Watch ${row.label.toLowerCase()}`, row.best ? BEST_ANGLE : null].filter(Boolean).join(", ")}
        onPress={() => onWatch(id)}
        className="flex-row items-start active:opacity-70"
        style={[{ gap: 10, paddingVertical: 12, minHeight: CONTROL_HEIGHT }, border]}
      >
        {info}
        <View className="flex-row items-center" style={{ gap: 8, alignSelf: "center" }}>
          {row.duration ? (
            <Text className="font-mono-medium" style={[typeStep("small"), { color: p.text2 }, TABULAR]}>
              {row.duration}
            </Text>
          ) : null}
          <ChevronRight size={16} color={p.text2} />
        </View>
      </Pressable>
    );
  }

  return (
    <View testID={`film-row-${row.key}`} className="flex-row items-start" style={[{ gap: 10, paddingVertical: 12 }, border]}>
      <View
        accessible
        accessibilityLabel={a11y}
        accessibilityRole={uploading ? "progressbar" : undefined}
        accessibilityValue={uploading ? { min: 0, max: 100, now: row.percent ?? 0 } : undefined}
        className="flex-1 flex-row items-start"
        style={{ gap: 10 }}
      >
        {info}
        {uploading ? (
          <Text className="font-mono-bold" style={[typeStep("body"), { color: p.text2, alignSelf: "center" }, TABULAR]}>
            {`${row.percent}%`}
          </Text>
        ) : null}
      </View>
      {row.action === "retry" ? (
        <Button
          testID={`film-row-retry-${row.key}`}
          variant="secondary"
          height={CONTROL_HEIGHT}
          label={TRY_AGAIN_LABEL}
          accessibilityLabel={TRY_AGAIN_A11Y}
          onPress={onRetry}
        />
      ) : null}
      {row.action === "discard" ? (
        // A quiet secondary action, never red (deck 12).
        <Button testID={`film-row-discard-${row.key}`} variant="ghost" height={CONTROL_HEIGHT} label={DISCARD_LABEL} onPress={onDiscard} />
      ) : null}
    </View>
  );
}
