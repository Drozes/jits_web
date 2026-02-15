import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChallengeBadgeProps {
  className?: string;
}

export function ChallengeBadge({ className }: ChallengeBadgeProps) {
  return (
    <Badge
      className={cn(
        "border-amber-500/30 bg-amber-500/10 text-amber-600 text-[10px] px-1.5 py-0",
        className,
      )}
      variant="outline"
    >
      Challenged
    </Badge>
  );
}
