export function GymDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-4 w-28 bg-muted rounded" />
        <div className="h-4 w-36 bg-muted rounded" />
      </div>
      {/* Button placeholder */}
      <div className="h-10 w-full bg-muted rounded-lg" />
      {/* Session cards */}
      <div className="flex flex-col gap-3">
        <div className="h-5 w-24 bg-muted rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border p-4 space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-3 w-48 bg-muted rounded" />
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
