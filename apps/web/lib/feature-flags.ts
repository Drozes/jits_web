const FLAGS = {
  timekeeperEnabled: false,
} as const;

export type FeatureFlag = keyof typeof FLAGS;

export function getFlag(flag: FeatureFlag): boolean {
  return FLAGS[flag];
}
