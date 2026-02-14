import { cva, type VariantProps } from "class-variance-authority";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const eloBadgeVariants = cva("inline-flex items-center font-bold tabular-nums", {
  variants: {
    variant: {
      display: "text-2xl gap-1",
      compact: "text-sm gap-1",
      stakes: "text-base gap-1.5",
    },
  },
  defaultVariants: {
    variant: "display",
  },
});

interface EloBadgeProps extends VariantProps<typeof eloBadgeVariants> {
  elo: number;
  peak?: number;
  delta?: number;
  className?: string;
}

export function EloBadge({ elo, peak, delta, variant, className }: EloBadgeProps) {
  if (variant === "stakes" && delta != null) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="flex items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-1.5 text-sm font-semibold text-green-700">
          <TrendingUp className="h-4 w-4" />
          <span>+{Math.abs(delta)}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1.5 text-sm font-semibold text-red-700">
          <TrendingDown className="h-4 w-4" />
          <span>-{Math.abs(delta)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(eloBadgeVariants({ variant }), className)}>
      <span>{elo}</span>
      {variant === "display" && peak != null && peak > elo && (
        <span className="text-sm font-normal text-primary">
          Peak: {peak}
        </span>
      )}
      {variant === "compact" && delta != null && delta !== 0 && (
        <span
          className={cn(
            "text-xs font-semibold",
            delta > 0 && "text-green-500",
            delta < 0 && "text-red-500",
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      )}
    </div>
  );
}
