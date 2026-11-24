'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, ClipboardCheck, Clock3, Layers, PackageCheck, Search, ShieldOff } from 'lucide-react'

import { useUser } from '../../../hooks/useUser'
import { supabase } from '../../../lib/supabase/client'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { Pagination } from '@/src/components/ui/Pagination'
import { FinanceEmptyState, FinanceMetric, FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { CostStatusBadge, financialStatusTone, operationalStatusTone } from '@/src/components/pricing/CostStatus'
import { aggregateBookingStatus } from '@/src/lib/booking-status'
import { operationsAreComplete } from '@/src/lib/billing-readiness'
import { cardClass, fieldClassSm } from '@/src/lib/ui-classes'
import { cn } from '@/src/lib/utils'

type CostValidationBooking = {
  id: string
  booking_number: string | null
  carrier_booking: string | null
  carrier: string | null
  shipment_status: string | null
}

type ShipmentCostValidationItem = {
  id: string
  shipment_number: string
  operational_status: string | null
  closed_at: string | null
  bookings: CostValidationBooking[]
  quotation:
    | {
        id: string
        quotation_number: string | null
        status: string | null
        financial_validation_status: string | null
        cliente?: {
          nombre: string | null
        } | null
      }
    | null
}

type Focus = 'pending' | 'ready' | 'validated' | 'all'

const focusTabs: { id: Focus; label: string }[] = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'ready', label: 'Listas para revisar' },
  { id: 'validated', label: 'Validadas' },
  { id: 'all', label: 'Todas' },
]

const emptyByFocus: Record<Focus, { title: string; description: string }> = {
  pending: { title: 'Sin validaciones pendientes', description: 'Todas las operaciones vinculadas tienen sus costos validados.' },
  ready: { title: 'Sin operaciones listas para revisar', description: 'Ninguna operación cerrada tiene la validación de costos pendiente.' },
  validated: { title: 'Sin operaciones validadas', description: 'Todavía no hay operaciones con costos validados por Finanzas.' },
  all: { title: 'Sin operaciones vinculadas', description: 'No hay operaciones vinculadas a cotizaciones disponibles.' },
}

const bookingLabel = (bookings: CostValidationBooking[]) => bookings.length === 0
  ? 'Sin bookings'
  : bookings.length === 1
    ? bookings[0].booking_number || bookings[0].carrier_booking || 'Pendiente'
    : `${bookings.length} bookings`

const carriersOf = (bookings: CostValidationBooking[]) =>
  Array.from(new Set(bookings.map((booking) => booking.carrier).filter(Boolean))).join(', ') || 'N/A'

