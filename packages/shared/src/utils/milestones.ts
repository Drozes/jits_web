export interface Milestone {
  name: string;
  threshold: number;
}

export const ELO_MILESTONES: Milestone[] = [
  { name: "Newcomer", threshold: 1000 },
  { name: "Contender", threshold: 1100 },
  { name: "Competitor", threshold: 1200 },
  { name: "Warrior", threshold: 1300 },
  { name: "Elite", threshold: 1400 },
  { name: "Champion", threshold: 1500 },
  { name: "Legend", threshold: 1600 },
];

/** Returns the milestone the athlete currently holds based on their ELO. */
export function getCurrentMilestone(elo: number): Milestone {
  let current = ELO_MILESTONES[0];
  for (const m of ELO_MILESTONES) {
    if (elo >= m.threshold) current = m;
    else break;
  }
  return current;
}

/** Returns the next milestone above the athlete's current ELO, or null if at the top. */
export function getNextMilestone(elo: number): Milestone | null {
  for (const m of ELO_MILESTONES) {
    if (elo < m.threshold) return m;
  }
  return null;
}

/** Returns 0-100 progress toward the next milestone. Returns 100 if at the top. */
export function getMilestoneProgress(elo: number): number {
  const current = getCurrentMilestone(elo);
  const next = getNextMilestone(elo);
  if (!next) return 100;
  const range = next.threshold - current.threshold;
  if (range <= 0) return 100;
  return Math.min(100, Math.round(((elo - current.threshold) / range) * 100));
}
