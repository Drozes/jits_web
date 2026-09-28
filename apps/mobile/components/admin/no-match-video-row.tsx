import * as React from "react";
import { Text, View } from "react-native";
import { formatRelativeDate } from "@jits/shared/utils";
import type { NoMatchVideoParticipant, NoMatchVideoRow } from "@jits/shared/api/queries";
import { DeltaNumber, Plate } from "@/components/ui/elo-system";

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
 * One no-match video for admin review: what match it was attached to (type,
 * status, result), who uploaded it, the rating changes it recorded and the
 * model's reason (plain text). Read only.
 */
export function NoMatchVideoRowCard({ row }: { row: NoMatchVideoRow }) {
  const when = row.analyzed_at ?? row.video_created_at;
  const matchLine = [row.match_type, row.match_status, row.match_result].filter(Boolean).join(" · ");
  return (
    <Plate testID={`no-match-row-${row.video_id}`} className="gap-2">
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
      {row.participants.map((p) => (
        <ParticipantLine key={p.athlete_id} p={p} />
      ))}
      {row.no_match_reason ? (
        <Text className="font-body text-[13px] text-ink-2 leading-relaxed">{row.no_match_reason}</Text>
      ) : null}
      <Text selectable numberOfLines={1} className="font-mono text-[10px] text-ink-3">
        {`video ${row.video_id} · match ${row.match_id}${row.video_status ? ` · ${row.video_status}` : ""}`}
      </Text>
    </Plate>
  );
}
