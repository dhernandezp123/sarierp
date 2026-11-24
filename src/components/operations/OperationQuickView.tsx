import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Info,
  ShieldCheck,
  Ship,
} from 'lucide-react'
import { CostNotice, CostStatusBadge } from '@/src/components/pricing/CostStatus'
import {
  OperationStatusBadge,
  operationStatusPresentation,
  operationPrimaryButtonClass,
  operationSecondaryButtonClass,
} from '@/src/components/operations/OperationsWorkspace'
import type { BookingOperationalState } from '@/src/lib/booking-operational-state'
import type { OperationsWorkItem } from '@/src/lib/operations-control-tower'
import { formatDate } from '@/src/lib/format'

export type QuickViewBooking = {
  carrier: string | null
  vessel_name: string | null
  voyage: string | null
  etd: string | null
  eta: string | null
  actual_etd: string | null
  actual_eta: string | null
  free_days: number | null
  remaining_free_days: number | null
  origin: string | null
  destination: string | null
  containers: Array<{ container_type: string | null; quantity: number | null }>
  documents: Array<{ document_type: string | null }>
  bills: Array<{ bl_type: string | null; status: string | null }>
}

export type QuickViewReadiness = {
  ready: boolean
  blocking_count: number
  warning_count: number
  next_cutoff: string | null
  overdue_cutoff_count: number
  missing_vgm_count: number
}

const levelPresentation = {
  immediate: { label: 'Atender ahora', tone: 'red', icon: AlertTriangle },
  pending: { label: 'Pendiente', tone: 'amber', icon: Clock3 },
  visibility: { label: 'Seguimiento', tone: 'slate', icon: Info },
} as const

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
    <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="mt-1 text-sm font-semibold text-slate-900 tabular-nums dark:text-white">{value}</dd>
  </div>
}

