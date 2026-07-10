import Link from 'next/link'
import { ChevronLeft, Search } from 'lucide-react'
import { cn } from '@/src/lib/utils'

const statusClasses: Record<string, string> = {
  Pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Recibido: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Cancelado: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  'Sin asignar': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Asignado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Entregado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Con incidencia': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'En Tránsito': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Embarcado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Arribado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Booking Confirmado': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'Listo para Embarque': 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
}

export const portalFieldClass =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#0038BD] focus:ring-2 focus:ring-[#0038BD]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-950'

export function PortalPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function PortalBackHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string
  subtitle?: string
  onBack: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Volver"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0038BD]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

export function PortalCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900', className)}>
      {children}
    </div>
  )
}

export function PortalSectionHeader({
  icon,
  title,
  action,
  tone = 'slate',
}: {
  icon?: React.ReactNode
  title: string
  action?: React.ReactNode
  tone?: 'slate' | 'amber' | 'red'
}) {
  const toneClass = {
    slate: 'border-slate-100 dark:border-slate-800',
    amber: 'border-amber-100 dark:border-amber-900/20',
    red: 'border-red-100 dark:border-red-900/20',
  }[tone]

  return (
    <div className={cn('flex items-center justify-between gap-3 border-b px-5 py-4', toneClass)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="shrink-0 text-slate-400 dark:text-slate-500">{icon}</span>}
        <h2 className="font-display font-semibold text-slate-900 dark:text-white">{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function PortalSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(portalFieldClass, 'pl-10')}
      />
    </div>
  )
}

export function PortalFilterPills<T extends string>({
  options,
  value,
  onChange,
  labelFor,
}: {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  labelFor?: (value: T) => string
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
            value === option
              ? 'bg-[#0038BD] text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          )}
        >
          {labelFor ? labelFor(option) : option}
        </button>
      ))}
    </div>
  )
}

export function PortalStatusBadge({
  status,
  label,
  icon,
  className,
}: {
  status: string
  label?: string
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', statusClasses[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', className)}>
      {icon}
      {label ?? status}
    </span>
  )
}

export function PortalEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 text-slate-300 dark:text-slate-600">{icon}</div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-400 dark:text-slate-500">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PortalButton({
  children,
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-[#0038BD] text-white hover:bg-[#022a91]',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
        variant === 'danger' && 'border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/20',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function PortalTextLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-1 text-xs font-medium text-[#0038BD] hover:underline dark:text-blue-400', className)}>
      {children}
    </Link>
  )
}
