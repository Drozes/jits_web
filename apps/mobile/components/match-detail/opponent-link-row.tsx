import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Avatar32 } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { MatchParticipant } from "@jits/shared/api/queries";

interface OpponentLinkRowProps {
  opponent: MatchParticipant;
  onPress: () => void;
}

/** Avatar, name and current ELO; the whole row opens the opponent profile. */
export function OpponentLinkRow({ opponent, onPress }: OpponentLinkRowProps) {
  const tokens = useThemedTokens();
  return (
    <Pressable
      testID="match-opponent-row"
      accessibilityRole="button"
      accessibilityLabel={`View ${opponent.display_name}'s profile`}
      onPress={onPress}
      className="flex-row items-center gap-3 bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3 active:bg-surface-4"
    >
      <Avatar32 name={opponent.display_name} photoUrl={opponent.profile_photo_url} />
      <View className="flex-1 min-w-0">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          Opponent
        </Text>
        <Text numberOfLines={1} className="font-heading text-[14px] text-ink">
          {opponent.display_name}
        </Text>
      </View>
      <Text className="font-mono-bold text-[14px] text-ink tabular-nums">
        {opponent.current_elo}
      </Text>
      <View pointerEvents="none">
        <ChevronRight size={16} color={tokens.textSecondary} />
      </View>
    </Pressable>
  );
}
