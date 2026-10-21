import * as React from "react";
import { Text, View } from "react-native";
import type { TimekeeperCandidate } from "@jits/shared/api/timekeeper";
import { Avatar32, LivePill } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { usePalette } from "@/lib/theme/palette";
import { SHIPPED_COPY, TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { Mono } from "../fight/fight-ui";

export interface CandidateRowProps {
  candidate: TimekeeperCandidate;
  /** TK-P5b, when they are only the other athlete's friend. */
  caption: string | null;
  /** The Ask was refused because they turned busy since the list loaded (TK-P8, TK-P9). */
  busyAs: "timekeeper" | "competitor" | null;
  /** This row's Ask is in flight. */
  asking: boolean;
  /** No Ask now: a request is open, or another Ask is in flight. */
  disabled: boolean;
  onAsk: (candidate: TimekeeperCandidate) => void;
}

/**
 * One person the athletes may ask (board P-TK-B2): the shipped Friends row
 * (`app/(app)/friends.tsx`: avatar, full name, the rating as
 * `SHIPPED_COPY.elo`, the LIVE pill while they are on the mat) with the
 * friend caption and an `Ask` action, a
 * neutral outline (the picker has no Signal Red CTA: every row asks). A row
 * that turned busy shows why instead of `Ask`, in the attention token.
 */
export function CandidateRow({ candidate, caption, busyAs, asking, disabled, onAsk }: CandidateRowProps) {
  const p = usePalette();
  const c = candidate;
  return (
    <View testID={`crew-candidate-${c.athleteId}`} className="flex-row items-center gap-3 rounded-sm bg-surface-2 px-3 py-3">
      <Avatar32 name={c.displayName} photoUrl={c.avatarUrl} />
      <View className="flex-1">
        <Text className="font-heading text-callout text-ink" numberOfLines={1}>
          {c.displayName}
        </Text>
        {c.currentElo != null ? (
          <Text className="font-mono text-small tabular-nums text-ink-3">{SHIPPED_COPY.elo(c.currentElo)}</Text>
        ) : null}
        {caption ? (
          <Text testID={`crew-candidate-caption-${c.athleteId}`} className="font-body text-small text-ink-3" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
      {c.isLive ? <LivePill /> : null}
      {busyAs ? (
        <View style={{ maxWidth: 120 }} testID={`crew-candidate-busy-${c.athleteId}`}>
          <Mono bold spacing="caps" color={p.amber}>
            {busyAs === "competitor" ? C["TK-P9"] : C["TK-P8"]}
          </Mono>
        </View>
      ) : (
        <Button
          testID={`crew-ask-${c.athleteId}`}
          variant="secondary"
          height={32}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          label={C["TK-P7"].text}
          accessibilityLabel={C["TK-P7"].a11y(c.displayName)}
          busy={asking}
          disabled={disabled && !asking}
          onPress={() => onAsk(c)}
        />
      )}
    </View>
  );
}
