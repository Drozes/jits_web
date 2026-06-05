import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";
import { DeltaNumber } from "@/components/ui/elo-system";
import { formatGymMeta } from "@/lib/gym-manager/ladder-format";
import type { GymLadderRow } from "@jits/shared/types/gym-portal";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

interface LadderRowProps {
  row: GymLadderRow;
  /** 1-based ladder position (rendered zero-padded). */
  rank: number;
  /** The signed-in manager's own gym (green left rail + "· You" suffix + bg). */
  isOwn?: boolean;
  /** Rank-1 gym (Signal Red left rail + red rank numeral). */
  isLeader?: boolean;
  onPress?: () => void;
}

/**
 * H9 · One gym ladder row (wireframe `.gym-ladder-row`): a zero-padded rank, the
 * gym name (+ "· You" for the manager's own gym), a mono-caps meta line
 * (city · athletes · matches), and a right-aligned stat block (avg ELO +
 * momentum arrow). The left rail signals the leader (Signal Red) and the
 * manager's own gym (Gain Green), which also tints its background. All numbers
 * use font-mono tabular-nums per the brand rule.
 */
export function LadderRow({ row, rank, isOwn, isLeader, onPress }: LadderRowProps) {
  const Wrapper: typeof Pressable | typeof View = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={row.gymName}
      className={cn(
        "flex-row items-center gap-3 border-l-[3px] px-4 py-3",
        isOwn
          ? "bg-surface-2 border-l-success"
          : isLeader
            ? "bg-surface-3 border-l-cta"
            : "bg-surface-3 border-l-transparent",
        onPress && "active:bg-surface-4",
      )}
    >
      <Text
        className={cn(
          "font-mono-bold text-[16px] text-right",
          isLeader ? "text-cta" : "text-ink-2",
        )}
        style={[{ width: 28 }, TABULAR]}
      >
        {String(rank).padStart(2, "0")}
      </Text>

      <View className="flex-1 min-w-0">
        <Text className="font-heading text-[14px] text-ink" numberOfLines={1}>
          {row.gymName}
          {isOwn ? " · You" : ""}
        </Text>
        <Text
          className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-[2px]"
          numberOfLines={1}
        >
          {formatGymMeta(row)}
        </Text>
      </View>

      <View className="items-end">
        <Text
          className="font-mono-bold text-[20px] text-ink leading-none"
          style={TABULAR}
        >
          {row.avgElo}
        </Text>
        <View className="mt-[2px]">
          <DeltaNumber value={row.momentum} size="s" />
        </View>
      </View>
    </Wrapper>
  );
}
