import type { WeightClassStats } from "@jits/shared/types/analytics";

interface WeightClassChartProps {
  divisions: WeightClassStats[];
}

export function WeightClassChart({ divisions }: WeightClassChartProps) {
  if (divisions.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
        No weight class data available
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {divisions.map((d) => {
        const total = d.wins + d.losses + d.draws;
        const winPct = total > 0 ? Math.round((d.wins / total) * 100) : 0;
        return (
          <div key={d.division} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate mr-2">{d.division}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {d.wins}W-{d.losses}L-{d.draws}D ({winPct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden flex">
              {d.wins > 0 && (
                <div
                  className="h-full bg-success/80"
                  style={{ width: `${(d.wins / total) * 100}%` }}
                />
              )}
              {d.losses > 0 && (
                <div
                  className="h-full bg-destructive/80"
                  style={{ width: `${(d.losses / total) * 100}%` }}
                />
              )}
              {d.draws > 0 && (
                <div
                  className="h-full bg-amber-500/80"
                  style={{ width: `${(d.draws / total) * 100}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