export default function CostValidationPage() {
  const { profile, loading: userLoading } = useUser()
  const role = profile?.rol || ''
  const isAdmin = role === 'Admin'
  const isFinance = role === 'Finanzas' || role === 'Contabilidad'
  const canViewCostValidation = isAdmin || isFinance

  const [shipments, setShipments] = useState<ShipmentCostValidationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [focus, setFocus] = useState<Focus>('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    if (userLoading) return

    if (!canViewCostValidation) {
      setLoading(false)
      return
    }

    fetchShipments()
  }, [userLoading, canViewCostValidation])

  const fetchShipments = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('shipments')
      .select(`
        id,
        shipment_number,
        operational_status,
        closed_at,
        shipping_instruction:shipping_instructions!inner (
          deleted_at
        ),
        bookings (
          id,
          booking_number,
          carrier_booking,
          carrier,
          shipment_status
        ),
        quotation:quotations!inner (
          id,
          quotation_number,
          status,
          financial_validation_status,
          cliente:clientes (
            nombre
          )
        )
      `)
      .is('quotation.deleted_at', null)
      .is('shipping_instruction.deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    const normalizedShipments = (data || [])
      .map((shipment) => {
        const quotation = Array.isArray(shipment.quotation)
          ? shipment.quotation[0] ?? null
          : shipment.quotation

        return {
          ...shipment,
          quotation: quotation
            ? {
                ...quotation,
                cliente: Array.isArray(quotation.cliente)
                  ? quotation.cliente[0] ?? null
                  : quotation.cliente,
              }
            : null,
        }
      })
      .filter((shipment) => shipment.quotation && shipment.shipment_number)

    setShipments(normalizedShipments)
    setLoading(false)
  }

  const rows = useMemo(() => shipments.map((shipment) => {
    const operational = aggregateBookingStatus(shipment.bookings, shipment.operational_status || 'Sin bookings')
    const validated = shipment.quotation?.financial_validation_status === 'Validado'
    return { shipment, operational, validated, ready: !validated && operationsAreComplete([shipment]) }
  }), [shipments])

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter((row) => !row.validated).length,
    ready: rows.filter((row) => row.ready).length,
    validated: rows.filter((row) => row.validated).length,
  }), [rows])

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es')
    return rows.filter((row) => {
      if (focus === 'pending' && row.validated) return false
      if (focus === 'ready' && !row.ready) return false
      if (focus === 'validated' && !row.validated) return false
      if (!term) return true
      const { shipment } = row
      return [
        shipment.shipment_number,
        shipment.quotation?.quotation_number,
        shipment.quotation?.cliente?.nombre,
        ...shipment.bookings.flatMap((booking) => [booking.booking_number, booking.carrier_booking, booking.carrier]),
      ].some((value) => value?.toLocaleLowerCase('es').includes(term))
    })
  }, [rows, focus, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const header = <FinancePageHeader
    eyebrow="Finanzas · Costos"
    icon={ClipboardCheck}
    title="Validación de Costos Operativos"
    description="Compara costos cotizados contra facturas reales de proveedores por operación."
  />

  if (userLoading || loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Cargando validación de costos">
        {header}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0b1220]" />)}
        </div>
        <div className={cardClass}>
          <TableSkeleton rows={5} cols={8} />
        </div>
      </div>
    )
  }

  if (!canViewCostValidation) {
    return (
      <div className="space-y-6">
        {header}
        <FinanceEmptyState
          icon={ShieldOff}
          title="Acceso restringido"
          description="Solo usuarios con rol Finanzas, Contabilidad o Administrador pueden acceder a este módulo."
        />
      </div>
    )
  }

  const empty = search.trim()
    ? { title: 'Sin coincidencias', description: 'Ninguna operación coincide con la búsqueda en esta vista.' }
    : emptyByFocus[focus]

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <FinanceMetric label="Pendientes de validar" value={String(counts.pending)} detail="Operaciones con costos sin validar" icon={Clock3} tone="amber" />
        <FinanceMetric label="Listas para revisar" value={String(counts.ready)} detail="Operación cerrada, validación pendiente" icon={PackageCheck} tone="sky" />
        <FinanceMetric label="Validadas" value={String(counts.validated)} detail="Costos confirmados por Finanzas" icon={CheckCircle2} tone="emerald" />
        <FinanceMetric label="Operaciones vinculadas" value={String(counts.all)} detail="Con cotización e instrucción activa" icon={Layers} tone="slate" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]" aria-labelledby="cost-validation-list">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
          <div className="min-w-0">
            <h2 id="cost-validation-list" className="text-base font-semibold text-slate-900 dark:text-white">Operaciones vinculadas a cotizaciones</h2>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
              {focusTabs.map((tab) => {
                const active = focus === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { setFocus(tab.id); setPage(1) }}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
                      active
                        ? 'border-[#B3282D] bg-[#B3282D] text-white dark:border-rose-400 dark:bg-rose-500/20 dark:text-rose-100'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    )}
                  >
                    {tab.label}
                    <span className={cn('rounded-full px-1.5 py-px text-[11px] tabular-nums', active ? 'bg-white/20' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}>{counts[tab.id]}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Buscar operación</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              placeholder="RT, booking, cotización, cliente…"
              className={`${fieldClassSm} pl-9`}
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="p-4 sm:p-5">
            <FinanceEmptyState icon={ClipboardCheck} title={empty.title} description={empty.description}>
              {(search.trim() || focus !== 'all') && (
                <button type="button" onClick={() => { setSearch(''); setFocus('all'); setPage(1) }} className="mt-5 text-sm font-semibold text-[#B3282D] underline-offset-4 hover:underline dark:text-rose-300">
                  Mostrar todas
                </button>
              )}
            </FinanceEmptyState>
          </div>
        ) : (
          <>
            <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla de operaciones, desplazamiento horizontal">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-900/60">
                  <tr>
                    {['RT', 'Booking', 'Cotización', 'Cliente', 'Carrier', 'Estado operativo', 'Estado financiero'].map((label) => (
                      <th key={label} scope="col" className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acción</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pageRows.map(({ shipment, operational, validated, ready }) => {
                    const quotation = shipment.quotation
                    const href = quotation?.id ? `/cost-validation/${quotation.id}` : null
                    const financial = quotation?.financial_validation_status || 'Pendiente'

                    return (
                      <tr key={shipment.id} className={cn('transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40', ready && 'bg-sky-50/40 dark:bg-sky-950/10')}>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          {href ? <Link href={href} className="text-[#B3282D] underline-offset-4 hover:underline dark:text-rose-300">{shipment.shipment_number || 'N/A'}</Link> : shipment.shipment_number || 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">{bookingLabel(shipment.bookings)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{quotation?.quotation_number || 'Sin número'}</td>
                        <td className="max-w-56 px-4 py-3 text-slate-700 dark:text-slate-300"><span className="line-clamp-2">{quotation?.cliente?.nombre || 'Sin cliente'}</span></td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{carriersOf(shipment.bookings)}</td>
                        <td className="whitespace-nowrap px-4 py-3"><CostStatusBadge tone={operationalStatusTone(operational)}>{operational}</CostStatusBadge></td>
                        <td className="px-4 py-3">
                          <CostStatusBadge tone={financialStatusTone(financial)} icon={validated ? CheckCircle2 : Clock3}>{financial}</CostStatusBadge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {href ? (
                            <Link
                              href={href}
                              className={cn(
                                'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
                                validated
                                  ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                                  : 'border border-rose-200 bg-rose-50 text-[#B3282D] hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-950/50'
                              )}
                            >
                              {validated ? 'Ver costos' : 'Validar costos'}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                            </Link>
                          ) : <span className="text-xs text-slate-400">Sin cotización</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
            />
          </>
        )}
      </section>
    </div>
  )
}
