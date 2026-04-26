export default function SessionsOverviewLoading() {
  return (
    <section className="space-y-6">
      {/* Page header skeleton */}
      <header className="mb-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-32 animate-pulse rounded bg-soft" />
          <div className="h-4 w-64 animate-pulse rounded bg-soft" />
        </div>
        <div className="h-9 w-48 animate-pulse rounded bg-soft" />
      </header>

      {/* 4 hero stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article
            key={i}
            className="glass-panel flex min-h-32 flex-col justify-between gap-3 rounded-md p-5"
          >
            <div className="h-3 w-20 animate-pulse rounded bg-soft" />
            <div className="h-8 w-28 animate-pulse rounded bg-soft" />
            <div className="h-3 w-24 animate-pulse rounded bg-soft" />
            <div className="h-9 w-full animate-pulse rounded bg-soft" />
          </article>
        ))}
      </div>

      {/* Live activity panel placeholder */}
      <div className="h-16 w-full animate-pulse rounded-md bg-soft" />

      {/* Usage over time + Model distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <article className="glass-panel rounded-md p-5">
          <div className="mb-4 space-y-1">
            <div className="h-4 w-40 animate-pulse rounded bg-soft" />
            <div className="h-3 w-56 animate-pulse rounded bg-soft" />
          </div>
          <div className="h-48 w-full animate-pulse rounded bg-soft" />
        </article>
        <article className="glass-panel rounded-md p-5">
          <div className="mb-4 space-y-1">
            <div className="h-4 w-36 animate-pulse rounded bg-soft" />
            <div className="h-3 w-40 animate-pulse rounded bg-soft" />
          </div>
          <div className="h-48 w-full animate-pulse rounded-full bg-soft" />
        </article>
      </div>

      {/* Peak hours + Project activity */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <article key={i} className="glass-panel rounded-md p-5">
            <div className="mb-4 space-y-1">
              <div className="h-4 w-32 animate-pulse rounded bg-soft" />
              <div className="h-3 w-48 animate-pulse rounded bg-soft" />
            </div>
            <div className="h-40 w-full animate-pulse rounded bg-soft" />
          </article>
        ))}
      </div>

      {/* Token breakdown */}
      <article className="glass-panel rounded-md p-5">
        <div className="mb-4 space-y-1">
          <div className="h-4 w-36 animate-pulse rounded bg-soft" />
          <div className="h-3 w-52 animate-pulse rounded bg-soft" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-28 animate-pulse rounded bg-soft" />
              <div className="h-4 flex-1 animate-pulse rounded bg-soft" />
              <div className="h-3 w-16 animate-pulse rounded bg-soft" />
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
