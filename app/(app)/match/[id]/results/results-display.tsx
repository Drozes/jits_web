import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MATCH_TYPE } from "@/lib/constants";
import type { MatchDetails } from "@/lib/api/queries";

interface ResultsDisplayProps {
  match: MatchDetails;
  currentAthleteId: string;
}

export function ResultsDisplay({ match, currentAthleteId }: ResultsDisplayProps) {
  const current = match.participants.find(
    (p) => p.athlete_id === currentAthleteId,
  );
  const opponent = match.participants.find(
    (p) => p.athlete_id !== currentAthleteId,
  );

  const outcomeLabel =
    current?.outcome === "win"
      ? "Victory"
      : current?.outcome === "loss"
        ? "Defeat"
        : "Draw";

  const outcomeColor =
    current?.outcome === "win"
      ? "text-green-500"
      : current?.outcome === "loss"
        ? "text-red-500"
        : "text-muted-foreground";

  return (
    <div className="space-y-6 text-center">
      <div>
        <p className={`text-3xl font-black ${outcomeColor}`}>{outcomeLabel}</p>
        <p className="text-sm text-muted-foreground mt-1">
          vs {opponent?.display_name ?? "Opponent"}
        </p>
      </div>

      <Card>
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Result</span>
            <Badge variant="outline">{match.result ?? "—"}</Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Match Type</span>
            <Badge
              variant={
                match.match_type === MATCH_TYPE.RANKED ? "default" : "secondary"
              }
            >
              {match.match_type === MATCH_TYPE.RANKED ? "Ranked" : "Casual"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {match.match_type === MATCH_TYPE.RANKED &&
        current?.elo_delta !== undefined &&
        current.elo_delta !== 0 && (
          <EloChangeCard
            eloBefore={current.elo_before}
            eloAfter={current.elo_after}
            eloDelta={current.elo_delta}
          />
        )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" asChild>
          <Link href="/">Home</Link>
        </Button>
        <Button className="flex-1" asChild>
          <Link href="/profile/stats">Match History</Link>
        </Button>
      </div>
    </div>
  );
}

function EloChangeCard({
  eloBefore,
  eloAfter,
  eloDelta,
}: {
  eloBefore: number | null;
  eloAfter: number | null;
  eloDelta: number;
}) {
  return (
    <Card>
      <CardContent className="py-4 px-4">
        <p className="text-xs text-muted-foreground text-center mb-2">
          ELO Change
        </p>
        <div className="flex items-center justify-center gap-2">
          <span className="text-lg tabular-nums">{eloBefore ?? "—"}</span>
          <span className="text-muted-foreground">&rarr;</span>
          <span className="text-lg font-bold tabular-nums">
            {eloAfter ?? "—"}
          </span>
          <span
            className={`text-sm font-semibold ${
              eloDelta > 0 ? "text-green-500" : "text-red-500"
            }`}
          >
            ({eloDelta > 0 ? "+" : ""}
            {eloDelta})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
