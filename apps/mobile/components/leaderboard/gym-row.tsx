import { RankRow } from "@/components/ui/elo-system";
import type { RankedGym } from "@/lib/leaderboard/use-leaderboard-data";

/**
 * Single gym in the gyms tab of the Rankings screen. Reuses RankRow so the
 * gyms ladder visually matches the fighters ladder (dense stacked rows with
 * accent-cta left border on the leader).
 */
export function GymRow({ gym }: { gym: RankedGym }) {
  const memberSuffix = gym.memberCount === 1 ? "Athlete" : "Athletes";
  return (
    <RankRow
      rank={gym.rank}
      name={gym.name}
      subtitle={`${gym.memberCount} ${memberSuffix} · Avg ${gym.averageElo}`}
      value={gym.totalElo}
      delta={0}
      leader={gym.rank === 1}
    />
  );
}
