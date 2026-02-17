import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeDate } from "@/lib/utils";
import { MATCH_OUTCOME, type MatchOutcome, type MatchType } from "@/lib/constants";

interface MatchCardProps {
  type: "match" | "challenge";
  opponentName: string;
  result?: MatchOutcome | null;
  status?: string;
  direction?: "incoming" | "sent";
  matchType?: MatchType;
  eloDelta?: number;
  date: string;
  href?: string;
}

const resultConfig = {
  [MATCH_OUTCOME.WIN]: { label: "Win", variant: "success" as const },
  [MATCH_OUTCOME.LOSS]: { label: "Loss", variant: "destructive" as const },
  [MATCH_OUTCOME.DRAW]: { label: "Draw", variant: "secondary" as const },
} as const;

function CardInner({ type, opponentName, result, status, direction, matchType, eloDelta, date }: MatchCardProps) {
  return (
    <CardContent className="flex items-center justify-between py-3 px-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{opponentName}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeDate(date)}
          {matchType && (
            <> · {matchType === "ranked" ? "Ranked" : "Casual"}</>
          )}
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

        {type === "challenge" && direction && (
          <Badge variant={direction === "incoming" ? "secondary" : "outline"}>
            {direction === "incoming" ? "Incoming" : "Sent"}
          </Badge>
        )}

        {type === "challenge" && !direction && (
          <div className="flex flex-col items-end gap-0.5">
            <Badge variant={status === "Accepted" ? "success" : "outline"}>
              {status ?? "Pending"}
            </Badge>
            {status === "Accepted" && (
              <span className="text-[10px] text-muted-foreground">Go to Lobby</span>
            )}
          </div>
        )}
      </div>
    </CardContent>
  );
}

export function MatchCard(props: MatchCardProps) {
  if (props.href) {
    return (
      <Link href={props.href}>
        <Card className="cursor-pointer hover:bg-accent/50 transition-all active:scale-[0.98] active:opacity-90">
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
