import { getCurrentMilestone, getNextMilestone, getMilestoneProgress } from "@jits/shared/utils";

interface MilestoneProgressProps {
  elo: number;
}

export function MilestoneProgress({ elo }: MilestoneProgressProps) {
  const current = getCurrentMilestone(elo);
  const next = getNextMilestone(elo);
  const progress = getMilestoneProgress(elo);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{current.name}</span>
        {next ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {next.threshold - elo} pts to {next.name}
          </span>
        ) : (
          <span className="text-xs text-success font-medium">Max rank reached</span>
        )}
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      {next && (
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>{current.threshold}</span>
          <span>{next.threshold}</span>
        </div>
      )}
    </div>
  );
}
