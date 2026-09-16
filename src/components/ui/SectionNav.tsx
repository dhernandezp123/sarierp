type SectionNavItem = {
  href: `#${string}`
  label: string
}

export function SectionNav({
  items,
  label = 'Secciones de la p\u00e1gina',
}: {
  items: SectionNavItem[]
  label?: string
}) {
  return (
    <nav
      aria-label={label}
      className="sticky top-16 z-30 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-[#0b1220]/95"
    >
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-center gap-1">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  )
}
