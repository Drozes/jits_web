import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { LivePill } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import {
  formatSessionRowDate,
  formatSessionRowParts,
} from "@/lib/gym-manager/session-datetime";
import type { SessionListItem } from "@jits/shared/types/session";

interface SessionRowProps {
  session: SessionListItem;
  onPress: () => void;
}

/**
 * H2 · One session row in the gym-owner sessions list: a mono day/time block on
 * the left, title + "One-time · May 16" sub-label, and a chevron (or LIVE pill
 * for an active session). Tapping opens the edit sheet. One-time sessions only
 * — recurring schedules are templates, surfaced elsewhere.
 */
export function SessionRow({ session, onPress }: SessionRowProps) {
  const tokens = useThemedTokens();
  const { day, time } = formatSessionRowParts(session.scheduledStart);
  const isActive = session.status === "active";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={session.title ?? "Open Mat"}
      className="flex-row items-center gap-3 bg-surface-3 border border-hairline rounded-md px-4 py-3 active:bg-surface-4"
    >
      <View className="w-14 items-center">
        <Text className="font-mono-bold text-[13px] text-ink uppercase tracking-caps tabular-nums">
          {day}
        </Text>
        <Text className="font-mono text-[11px] text-ink-3 tabular-nums mt-0.5">
          {time}
        </Text>
      </View>

      <View className="flex-1">
        <Text className="font-heading text-[15px] text-ink" numberOfLines={1}>
          {session.title ?? "Open Mat"}
        </Text>
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-0.5">
          {formatSessionRowDate(session.scheduledStart)}
        </Text>
      </View>

      {isActive ? (
        <LivePill label="Live" />
      ) : (
        <View pointerEvents="none">
          <ChevronRight size={18} color={tokens.textTertiary} />
        </View>
      )}
    </Pressable>
  );
}
