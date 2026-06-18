export function PageSkeleton({
  rows = 3,
  cards = 0,
  title = true,
}: {
  rows?: number
  cards?: number
  title?: boolean
}) {
  return (
    <div className="animate-pulse space-y-6 p-1">
      {title && (
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-7 w-52 rounded-xl bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-32 rounded-lg bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 rounded-xl bg-slate-200 dark:bg-slate-700" />
            <div className="h-9 w-28 rounded-xl bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      )}

      {cards > 0 && (
        <div className={`grid gap-4 ${cards === 2 ? 'md:grid-cols-2' : cards === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
          {[...Array(cards)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="mt-3 h-7 w-24 rounded-lg bg-slate-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="h-5 w-40 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[...Array(rows * 2)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-9 w-full rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="h-5 w-32 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="mt-4 space-y-2">
          {[...Array(rows)].map((_, i) => (
            <div key={i} className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    </div>
  )
}
