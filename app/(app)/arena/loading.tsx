export default function ArenaLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-[72px] rounded-xl border-2 bg-muted" />
      <div className="flex flex-col gap-3">
        <div className="h-6 w-44 rounded bg-muted" />
        <div className="flex flex-col gap-2">
          <div className="h-20 rounded-lg bg-muted" />
          <div className="h-20 rounded-lg bg-muted" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-6 w-32 rounded bg-muted" />
        <div className="flex flex-col gap-2">
          <div className="h-20 rounded-lg bg-muted" />
          <div className="h-20 rounded-lg bg-muted" />
          <div className="h-20 rounded-lg bg-muted" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-6 w-36 rounded bg-muted" />
        <div className="h-24 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
