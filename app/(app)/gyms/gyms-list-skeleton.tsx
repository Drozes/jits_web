export function GymsListSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-9 w-full bg-muted rounded-md" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-5 w-32 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
            <div className="h-6 w-14 bg-muted rounded-lg" />
          </div>
          <div className="flex gap-4">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-3 w-20 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
