export default function SessionsLoading() {
  return (
    <section>
      {/* Header skeleton */}
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-8 w-36 animate-pulse rounded bg-soft" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-soft" />
          </div>
          <div className="h-4 w-80 animate-pulse rounded bg-soft" />
          <div className="h-3 w-52 animate-pulse rounded bg-soft" />
        </div>
        <div className="h-10 w-24 animate-pulse rounded bg-soft" />
      </div>

      {/* Session list skeleton — 8 rows */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-panel flex items-center gap-4 rounded-md px-4 py-3">
            <div className="h-4 w-48 animate-pulse rounded bg-soft" />
            <div className="h-4 w-24 animate-pulse rounded bg-soft" />
            <div className="ml-auto h-4 w-16 animate-pulse rounded bg-soft" />
          </div>
        ))}
      </div>
    </section>
  );
}
