import * as React from "react";
import { Text, View } from "react-native";
import { formatRelativeDate } from "@jits/shared/utils";
import type { NoMatchVideoParticipant, NoMatchVideoRow } from "@jits/shared/api/queries";
import { DeltaNumber, Plate } from "@/components/ui/elo-system";
import { usePalette } from "@/lib/theme/palette";

function ParticipantLine({ p }: { p: NoMatchVideoParticipant }) {
  const delta = p.elo_delta;
  return (
    <View className="flex-row items-center justify-between">
      <Text numberOfLines={1} className="font-body text-[13px] text-ink-2 flex-1 pr-3">
        {`${p.display_name ?? "Unknown"}${p.outcome ? ` · ${p.outcome}` : ""}`}
      </Text>
      {delta != null ? (
        <DeltaNumber value={delta} size="s" showSign />
      ) : (
        <Text className="font-mono text-[12px] text-ink-3">NO CHANGE</Text>
      )}
    </View>
  );
}

/**
 * The video's verdict NOW, shown when it may differ from this (no-match)
 * verdict: after a re-upload, or when the current value is not `false`.
 * Only for a history-backed row whose video still exists (a deleted video
 * already says so, and an older backend sends none of these fields).
 */
export function nowLine(row: NoMatchVideoRow): string | null {
  if (row.verdict_id == null || !row.video_id) return null;
  if (!row.superseded && row.current_match_detected === false) return null;
  const state =
    row.current_match_detected === true ? "match found" : row.current_match_detected === false ? "no match" : "unknown";
  return `now: ${state}`;
}

/**
 * Verdict-history facts (history-backed backend only; each renders only when
 * present): the video was re-uploaded or deleted since this verdict, and how
 * many verdicts it has had in total and how many said no match.
 */
function VerdictHistory({ row }: { row: NoMatchVideoRow }) {
  const p = usePalette();
  const counts =
    row.verdict_count != null
      ? `${row.no_match_count ?? 0} of ${row.verdict_count} verdict${row.verdict_count === 1 ? "" : "s"}: no match`
      : null;
  const now = nowLine(row);
  if (!row.superseded && !counts && !now) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {row.superseded ? (
        <View testID="no-match-superseded" className="rounded-sm px-2 py-0.5" style={{ borderWidth: 1, borderColor: p.amberRule }}>
          <Text className="font-mono text-[10px] uppercase tracking-caps-l" style={{ color: p.amber }}>
            {row.video_id ? "Re-uploaded since" : "Video deleted since"}
          </Text>
        </View>
      ) : null}
      {now ? (
        <Text testID="no-match-now" className="font-mono text-[11px] text-ink-2">
          {now}
        </Text>
      ) : null}
      {counts ? (
        <Text testID="no-match-counts" className="font-mono tabular-nums text-[11px] text-ink-2">
          {counts}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One no-match video for admin review: what match it was attached to (status
 * and result; every match is ranked, so the type is not shown), who uploaded it, the rating changes it recorded and the
 * model's reason (plain text). Read only.
 */
export function NoMatchVideoRowCard({ row }: { row: NoMatchVideoRow }) {
  const when = row.analyzed_at ?? row.video_created_at;
  const matchLine = [row.match_status, row.match_result].filter(Boolean).join(" · ");
  return (
    <Plate testID={`no-match-row-${row.key}`} className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          {matchLine || "match"}
        </Text>
        {when ? (
          <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">{formatRelativeDate(when)}</Text>
        ) : null}
      </View>
      <Text numberOfLines={1} className="font-heading text-[14px] text-ink">
        {`Uploaded by ${row.uploader_name ?? "unknown"}`}
      </Text>
      <VerdictHistory row={row} />
      {row.participants.map((p) => (
        <ParticipantLine key={p.athlete_id} p={p} />
      ))}
      {row.no_match_reason ? (
        <Text className="font-body text-[13px] text-ink-2 leading-relaxed">{row.no_match_reason}</Text>
      ) : null}
      <Text selectable numberOfLines={1} className="font-mono text-[10px] text-ink-3">
        {`video ${row.video_id ?? "deleted"} · match ${row.match_id}${row.video_status ? ` · ${row.video_status}` : ""}`}
      </Text>
    </Plate>
  );
}
