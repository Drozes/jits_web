import { Suspense } from "react";
import { DashboardStats } from "./dashboard-stats";
import { DashboardChallenges } from "./dashboard-challenges";
import { DashboardMatches } from "./dashboard-matches";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>
      <Suspense fallback={<ChallengesSkeleton />}>
        <DashboardChallenges />
      </Suspense>
      <Suspense fallback={<MatchesSkeleton />}>
        <DashboardMatches />
      </Suspense>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div>
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="mt-2 h-4 w-36 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

function ChallengesSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="h-6 w-48 rounded bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-14 rounded-lg bg-muted" />
        <div className="h-14 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

function MatchesSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="h-6 w-40 rounded bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-14 rounded-lg bg-muted" />
        <div className="h-14 rounded-lg bg-muted" />
        <div className="h-14 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