function Section({ icon: Icon, title, children }: { icon: typeof Ship; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#0b1220]">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
      <Icon aria-hidden="true" className="h-4 w-4 text-slate-500 dark:text-slate-400" />{title}
    </h3>
    <div className="mt-3">{children}</div>
  </section>
}

/**
 * Resumen de una operación de la cola del Control Tower. Usa solo los datos
 * ya cargados por el tablero; la acción principal lleva al punto exacto donde
 * se resuelve.
 */
export function OperationQuickView({ item, booking, state, readiness, actionHref, bookingHref, siHref }: {
  item: OperationsWorkItem
  booking: QuickViewBooking
  state: BookingOperationalState
  readiness: QuickViewReadiness | null
  actionHref: string
  bookingHref: string
  siHref: string
}) {
  const level = levelPresentation[item.level]
  const containerTotal = booking.containers.reduce((total, row) => total + Number(row.quantity || 0), 0)
  const containerSummary = booking.containers
    .filter((row) => row.container_type && Number(row.quantity || 0) > 0)
    .map((row) => `${row.quantity} × ${row.container_type}`)
    .join(', ')
  const documentTypes = Array.from(new Set(booking.documents.map((doc) => doc.document_type).filter(Boolean))) as string[]

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2">
      <CostStatusBadge tone={level.tone} icon={level.icon}>{level.label}</CostStatusBadge>
      <OperationStatusBadge status={item.displayStatus} />
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Sin cambios hace <span className="font-semibold tabular-nums">{item.agingDays} d</span> · {item.lastChangeLabel}
      </span>
    </div>

    <CostNotice tone={level.tone} icon={level.icon}>
      <p className="font-semibold">{item.reason}</p>
      {item.detail && <p className="mt-0.5">{item.detail}</p>}
      {item.dueAt && <p className="mt-0.5 font-semibold">Vence: {formatDate(item.dueAt)}</p>}
    </CostNotice>

    <div className="flex flex-wrap gap-2">
      <Link href={actionHref} className={operationPrimaryButtonClass}>
        {item.nextAction}<ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
      <Link href={bookingHref} className={operationSecondaryButtonClass}>Abrir booking</Link>
      <Link href={siHref} className={operationSecondaryButtonClass}>Abrir SI {item.routingNumber}</Link>
    </div>

    <Section icon={Ship} title="Itinerario">
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Ruta" value={`${booking.origin || '—'} → ${booking.destination || '—'}`} />
        <Fact label="Naviera" value={booking.carrier || '—'} />
        <Fact label="Buque / viaje" value={[booking.vessel_name, booking.voyage].filter(Boolean).join(' / ') || '—'} />
        <Fact label={booking.actual_etd ? 'Salida real' : 'ETD'} value={formatDate(booking.actual_etd || booking.etd, '—')} />
        <Fact label={booking.actual_eta ? 'Arribo real' : 'ETA'} value={`${formatDate(booking.actual_eta || booking.eta, '—')}${state.eta.kind !== 'arrived' && state.eta.kind !== 'scheduled' ? ` · ${state.eta.label}` : ''}`} />
        <Fact label="Días libres restantes" value={booking.remaining_free_days != null ? String(booking.remaining_free_days) : booking.free_days != null ? `${booking.free_days} (sin iniciar)` : '—'} />
        <Fact label="Contenedores" value={containerTotal ? containerSummary : 'Sin asignar'} />
      </dl>
    </Section>

    <Section icon={ShieldCheck} title="Readiness">
      {readiness ? (
        <div className="flex flex-wrap gap-2">
          {readiness.ready
            ? <CostStatusBadge tone="emerald" icon={CheckCircle2}>Listo para embarcar</CostStatusBadge>
            : <CostStatusBadge tone="red" icon={AlertTriangle}>{readiness.blocking_count} bloqueo{readiness.blocking_count === 1 ? '' : 's'}</CostStatusBadge>}
          {readiness.missing_vgm_count > 0 && <CostStatusBadge tone="amber" icon={Clock3}>VGM pendiente en {readiness.missing_vgm_count}</CostStatusBadge>}
          {readiness.overdue_cutoff_count > 0 && <CostStatusBadge tone="red" icon={CalendarClock}>{readiness.overdue_cutoff_count} cut-off vencido{readiness.overdue_cutoff_count === 1 ? '' : 's'}</CostStatusBadge>}
          {readiness.next_cutoff && <CostStatusBadge tone="sky" icon={CalendarClock}>Próximo cut-off {formatDate(readiness.next_cutoff)}</CostStatusBadge>}
          {readiness.warning_count > 0 && <CostStatusBadge tone="slate" icon={Info}>{readiness.warning_count} advertencia{readiness.warning_count === 1 ? '' : 's'}</CostStatusBadge>}
        </div>
      ) : <p className="text-sm text-slate-500 dark:text-slate-400">Sin evaluación de readiness para este booking.</p>}
    </Section>

    <Section icon={FileText} title="Documentos">
      <div className="space-y-3 text-sm">
        {state.missingDocuments.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Faltan</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {state.missingDocuments.map((doc) => <CostStatusBadge key={doc.code} tone="amber" icon={Clock3}>{doc.label}</CostStatusBadge>)}
            </div>
          </div>
        ) : <CostStatusBadge tone="emerald" icon={CheckCircle2}>Documentación mínima completa</CostStatusBadge>}
        {documentTypes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Adjuntos</p>
            <p className="mt-1 text-slate-700 dark:text-slate-200">{documentTypes.join(' · ')}</p>
          </div>
        )}
        {booking.bills.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">BL</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {booking.bills.map((bill, index) => {
                const presentation = operationStatusPresentation(bill.status)
                const label = bill.status?.startsWith(bill.bl_type || '-') ? bill.status : `${bill.bl_type || 'BL'} · ${bill.status || 'Sin estado'}`
                return <CostStatusBadge key={`${bill.bl_type}-${index}`} tone={presentation.tone} icon={presentation.icon} className="whitespace-nowrap">{label}</CostStatusBadge>
              })}
            </div>
          </div>
        )}
      </div>
    </Section>
  </div>
}
