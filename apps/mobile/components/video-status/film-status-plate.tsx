import * as React from "react";
import { View } from "react-native";
import { usePalette } from "@/lib/theme/palette";
import type { FilmRow, FilmStatusView } from "@/lib/video/film-status";
import { useFilmStatusAnnouncements } from "@/lib/video/use-film-status";
import { useUploadActions } from "@/lib/video/use-upload-actions";
import { PLATE_TITLE } from "@/lib/video/video-status-copy";
import { FilmStatusRow } from "./film-status-row";
import { FilmStatusHeader } from "./film-status-header";

interface FilmStatusPlateProps {
  matchId: string;
  view: FilmStatusView;
  /** "detail" (match detail, canonical) or "verdict" (the verdict's Film block). Same component, same strings. */
  variant?: "detail" | "verdict";
  onWatch?: (videoId: string) => void;
  watchLabel?: (row: FilmRow) => string;
  testID?: string;
}

/**
 * The Film status plate (jits-n2im.25, COPY-DECK v2.2 sections 2 and 4,
 * boards P-VS-03 to P-VS-09): the one source of truth for a match's film.
 * Title and phase tag (the countdown while waiting), the phase line and
 * helper, then one row per angle (yours, the other competitor, the
 * timekeeper). The verdict renders the same component titled "Film".
 *
 * No live region (deck 10.1): state changes are announced by
 * `useFilmStatusAnnouncements`, from the focused screen only.
 */
export function FilmStatusPlate({ matchId, view, variant = "detail", onWatch, watchLabel, testID = "film-status" }: FilmStatusPlateProps) {
  const p = usePalette();
  const { retry, discard } = useUploadActions(matchId);
  useFilmStatusAnnouncements(view);
  const title = PLATE_TITLE[variant];

  return (
    <View
      testID={testID}
      style={{ backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: 4, paddingTop: 14, paddingHorizontal: 14, paddingBottom: view.rows.length > 0 ? 2 : 12, gap: 8 }}
    >
      <FilmStatusHeader view={view} title={title} testID={testID} />
      {view.rows.length > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: p.hairline, marginTop: 4 }}>
          {view.rows.map((row, i) => (
            <FilmStatusRow
              key={row.key}
              row={row}
              last={i === view.rows.length - 1}
              onWatch={onWatch}
              watchLabel={watchLabel}
              onRetry={retry}
              onDiscard={discard}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
