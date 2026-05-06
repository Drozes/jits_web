import type { WeeklyActivity } from "@jits/shared/types/analytics";

interface WeeklyActivityChartProps {
  weeks: WeeklyActivity[];
}

export function WeeklyActivityChart({ weeks }: WeeklyActivityChartProps) {
  const maxMatches = Math.max(1, ...weeks.map((w) => w.matches));

  if (weeks.every((w) => w.matches === 0)) {
    return (
      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
        No matches in the last 8 weeks
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1.5 h-20">
      {weeks.map((w) => {
        const height = w.matches > 0 ? Math.max(8, (w.matches / maxMatches) * 100) : 0;
        const winPct = w.matches > 0 ? (w.wins / w.matches) * 100 : 0;
        return (
          <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end" style={{ height: "60px" }}>
              {w.matches > 0 && (
                <div
                  className="w-full rounded-sm bg-primary/80 relative"
                  style={{ height: `${height}%` }}
                  title={`${w.matches} matches, ${w.wins} wins (${Math.round(winPct)}%)`}
                >
                  {w.wins > 0 && (
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-sm bg-success/80"
                      style={{ height: `${winPct}%` }}
                    />
                  )}
                </div>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">{w.week}</span>
          </div>
        );
      })}
    </div>
  );
}
