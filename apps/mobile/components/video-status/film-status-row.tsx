import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Button } from "@/components/ui/elo-system/button";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, typeStep } from "@/lib/typography";
import { filmRowA11yLabel, type FilmRow } from "@/lib/video/film-status";
import { BEST_ANGLE } from "@/lib/video/video-status-copy";
import { DISCARD_LABEL, TRY_AGAIN_A11Y, TRY_AGAIN_LABEL } from "@/lib/video/use-upload-actions";
import { CONTROL_HEIGHT } from "./film-status-bits";
import { FilmRowInfo, rowUploading } from "./film-row-info";

export { CONTROL_HEIGHT, ProgressTrack, RowChip } from "./film-status-bits";

interface FilmStatusRowProps {
  row: FilmRow;
  last: boolean;
  onWatch?: (videoId: string) => void;
  /** Harness-compatible label for a playable row ("Watch your recording"). */
  watchLabel?: (row: FilmRow) => string;
  onRetry: () => void;
  onDiscard: () => void;
}

/**
 * One angle in the Film status plate. A playable row is the Watch control
 * (the harness keeps `match-video-watch-<id>`), with the duration and a
 * chevron; any other row is one accessible element (deck 10.2) with its
 * 44 px Try again or Discard beside it.
 */
export function FilmStatusRow({ row, last, onWatch, watchLabel, onRetry, onDiscard }: FilmStatusRowProps) {
  const p = usePalette();
  const border = last ? undefined : { borderBottomWidth: 1, borderBottomColor: p.hairline };
  const uploading = rowUploading(row);

  if (row.watchable && row.videoId && onWatch) {
    const id = row.videoId;
    // Names keep their case: only "Your angle" reads "Watch your angle".
    const own = row.isMine ? row.label.toLowerCase() : row.label;
    const label = [watchLabel ? watchLabel(row) : `Watch ${own}`, row.best ? BEST_ANGLE : null].filter(Boolean).join(", ");
    return (
      <Pressable
        testID={`match-video-watch-${id}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        // Deck 10.2: the state and helper are spoken too, after the harness's label.
        accessibilityHint={[row.tag, row.helper].filter(Boolean).join(", ")}
        onPress={() => onWatch(id)}
        className="flex-row items-start active:opacity-70"
        style={[{ gap: 10, paddingVertical: 12, minHeight: CONTROL_HEIGHT }, border]}
      >
        <FilmRowInfo row={row} />
        <View className="flex-row items-center" style={{ gap: 8, alignSelf: "center" }}>
          {row.duration ? <Text className="font-mono-medium" style={[typeStep("small"), { color: p.text2 }, TABULAR]}>{row.duration}</Text> : null}
          <ChevronRight size={16} color={p.text2} />
        </View>
      </Pressable>
    );
  }

  return (
    <View testID={`film-row-${row.key}`} className="flex-row items-start" style={[{ gap: 10, paddingVertical: 12 }, border]}>
      <View
        accessible
        accessibilityLabel={filmRowA11yLabel(row, BEST_ANGLE)}
        accessibilityRole={uploading ? "progressbar" : undefined}
        accessibilityValue={uploading ? { min: 0, max: 100, now: row.percent ?? 0 } : undefined}
        className="flex-1 flex-row items-start"
        style={{ gap: 10 }}
      >
        <FilmRowInfo row={row} />
        {uploading ? <Text className="font-mono-bold" style={[typeStep("body"), { color: p.text2, alignSelf: "center" }, TABULAR]}>{`${row.percent}%`}</Text> : null}
      </View>
      {row.action === "retry" ? (
        <Button testID={`film-row-retry-${row.key}`} variant="secondary" height={CONTROL_HEIGHT} label={TRY_AGAIN_LABEL} accessibilityLabel={TRY_AGAIN_A11Y} onPress={onRetry} />
      ) : null}
      {row.action === "discard" ? (
        // A quiet secondary action, never red (deck 12).
        <Button testID={`film-row-discard-${row.key}`} variant="ghost" height={CONTROL_HEIGHT} label={DISCARD_LABEL} onPress={onDiscard} />
      ) : null}
    </View>
  );
}
