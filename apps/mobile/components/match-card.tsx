import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { OutcomeTag } from "./ui/elo-system";
import { cn } from "../lib/cn";
import { athletePhotoSource } from "../lib/athlete-photo";
import { formatRelativeDate, getInitials } from "@jits/shared/utils";
import { MATCH_OUTCOME, type MatchOutcome, type MatchType } from "@jits/shared/constants";

interface MatchCardProps {
  type?: "match" | "challenge";
  opponentName: string;
  opponentPhotoUrl?: string | null;
  result?: MatchOutcome | null;
  status?: string;
  direction?: "incoming" | "sent";
  matchType?: MatchType;
  eloDelta?: number;
  date: string;
  onPress?: () => void;
}

const outcomeMap: Record<MatchOutcome, "win" | "loss" | "draw"> = {
  [MATCH_OUTCOME.WIN]: "win",
  [MATCH_OUTCOME.LOSS]: "loss",
  [MATCH_OUTCOME.DRAW]: "draw",
};

function ChallengePill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <View
      className={cn(
        "px-2 py-1 border rounded-xs",
        accent ? "border-cta" : "border-hairline-strong",
      )}
    >
      <Text
        className={cn(
          "font-mono-bold text-[10px] uppercase tracking-caps-l",
          accent ? "text-cta" : "text-ink-2",
        )}
      >
        {children}
      </Text>
    </View>
  );
}

function CardInner({ type = "match", opponentName, opponentPhotoUrl, result, status, direction, matchType, eloDelta, date }: MatchCardProps) {
  const photoSrc = athletePhotoSource(opponentPhotoUrl);
  const matchTypeLabel = matchType ? (matchType === "ranked" ? "Ranked" : "Casual") : null;
  const dateText = formatRelativeDate(date);
  const subtitle = matchTypeLabel ? `${dateText} · ${matchTypeLabel}` : dateText;

  return (
    <View className="flex-row items-center justify-between gap-3 bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3">
      <View className="flex-row items-center gap-3 flex-1 min-w-0">
        <View className="h-9 w-9 items-center justify-center rounded-xs bg-surface-4 border border-hairline-strong overflow-hidden">
          {photoSrc ? (
            <Image source={{ uri: photoSrc }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <Text className="font-mono-bold text-ink text-[10px] tracking-caps-l">{getInitials(opponentName)}</Text>
          )}
        </View>
        <View className="flex-1 min-w-0">
          <Text className="font-heading text-[14px] text-ink" numberOfLines={1}>{opponentName}</Text>
          <Text className="font-mono text-[11px] text-ink-3 mt-[2px]" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2 ml-2">
        {type === "match" && eloDelta != null ? (
          <Text
            className={cn(
              "font-mono-bold text-[16px] tabular-nums",
              eloDelta > 0 && "text-positive",
              eloDelta < 0 && "text-negative",
              eloDelta === 0 && "text-ink-3",
            )}
          >
            {eloDelta > 0 ? "+" : ""}{eloDelta}
          </Text>
        ) : null}

        {type === "match" && result ? (
          <OutcomeTag outcome={outcomeMap[result]} />
        ) : null}

        {type === "challenge" && direction ? (
          <ChallengePill accent={direction === "incoming"}>
            {direction === "incoming" ? "Incoming" : "Sent"}
          </ChallengePill>
        ) : null}

        {type === "challenge" && !direction ? (
          <ChallengePill accent={status === "Accepted"}>{status ?? "Pending"}</ChallengePill>
        ) : null}
      </View>
    </View>
  );
}

export function MatchCard(props: MatchCardProps) {
  if (props.onPress) {
    return (
      <Pressable
        onPress={props.onPress}
        accessibilityRole="button"
        className="active:opacity-80"
      >
        <CardInner {...props} />
      </Pressable>
    );
  }

  return <CardInner {...props} />;
}
