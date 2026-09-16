import { MetaTag } from "@/components/ui/elo-system";

interface ChallengeBadgeProps {
  className?: string;
}

/**
 * "Challenged" marker for an athlete you already have a pending challenge with.
 *
 * Deliberately neutral: amber is reserved for draws / Pressure Score, and a
 * pending challenge is neither a draw nor a negative state.
 */
export function ChallengeBadge({ className }: ChallengeBadgeProps) {
  return <MetaTag className={className}>Challenged</MetaTag>;
}
