export default function SessionsActivityLoading() {
  return (
    <section className="space-y-6">
      {/* Page header skeleton */}
      <header className="mb-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-28 animate-pulse rounded bg-soft" />
          <div className="h-4 w-80 animate-pulse rounded bg-soft" />
        </div>
        <div className="h-9 w-48 animate-pulse rounded bg-soft" />
      </header>

      {/* Streak card */}
      <div className="glass-panel rounded-md p-5">
        <div className="flex flex-wrap gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-soft" />
              <div className="h-8 w-16 animate-pulse rounded bg-soft" />
            </div>
          ))}
        </div>
      </div>

      {/* Activity calendar + Peak hours */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <article className="glass-panel rounded-md p-5">
          <div className="mb-4 space-y-1">
            <div className="h-4 w-40 animate-pulse rounded bg-soft" />
            <div className="h-3 w-56 animate-pulse rounded bg-soft" />
          </div>
          {/* Heatmap grid placeholder */}
          <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(53, 1fr)" }}>
            {Array.from({ length: 53 * 7 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-[1px] bg-soft" />
            ))}
          </div>
        </article>
        <article className="glass-panel rounded-md p-5">
          <div className="mb-4 space-y-1">
            <div className="h-4 w-28 animate-pulse rounded bg-soft" />
            <div className="h-3 w-40 animate-pulse rounded bg-soft" />
          </div>
          <div className="h-48 w-full animate-pulse rounded bg-soft" />
        </article>
      </div>

      {/* Usage over time + Day of week */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <article key={i} className="glass-panel rounded-md p-5">
            <div className="mb-4 space-y-1">
              <div className="h-4 w-36 animate-pulse rounded bg-soft" />
              <div className="h-3 w-44 animate-pulse rounded bg-soft" />
            </div>
            <div className="h-48 w-full animate-pulse rounded bg-soft" />
          </article>
        ))}
      </div>

      {/* System info panel placeholder */}
      <div className="h-24 w-full animate-pulse rounded-md bg-soft" />
    </section>
  );
}
