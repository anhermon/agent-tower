export default function SessionsCostsLoading() {
  return (
    <section className="space-y-6">
      {/* Page header skeleton */}
      <header className="mb-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-24 animate-pulse rounded bg-soft" />
          <div className="h-4 w-72 animate-pulse rounded bg-soft" />
        </div>
        <div className="h-9 w-48 animate-pulse rounded bg-soft" />
      </header>

      {/* 3 hero stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <article
            key={i}
            className="glass-panel flex min-h-28 flex-col justify-between rounded-md p-5"
          >
            <div className="h-3 w-32 animate-pulse rounded bg-soft" />
            <div className="h-8 w-24 animate-pulse rounded bg-soft" />
            <div className="h-3 w-28 animate-pulse rounded bg-soft" />
          </article>
        ))}
      </div>

      {/* Cost over time chart */}
      <article className="glass-panel rounded-md p-5">
        <div className="mb-4 space-y-1">
          <div className="h-4 w-36 animate-pulse rounded bg-soft" />
          <div className="h-3 w-52 animate-pulse rounded bg-soft" />
        </div>
        <div className="h-48 w-full animate-pulse rounded bg-soft" />
      </article>

      {/* Cost by project */}
      <article className="glass-panel rounded-md p-5">
        <div className="mb-4 space-y-1">
          <div className="h-4 w-32 animate-pulse rounded bg-soft" />
          <div className="h-3 w-44 animate-pulse rounded bg-soft" />
        </div>
        <div className="h-40 w-full animate-pulse rounded bg-soft" />
      </article>

      {/* Per-model token breakdown table */}
      <article className="glass-panel rounded-md p-5">
        <div className="mb-4 space-y-1">
          <div className="h-4 w-48 animate-pulse rounded bg-soft" />
          <div className="h-3 w-40 animate-pulse rounded bg-soft" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-line/30 py-2">
              <div className="h-4 w-40 animate-pulse rounded bg-soft" />
              <div className="ml-auto h-4 w-16 animate-pulse rounded bg-soft" />
              <div className="h-4 w-16 animate-pulse rounded bg-soft" />
              <div className="h-4 w-16 animate-pulse rounded bg-soft" />
            </div>
          ))}
        </div>
      </article>

      {/* Cache efficiency */}
      <article className="glass-panel rounded-md p-5">
        <div className="mb-4 space-y-1">
          <div className="h-4 w-36 animate-pulse rounded bg-soft" />
          <div className="h-3 w-52 animate-pulse rounded bg-soft" />
        </div>
        <div className="h-32 w-full animate-pulse rounded bg-soft" />
      </article>
    </section>
  );
}
