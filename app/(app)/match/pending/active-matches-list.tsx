"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Swords, Play } from "lucide-react";

export interface ActiveLobby {
  challengeId: string;
  opponentName: string;
  matchType: string;
}

export interface ActiveMatch {
  matchId: string;
  opponentName: string;
  matchType: string;
  status: string;
}

interface ActiveMatchesListProps {
  lobbies: ActiveLobby[];
  matches: ActiveMatch[];
}

export function ActiveMatchesList({ lobbies, matches }: ActiveMatchesListProps) {
  if (lobbies.length === 0 && matches.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Swords className="h-4 w-4" />
        Active
      </h3>
      {lobbies.map((lobby) => (
        <Card key={lobby.challengeId}>
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-medium truncate">
                vs {lobby.opponentName}
              </p>
              <Badge variant="outline" className="text-xs shrink-0">
                {lobby.matchType === "ranked" ? "Ranked" : "Casual"}
              </Badge>
            </div>
            <Button size="sm" asChild>
              <Link href={`/match/lobby/${lobby.challengeId}`}>
                Go to Lobby
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
      {matches.map((match) => (
        <Card key={match.matchId}>
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-medium truncate">
                vs {match.opponentName}
              </p>
              <Badge
                variant={match.status === "in_progress" ? "default" : "outline"}
                className="text-xs shrink-0"
              >
                {match.status === "in_progress" ? "Live" : "Ready"}
              </Badge>
            </div>
            <Button size="sm" asChild>
              <Link href={`/match/${match.matchId}/live`}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {match.status === "in_progress" ? "Rejoin" : "Start"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
