import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Handshake, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MATCH_RESULT, MATCH_TYPE, type MatchType } from "@/lib/constants";

interface ParticipantResult {
  displayName: string;
  outcome: string | null;
  eloBefore: number | null;
  eloAfter: number | null;
  eloDelta: number;
}

interface MatchResultsDisplayProps {
  matchType: MatchType;
  result: string | null;
  currentAthlete: ParticipantResult;
  rivalAthlete: ParticipantResult;
}

export function MatchResultsDisplay({
  matchType,
  result,
  currentAthlete,
  rivalAthlete,
}: MatchResultsDisplayProps) {
  const isWin = currentAthlete.outcome === "win";
  const isDraw = result === MATCH_RESULT.DRAW;
  const isRanked = matchType === MATCH_TYPE.RANKED;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Result icon */}
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full",
          isWin && "bg-green-100",
          !isWin && !isDraw && "bg-red-100",
          isDraw && "bg-muted",
        )}
      >
        {isDraw ? (
          <Handshake className="h-8 w-8 text-muted-foreground" />
        ) : (
          <Trophy
            className={cn("h-8 w-8", isWin ? "text-green-600" : "text-red-500")}
          />
        )}
      </div>

      {/* Result text */}
      <div className="text-center">
        <h2 className="text-2xl font-bold">
          {isDraw ? "Draw" : isWin ? "Victory!" : "Defeat"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isDraw
            ? `Draw against ${rivalAthlete.displayName}`
            : isWin
              ? `You defeated ${rivalAthlete.displayName}`
              : `${rivalAthlete.displayName} won`}
        </p>
      </div>

      {/* Match type */}
      <Badge variant={isRanked ? "default" : "outline"}>
        {isRanked ? "Ranked" : "Casual"}
      </Badge>

      {/* ELO Changes (ranked only) */}
      {isRanked && currentAthlete.eloBefore != null && (
        <Card className="w-full">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-center mb-3">ELO Changes</p>
            <div className="grid grid-cols-2 gap-4">
              <EloChangeColumn
                name={currentAthlete.displayName}
                label="You"
                eloBefore={currentAthlete.eloBefore}
                eloAfter={currentAthlete.eloAfter}
                eloDelta={currentAthlete.eloDelta}
              />
              <EloChangeColumn
                name={rivalAthlete.displayName}
                eloBefore={rivalAthlete.eloBefore}
                eloAfter={rivalAthlete.eloAfter}
                eloDelta={rivalAthlete.eloDelta}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex flex-col gap-3 w-full">
        <Button asChild className="w-full">
          <Link href="/arena">Back to Arena</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}

function EloChangeColumn({
  name,
  label,
  eloBefore,
  eloAfter,
  eloDelta,
}: {
  name: string;
  label?: string;
  eloBefore: number | null;
  eloAfter: number | null;
  eloDelta: number;
}) {
  const isPositive = eloDelta > 0;
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-xs font-medium truncate max-w-full">
        {name}
        {label && (
          <span className="text-muted-foreground ml-1">({label})</span>
        )}
      </p>
      <div className="flex items-center gap-1">
        {isPositive ? (
          <TrendingUp className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
        )}
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            isPositive ? "text-green-500" : "text-red-500",
          )}
        >
          {isPositive ? "+" : ""}
          {eloDelta}
        </span>
      </div>
      {eloBefore != null && eloAfter != null && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {eloBefore} → {eloAfter}
        </p>
      )}
    </div>
  );
}
