import { Pressable, Text, View } from "react-native";
import { Avatar32, DeltaNumber } from "@/components/ui/elo-system";
import { formatLastActive } from "@/lib/gym-manager/roster-format";
import type { GymRosterRow } from "@jits/shared/types/gym-portal";

interface RosterRowProps {
  row: GymRosterRow;
  /** True for the signed-in manager's own row (renders the "· You" suffix). */
  isSelf?: boolean;
  onPress: () => void;
}

/**
 * H6 · One roster row: circular avatar, name (+ "· You"), a mono meta-line
 * (ELO · last-active · optional PROVISIONAL badge), and a right-aligned stat
 * block (current ELO + most-recent delta). Tapping opens H7 athlete detail.
 * All numbers use font-mono tabular-nums per the brand rule.
 */
export function RosterRow({ row, isSelf, onPress }: RosterRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.displayName}
      className="flex-row items-center gap-3 bg-surface-3 border border-hairline rounded-md px-4 py-3 active:bg-surface-4"
    >
      <Avatar32 name={row.displayName} />

      <View className="flex-1 min-w-0">
        <Text className="font-heading text-[14px] text-ink" numberOfLines={1}>
          {row.displayName}
          {isSelf ? " · You" : ""}
        </Text>
        <View className="flex-row items-center flex-wrap mt-0.5">
          <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
            {row.currentElo} · {formatLastActive(row.lastActive)}
          </Text>
          {row.isProvisional ? (
            <View className="ml-2 px-1.5 py-[1px] border border-hairline-strong rounded-xs">
              <Text className="font-mono-bold text-[9px] text-ink-3 uppercase tracking-caps-l">
                Provisional
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className="items-end">
        <Text
          className="font-mono-bold text-[15px] text-ink"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {row.currentElo}
        </Text>
        <DeltaNumber value={row.eloDelta} size="s" />
      </View>
    </Pressable>
  );
}
