export function TableSkeleton({
  rows = 5,
  cols = 5,
}: {
  rows?: number
  cols?: number
}) {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="h-10 bg-slate-900 dark:bg-[#081120]" />
      <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-[#0b1220]">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            {[...Array(cols)].map((_, j) => (
              <div
                key={j}
                className={`h-4 rounded bg-slate-100 dark:bg-slate-800 ${
                  j === 0 ? 'w-28' : j === cols - 1 ? 'w-16' : 'flex-1'
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
