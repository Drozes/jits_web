"use client";

import { cn } from "@/lib/utils";

interface EloSparklineProps {
  /** ELO values in chronological order (oldest first) */
  points: { rating: number; delta: number }[];
  currentElo: number;
  className?: string;
}

const WIDTH = 280;
const HEIGHT = 64;
const PADDING_X = 4;
const PADDING_Y = 8;

export function EloSparkline({ points, currentElo, className }: EloSparklineProps) {
  // Build full rating series: starting ELO + each subsequent rating
  const ratings = points.length > 0
    ? [points[0].rating - points[0].delta, ...points.map((p) => p.rating)]
    : [currentElo];

  if (ratings.length < 2) {
    return (
      <div className={cn("flex items-center justify-center h-16 text-xs text-muted-foreground", className)}>
        Play ranked matches to see your ELO trend
      </div>
    );
  }

  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = max - min || 1;

  const toX = (i: number) => PADDING_X + (i / (ratings.length - 1)) * (WIDTH - PADDING_X * 2);
  const toY = (val: number) => PADDING_Y + (1 - (val - min) / range) * (HEIGHT - PADDING_Y * 2);

  const pathPoints = ratings.map((r, i) => `${toX(i)},${toY(r)}`);
  const polyline = pathPoints.join(" ");

  const last = ratings[ratings.length - 1];
  const first = ratings[0];
  const trending = last >= first;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-16" preserveAspectRatio="none">
        <polyline
          points={polyline}
          fill="none"
          stroke={trending ? "rgb(34 197 94)" : "rgb(239 68 68)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={toX(ratings.length - 1)}
          cy={toY(last)}
          r="3"
          fill={trending ? "rgb(34 197 94)" : "rgb(239 68 68)"}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
        <span className="tabular-nums">{first}</span>
        <span className={cn("font-semibold tabular-nums", trending ? "text-green-500" : "text-red-500")}>
          {last}
        </span>
      </div>
    </div>
  );
}
