import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MATCH_OUTCOME, type MatchOutcome } from "@/lib/constants";

interface MatchCardProps {
  type: "match" | "challenge";
  opponentName: string;
  result?: MatchOutcome | null;
  status?: string;
  eloDelta?: number;
  date: string;
  href?: string;
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

const resultConfig = {
  [MATCH_OUTCOME.WIN]: { label: "Win", variant: "default" as const },
  [MATCH_OUTCOME.LOSS]: { label: "Loss", variant: "destructive" as const },
  [MATCH_OUTCOME.DRAW]: { label: "Draw", variant: "secondary" as const },
} as const;

function CardInner({ type, opponentName, result, status, eloDelta, date }: MatchCardProps) {
  return (
    <CardContent className="flex items-center justify-between py-3 px-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{opponentName}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeDate(date)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {type === "match" && eloDelta != null && (
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              eloDelta > 0 && "text-green-500",
              eloDelta < 0 && "text-red-500",
              eloDelta === 0 && "text-muted-foreground",
            )}
          >
            {eloDelta > 0 ? "+" : ""}
            {eloDelta}
          </span>
        )}

        {type === "match" && result && (
          <Badge variant={resultConfig[result].variant}>
            {resultConfig[result].label}
          </Badge>
        )}

        {type === "challenge" && (
          <Badge variant="outline">{status ?? "Pending"}</Badge>
        )}
      </div>
    </CardContent>
  );
}

export function MatchCard(props: MatchCardProps) {
  if (props.href) {
    return (
      <Link href={props.href}>
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
          <CardInner {...props} />
        </Card>
      </Link>
    );
  }

  return (
    <Card>
      <CardInner {...props} />
    </Card>
  );
}
