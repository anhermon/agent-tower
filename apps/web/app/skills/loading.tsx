export default function SkillsLoading() {
  return (
    <section>
      {/* Page header skeleton */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="h-3 w-16 animate-pulse rounded bg-soft" />
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-9 w-24 animate-pulse rounded bg-soft" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-soft" />
          </div>
          <div className="h-4 w-96 animate-pulse rounded bg-soft" />
          <div className="h-4 w-72 animate-pulse rounded bg-soft" />
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2">
          <div className="h-9 w-44 animate-pulse rounded bg-soft" />
          <div className="h-9 w-24 animate-pulse rounded bg-soft" />
        </div>
      </div>

      {/* Usage analytics section */}
      <div className="mb-10">
        <div className="mb-6 space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-soft" />
          <div className="h-7 w-48 animate-pulse rounded bg-soft" />
          <div className="h-4 w-80 animate-pulse rounded bg-soft" />
        </div>
        {/* Dashboard tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel-soft rounded-sm p-4 space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-soft" />
              <div className="h-6 w-14 animate-pulse rounded bg-soft" />
            </div>
          ))}
        </div>
        <div className="mt-4 h-40 w-full animate-pulse rounded-md bg-soft" />
      </div>

      {/* Efficacy section */}
      <div className="mt-10 border-t border-line/60 pt-8">
        <div className="mb-6 space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-soft" />
          <div className="h-7 w-52 animate-pulse rounded bg-soft" />
          <div className="h-4 w-96 animate-pulse rounded bg-soft" />
        </div>
        <div className="h-48 w-full animate-pulse rounded-md bg-soft" />
      </div>

      {/* Catalogue section */}
      <div className="mt-10 border-t border-line/60 pt-8">
        <div className="mb-6 space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-soft" />
          <div className="h-7 w-40 animate-pulse rounded bg-soft" />
          <div className="h-4 w-64 animate-pulse rounded bg-soft" />
        </div>
        {/* Summary strip */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel-soft rounded-sm p-3 space-y-1">
              <div className="h-3 w-16 animate-pulse rounded bg-soft" />
              <div className="h-6 w-10 animate-pulse rounded bg-soft" />
            </div>
          ))}
        </div>
        {/* Skill grid cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-md p-4 space-y-3">
              <div className="h-4 w-32 animate-pulse rounded bg-soft" />
              <div className="h-3 w-full animate-pulse rounded bg-soft" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-soft" />
              <div className="flex gap-2">
                <div className="h-5 w-16 animate-pulse rounded-full bg-soft" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-soft" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
