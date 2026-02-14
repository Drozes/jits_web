export default function LeaderboardLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center justify-center gap-3">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-5 w-10 rounded-full bg-muted" />
        <div className="h-4 w-12 rounded bg-muted" />
      </div>
      <div className="flex items-end justify-center gap-3">
        <div className="h-36 w-24 rounded-lg bg-muted" />
        <div className="h-44 w-28 rounded-lg bg-muted" />
        <div className="h-32 w-24 rounded-lg bg-muted" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="mx-auto h-4 w-52 rounded bg-muted" />
    </div>
  );
}
