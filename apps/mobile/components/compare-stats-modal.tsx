import { Text, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { type AthleteStats, StatRow } from "./compare-stats-parts";

interface CompareStatsModalProps {
  currentAthlete: AthleteStats;
  competitor: AthleteStats;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Career stats side by side. Every match is ranked, so there is no filter. */
export function CompareStatsModal({
  currentAthlete,
  competitor,
  open,
  onOpenChange,
}: CompareStatsModalProps) {
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
          <StatRow label="ELO" left={currentAthlete.elo} right={competitor.elo} />
          <StatRow label="Wins" left={currentAthlete.wins} right={competitor.wins} />
          <StatRow label="Losses" left={currentAthlete.losses} right={competitor.losses} higherIsBetter={false} />
          <StatRow label="Draws" left={currentAthlete.draws} right={competitor.draws} higherIsBetter={false} />
          <StatRow
            label="Win Rate"
            left={currentAthlete.winRate}
            right={competitor.winRate}
            format={(v) => `${v}%`}
          />
        </View>
      </DialogContent>
    </Dialog>
  );
}
