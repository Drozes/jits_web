import { canSeeAnalysisLabels } from "@jits/shared/utils";
import { useAuth } from "@/lib/auth/hooks";

/**
 * The one gate for AI analysis labels (move, position and technique names)
 * on mobile (jits-xfvd.18): true only for platform admins (`admin` or
 * `founder`, the same rule as `useIsAdmin`). Default hidden: signed out,
 * loading or any other role reads false.
 *
 * It gates the analysis surfaces only (match detail AI BREAKDOWN summary,
 * key moment labels and technique tags). The player and the highlight reels
 * show no AI labels to anyone, admins included (owner decision 2026-10-06).
 */
export function useShowAnalysisLabels(): boolean {
  const { athlete } = useAuth();
  return canSeeAnalysisLabels(athlete?.platform_role);
}
