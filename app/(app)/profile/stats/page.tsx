import { Suspense } from "react";
import { StatsContent } from "./stats-content";

export default function StatsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="grid grid-cols-3 gap-4">
            <div className="h-16 rounded-lg bg-muted" />
            <div className="h-16 rounded-lg bg-muted" />
            <div className="h-16 rounded-lg bg-muted" />
          </div>
          <div className="h-10 rounded-lg bg-muted" />
          <div className="h-48 rounded-lg bg-muted" />
          <div className="h-48 rounded-lg bg-muted" />
        </div>
      }
    >
      <StatsContent />
    </Suspense>
  );
}
