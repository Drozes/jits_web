"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Activity, TrendingUp, Target, BarChart3, Weight } from "lucide-react";
import { EloSparkline } from "./elo-sparkline";
import { MatchHistoryList } from "./match-history-list";
import { WeeklyActivityChart } from "./weekly-activity";
import { SubmissionBreakdownList } from "./submission-breakdown";
import { WeightClassChart } from "./weight-class-chart";
import type { WeeklyActivity, SubmissionBreakdown, WeightClassStats } from "@jits/shared/types/analytics";

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
  weeklyActivity: WeeklyActivity[];
  submissions: SubmissionBreakdown[];
  weightClassStats: WeightClassStats[];
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
  weeklyActivity,
  submissions,
  weightClassStats,
}: StatsTabsProps) {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="insights">Insights</TabsTrigger>
        <TabsTrigger value="performance">Periods</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4 space-y-4">
        <OverviewTab
          eloHistory={eloHistory}
          currentElo={currentElo}
          winStreak={winStreak}
          eloThisMonth={eloThisMonth}
          submissionRate={submissionRate}
          totalMatches={totalMatches}
        />
      </TabsContent>

      <TabsContent value="insights" className="mt-4 space-y-4">
        <InsightsTab
          weeklyActivity={weeklyActivity}
          submissions={submissions}
          weightClassStats={weightClassStats}
        />
      </TabsContent>

      <TabsContent value="performance" className="mt-4 space-y-4">
        <PerformanceTab recentPerformance={recentPerformance} />
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <MatchHistoryList matches={matchHistory} />
      </TabsContent>
    </Tabs>
  );
}

function OverviewTab({ eloHistory, currentElo, winStreak, eloThisMonth, submissionRate, totalMatches }: {
  eloHistory: EloHistoryItem[];
  currentElo: number;
  winStreak: number;
  eloThisMonth: number;
  submissionRate: number;
  totalMatches: number;
}) {
  return (
    <>
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
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Current Performance
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center rounded-lg bg-orange-50 p-3 dark:bg-orange-950/30">
              <p className="text-2xl font-bold text-orange-600 tabular-nums">{winStreak}</p>
              <p className="text-xs text-orange-700 dark:text-orange-400">Win Streak</p>
            </div>
            <div className="text-center rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
              <p className="text-2xl font-bold text-blue-600 tabular-nums">
                {eloThisMonth > 0 ? "+" : ""}{eloThisMonth}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400">ELO This Month</p>
            </div>
          </div>
        </CardContent>
      </Card>
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
    </>
  );
}

function InsightsTab({ weeklyActivity, submissions, weightClassStats }: {
  weeklyActivity: WeeklyActivity[];
  submissions: SubmissionBreakdown[];
  weightClassStats: WeightClassStats[];
}) {
  return (
    <>
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Weekly Activity
          </h3>
          <WeeklyActivityChart weeks={weeklyActivity} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Top Submissions
          </h3>
          <SubmissionBreakdownList submissions={submissions} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Weight className="h-4 w-4 text-primary" />
            Record by Weight Class
          </h3>
          <WeightClassChart divisions={weightClassStats} />
        </CardContent>
      </Card>
    </>
  );
}

function PerformanceTab({ recentPerformance }: { recentPerformance: RecentPerformance[] }) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-500" />
          Recent Performance
        </h3>
        <div className="space-y-3">
          {recentPerformance.map((period) => {
            const periodTotal = period.wins + period.losses;
            const periodRate = periodTotal > 0 ? Math.round((period.wins / periodTotal) * 100) : 0;
            return (
              <div key={period.period} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{period.period}</span>
                  <Badge variant={period.eloChange >= 0 ? "success" : "destructive"}>
                    {period.eloChange > 0 ? "+" : ""}{period.eloChange} ELO
                  </Badge>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{period.wins}W - {period.losses}L</span>
                  {periodTotal > 0 && <span>{periodRate}% Win Rate</span>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
