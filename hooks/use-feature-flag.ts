"use client";

import { getFlag, type FeatureFlag } from "@/lib/feature-flags";

export { type FeatureFlag };

export function useFeatureFlag(flag: FeatureFlag): boolean {
  return getFlag(flag);
}
