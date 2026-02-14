export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-32 rounded bg-muted" />
      <div className="h-48 rounded-lg bg-muted" />
      <div className="h-10 rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
      </div>
      <div className="h-32 rounded-lg bg-muted" />
    </div>
  );
}
