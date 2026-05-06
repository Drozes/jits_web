import type { SubmissionBreakdown } from "@jits/shared/types/analytics";

interface SubmissionBreakdownListProps {
  submissions: SubmissionBreakdown[];
}

export function SubmissionBreakdownList({ submissions }: SubmissionBreakdownListProps) {
  const top5 = submissions.slice(0, 5);
  const maxCount = Math.max(1, ...top5.map((s) => s.count));

  if (top5.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
        No submissions recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {top5.map((s) => {
        const pct = Math.round((s.count / maxCount) * 100);
        return (
          <div key={s.type} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate mr-2">{s.type}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {s.asWinner}W / {s.asLoser}L
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
