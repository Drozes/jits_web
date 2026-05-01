import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { cn } from "../lib/cn";
import { env } from "../lib/env";
import { formatRelativeDate, getInitials } from "@jits/shared/utils";
import { MATCH_OUTCOME, type MatchOutcome, type MatchType } from "@jits/shared/constants";

/** Build a public Supabase storage URL or pass through an absolute URL. */
function profilePhotoSource(profilePhotoUrl: string | null | undefined) {
  if (!profilePhotoUrl) return null;
  if (profilePhotoUrl.startsWith("http")) return profilePhotoUrl;
  try {
    return `${env.supabaseUrl}/storage/v1/object/public/athlete-photos/${profilePhotoUrl}`;
  } catch {
    return null;
  }
}

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

const resultConfig: Record<MatchOutcome, { label: string; variant: "success" | "destructive" | "secondary" }> = {
  [MATCH_OUTCOME.WIN]: { label: "Win", variant: "success" },
  [MATCH_OUTCOME.LOSS]: { label: "Loss", variant: "destructive" },
  [MATCH_OUTCOME.DRAW]: { label: "Draw", variant: "secondary" },
};

function CardInner({ type = "match", opponentName, opponentPhotoUrl, result, status, direction, matchType, eloDelta, date }: MatchCardProps) {
  const photoSrc = profilePhotoSource(opponentPhotoUrl);

  return (
    <CardContent className="flex-row items-center justify-between py-3 px-4">
      <View className="flex-row items-center gap-3 flex-1 min-w-0">
        <Avatar className="border border-border" size="default">
          {photoSrc ? (
            <AvatarImage source={{ uri: photoSrc }} />
          ) : null}
          <AvatarFallback className="bg-primary">
            <Text className="text-xs font-medium text-primary-foreground">{getInitials(opponentName)}</Text>
          </AvatarFallback>
        </Avatar>
        <View className="flex-1 min-w-0 gap-0.5">
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>{opponentName}</Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {formatRelativeDate(date)}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2 ml-2">
        {type === "match" && eloDelta != null ? (
          <Text
            className={cn(
              "text-sm font-semibold tabular-nums",
              eloDelta > 0 && "text-success",
              eloDelta < 0 && "text-destructive",
              eloDelta === 0 && "text-muted-foreground",
            )}
          >
            {eloDelta > 0 ? "+" : ""}{eloDelta}
          </Text>
        ) : null}

        {type === "match" && result ? (
          <Badge variant={resultConfig[result].variant} className="rounded-md">{resultConfig[result].label}</Badge>
        ) : null}

        {type === "challenge" && direction ? (
          <Badge variant={direction === "incoming" ? "secondary" : "outline"} className="rounded-md">
            {direction === "incoming" ? "Incoming" : "Sent"}
          </Badge>
        ) : null}

        {type === "challenge" && !direction ? (
          <Badge variant={status === "Accepted" ? "success" : "outline"} className="rounded-md">
            {status ?? "Pending"}
          </Badge>
        ) : null}
      </View>
    </CardContent>
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
        <Card>
          <CardInner {...props} />
        </Card>
      </Pressable>
    );
  }

  return (
    <Card>
      <CardInner {...props} />
    </Card>
  );
}

