import * as React from "react";
import { Text, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  type AthleteStats,
  type Filter,
  type HeadToHeadMatch,
  StatRow,
  FilterPillRow,
  computeH2H,
} from "./compare-stats-parts";

export type { HeadToHeadMatch } from "./compare-stats-parts";

interface CompareStatsModalProps {
  currentAthlete: AthleteStats;
  competitor: AthleteStats;
  headToHead: HeadToHeadMatch[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompareStatsModal({
  currentAthlete,
  competitor,
  headToHead,
  open,
  onOpenChange,
}: CompareStatsModalProps) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const myStats = React.useMemo(() => {
    if (filter === "all") {
      return {
        wins: currentAthlete.wins,
        losses: currentAthlete.losses,
        draws: currentAthlete.draws,
        winRate: currentAthlete.winRate,
      };
    }
    return computeH2H(headToHead, filter);
  }, [filter, currentAthlete, headToHead]);

  const theirStats = React.useMemo(() => {
    if (filter === "all") {
      return {
        wins: competitor.wins,
        losses: competitor.losses,
        draws: competitor.draws,
        winRate: competitor.winRate,
      };
    }
    const h2h = computeH2H(headToHead, filter);
    return {
      wins: h2h.losses,
      losses: h2h.wins,
      draws: h2h.draws,
      winRate: h2h.winRate > 0 ? 100 - h2h.winRate : 0,
    };
  }, [filter, competitor, headToHead]);

  const isFiltered = filter !== "all";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-center">Compare Stats</DialogTitle>
        </DialogHeader>

        <View className="flex-row items-center mb-2 px-2">
          <Text className="flex-1 text-center font-heading text-[14px] text-ink" numberOfLines={1}>
            {currentAthlete.displayName}
          </Text>
          <Text className="flex-1 text-center font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">vs</Text>
          <Text className="flex-1 text-center font-heading text-[14px] text-ink" numberOfLines={1}>
            {competitor.displayName}
          </Text>
        </View>

        <View>
          {!isFiltered ? (
            <StatRow label="ELO" left={currentAthlete.elo} right={competitor.elo} />
          ) : null}
          <StatRow label="Wins" left={myStats.wins} right={theirStats.wins} />
          <StatRow label="Losses" left={myStats.losses} right={theirStats.losses} higherIsBetter={false} />
          <StatRow label="Draws" left={myStats.draws} right={theirStats.draws} higherIsBetter={false} />
          <StatRow label="Win Rate" left={myStats.winRate} right={theirStats.winRate} format={(v) => `${v}%`} />
        </View>

        <FilterPillRow current={filter} onSelect={setFilter} />
      </DialogContent>
    </Dialog>
  );
}
