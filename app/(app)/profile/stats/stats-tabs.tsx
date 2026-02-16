"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Zap,
  Activity,
  TrendingUp,
  Target,
} from "lucide-react";
import { EloSparkline } from "./elo-sparkline";
import { MatchHistoryList } from "./match-history-list";

interface RecentPerformance {
  period: string;
  wins: number;
  losses: number;
  eloChange: number;
}

interface MatchHistoryItem {
  match_id: string;
  match_type: string;
  athlete_outcome: string;
  opponent_display_name: string;
  elo_delta: number;
  completed_at: string;
  submission_type_display_name: string;
  result: string;
}

interface EloHistoryItem {
  rating_after: number;
  delta: number;
}

interface StatsTabsProps {
  winStreak: number;
  eloThisMonth: number;
  submissionRate: number;
  totalMatches: number;
  recentPerformance: RecentPerformance[];
  matchHistory: MatchHistoryItem[];
  eloHistory: EloHistoryItem[];
  currentElo: number;
}

export function StatsTabs({
  winStreak,
  eloThisMonth,
  submissionRate,
  totalMatches,
  recentPerformance,
  matchHistory,
  eloHistory,
  currentElo,
}: StatsTabsProps) {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="performance">Performance</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4 space-y-4">
        {/* ELO Trend */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              ELO Trend
            </h3>
            <EloSparkline
              points={eloHistory.map((e) => ({ rating: e.rating_after, delta: e.delta }))}
              currentElo={currentElo}
            />
          </CardContent>
        </Card>

        {/* Current Performance */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" />
              Current Performance
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center rounded-lg bg-orange-50 p-3 dark:bg-orange-950/30">
                <p className="text-2xl font-bold text-orange-600 tabular-nums">
                  {winStreak}
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-400">
                  Win Streak
                </p>
              </div>
              <div className="text-center rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
                <p className="text-2xl font-bold text-blue-600 tabular-nums">
                  {eloThisMonth > 0 ? "+" : ""}
                  {eloThisMonth}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  ELO This Month
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Key Metrics
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Submission Rate</span>
                </div>
                <Badge variant="secondary">{submissionRate}%</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Total Matches</span>
                </div>
                <Badge variant="secondary">{totalMatches}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="performance" className="mt-4 space-y-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Recent Performance
            </h3>
            <div className="space-y-3">
              {recentPerformance.map((period) => {
                const periodTotal = period.wins + period.losses;
                const periodRate =
                  periodTotal > 0
                    ? Math.round((period.wins / periodTotal) * 100)
                    : 0;
                return (
                  <div key={period.period} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">
                        {period.period}
                      </span>
                      <Badge
                        variant={
                          period.eloChange >= 0 ? "default" : "destructive"
                        }
                      >
                        {period.eloChange > 0 ? "+" : ""}
                        {period.eloChange} ELO
                      </Badge>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {period.wins}W - {period.losses}L
                      </span>
                      {periodTotal > 0 && <span>{periodRate}% Win Rate</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <MatchHistoryList matches={matchHistory} />
      </TabsContent>
    </Tabs>
  );
}
