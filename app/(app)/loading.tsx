export default function DashboardLoading() {
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
      <div className="flex flex-col gap-3">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="flex flex-col gap-2">
          <div className="h-14 rounded-lg bg-muted" />
          <div className="h-14 rounded-lg bg-muted" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="flex flex-col gap-2">
          <div className="h-14 rounded-lg bg-muted" />
          <div className="h-14 rounded-lg bg-muted" />
          <div className="h-14 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
