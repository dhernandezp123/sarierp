'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  Route,
  Ship,
} from 'lucide-react'
import { useUser } from '@/src/hooks/useUser'
import {
  buildAgent360Snapshot,
  type Agent360Snapshot,
  type AgentBooking,
  type AgentQuoteActivity,
  type AgentQuotation,
  type AgentShipment,
} from '@/src/lib/agent-360'
import { formatDate, formatDateTime } from '@/src/lib/format'
import { canAccessPath } from '@/src/lib/permissions'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, secondaryButtonClass } from '@/src/lib/ui-classes'

type ClientRelation = { nombre: string | null }

type QuotationRow = {
  id: string
  quotation_number: string | null
  status: string | null
  origen: string | null
  destino: string | null
  puerto_origen: string | null
  puerto_destino: string | null
  created_at: string | null
  valid_until: string | null
  clientes: ClientRelation | ClientRelation[] | null
}

type ProviderRow = {
  id: string
  nombre: string
  tipo: string
  moneda: string
  terminos_pago: number
  is_active: boolean
}

const EMPTY_SNAPSHOT: Agent360Snapshot = buildAgent360Snapshot({
  agentQuotes: [],
  quotations: [],
  shipments: [],
  bookings: [],
})

function firstRelation<T>(relation: T | T[] | null | undefined) {
  return Array.isArray(relation) ? relation[0] || null : relation || null
}

function statusClass(status: string | null | undefined) {
  if (status === 'Ganada' || status === 'Finalizado') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  }
  if (status === 'Perdida' || status === 'Cancelado') {
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }
  if (status?.includes('Pendiente') || status === 'Booking Solicitado') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  }
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
}

function quoteHref(role: string | null | undefined, quotationId: string) {
  if (role === 'Pricing') return `/pricing-comparison?quotation=${quotationId}`
  const detail = `/quotations/${quotationId}`
  return canAccessPath(role, detail) ? detail : null
}

export function Agent360Panel({ agentId }: { agentId: string }) {
  const { profile } = useUser()
  const role = profile?.rol
  const [snapshot, setSnapshot] = useState<Agent360Snapshot>(EMPTY_SNAPSHOT)
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const quotesResult = await supabase
        .from('agent_quotes')
        .select('quotation_id, is_selected, created_at, deleted_at, carrier, etd, valid_until')
        .eq('agent_id', agentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (quotesResult.error) throw quotesResult.error

      const agentQuotes = (quotesResult.data || []) as AgentQuoteActivity[]
      const quotationIds = [...new Set(
        agentQuotes.flatMap((quote) => quote.quotation_id ? [quote.quotation_id] : [])
      )]
      const selectedQuotationIds = [...new Set(
        agentQuotes.flatMap((quote) => quote.is_selected && quote.quotation_id ? [quote.quotation_id] : [])
      )]

      let quotations: AgentQuotation[] = []
      if (quotationIds.length > 0) {
        const result = await supabase
          .from('quotations')
          .select('id, quotation_number, status, origen, destino, puerto_origen, puerto_destino, created_at, valid_until, clientes(nombre)')
          .in('id', quotationIds)
          .is('deleted_at', null)

        if (result.error) throw result.error
        quotations = ((result.data || []) as unknown as QuotationRow[]).map((quotation) => ({
          id: quotation.id,
          quotation_number: quotation.quotation_number,
          status: quotation.status,
          origin: quotation.origen,
          destination: quotation.destino,
          port_origin: quotation.puerto_origen,
          port_destination: quotation.puerto_destino,
          created_at: quotation.created_at,
          valid_until: quotation.valid_until,
          client_name: firstRelation(quotation.clientes)?.nombre || null,
        }))
      }

      let shipments: AgentShipment[] = []
      if (selectedQuotationIds.length > 0) {
        const result = await supabase
          .from('shipments')
          .select('id, shipment_number, quotation_id, shipping_instruction_id, operational_status, origin, destination, closed_at, created_at, updated_at')
          .in('quotation_id', selectedQuotationIds)
          .order('updated_at', { ascending: false })

        if (result.error) throw result.error
        shipments = (result.data || []) as AgentShipment[]
      }

      let bookings: AgentBooking[] = []
      const shipmentIds = shipments.map((shipment) => shipment.id)
      if (shipmentIds.length > 0) {
        const result = await supabase
          .from('bookings')
          .select('id, shipment_id, booking_number, carrier_booking, carrier, shipment_status, etd, eta, actual_etd, actual_eta, updated_at')
          .in('shipment_id', shipmentIds)

        if (result.error) throw result.error
        bookings = (result.data || []) as AgentBooking[]
      }

      if (canAccessPath(role, '/suppliers')) {
        const result = await supabase
          .from('proveedores')
          .select('id, nombre, tipo, moneda, terminos_pago, is_active')
          .eq('agente_id', agentId)
          .order('is_active', { ascending: false })

        if (!result.error) setProviders((result.data || []) as ProviderRow[])
      } else {
        setProviders([])
      }

      setSnapshot(buildAgent360Snapshot({ agentQuotes, quotations, shipments, bookings }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la vista 360 del agente.')
    } finally {
      setLoading(false)
    }
  }, [agentId, role])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return (
    <section className={cardClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Agent 360
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            Uso comercial y operación vinculada
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Consolida ofertas, selecciones, expedientes y lanes mediante la relación canónica
            del agente y respeta la visibilidad de cada rol. No calcula un scoring ni atribuye
            operaciones por coincidencia de nombre.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className={secondaryButtonClass}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">No se pudo cargar Agent 360</p>
          <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold text-rose-700 underline dark:text-rose-300">
            Reintentar
          </button>
        </div>
      ) : loading ? (
        <div className="mt-5 grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={BriefcaseBusiness} label="Cotizaciones" value={snapshot.metrics.offeredQuotations} detail="con oferta del agente" />
            <MetricCard icon={CheckCircle2} label="Seleccionadas" value={snapshot.metrics.selectedQuotations} detail={`${snapshot.metrics.wonQuotations} ganadas`} />
            <MetricCard icon={Ship} label="Expedientes" value={snapshot.metrics.activeShipments} detail={`${snapshot.metrics.shipments} totales vinculados`} />
            <MetricCard icon={CalendarClock} label="Bookings" value={snapshot.metrics.bookings} detail="visibles para tu rol" />
            <MetricCard icon={Clock3} label="Última actividad" value={snapshot.metrics.lastActivityAt ? formatDateTime(snapshot.metrics.lastActivityAt) : 'Sin actividad'} detail="actualización operativa" compact />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.5fr)]">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Expedientes vinculados</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Solo se atribuyen al agente cuando su tarifa quedó seleccionada para la cotización.
              </p>
              {snapshot.shipments.length === 0 ? (
                <EmptyMessage className="mt-3" text="Aún no hay shipments visibles derivados de una tarifa seleccionada de este agente." />
              ) : (
                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2.5">Expediente</th>
                        <th className="px-3 py-2.5">Cliente / ruta</th>
                        <th className="px-3 py-2.5">Estado</th>
                        <th className="px-3 py-2.5">Booking / fechas</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.shipments.slice(0, 10).map((shipment) => {
                        const booking = shipment.bookings[0]
                        const href = shipment.shipping_instruction_id
                          ? `/operations/shipping-instructions/${shipment.shipping_instruction_id}`
                          : null
                        const canOpen = href ? canAccessPath(role, href) : false
                        return (
                          <tr key={shipment.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="px-3 py-3">
                              <p className="font-semibold text-slate-900 dark:text-white">{shipment.shipment_number}</p>
                              <p className="mt-0.5 text-xs text-slate-400">{shipment.quotation?.quotation_number || 'Sin cotización visible'}</p>
                            </td>
                            <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                              <p>{shipment.quotation?.client_name || 'Cliente no disponible'}</p>
                              <p className="mt-0.5 text-xs text-slate-400">{shipment.origin || 'Origen pendiente'} → {shipment.destination || 'Destino pendiente'}</p>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(shipment.operational_status)}`}>
                                {shipment.operational_status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                              <p>{booking?.booking_number || booking?.carrier_booking || 'Sin booking visible'}</p>
                              <p className="mt-0.5 text-xs text-slate-400">ETD {formatDate(booking?.actual_etd || booking?.etd)} · ETA {formatDate(booking?.actual_eta || booking?.eta)}</p>
                            </td>
                            <td className="px-3 py-3 text-right">
                              {canOpen && href ? (
                                <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                                  Abrir <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Lanes utilizados</h3>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Derivados de selecciones y shipments, no de tarifas base.</p>
              {snapshot.lanes.length === 0 ? (
                <EmptyMessage className="mt-3" text="Todavía no hay lanes con uso verificable." />
              ) : (
                <div className="mt-3 space-y-2">
                  {snapshot.lanes.slice(0, 7).map((lane) => (
                    <div key={lane.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{lane.origin} → {lane.destination}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {lane.shipments} shipment{lane.shipments === 1 ? '' : 's'} · {lane.selections} selección{lane.selections === 1 ? '' : 'es'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Cotizaciones recientes</h3>
              {snapshot.quotations.length === 0 ? (
                <EmptyMessage className="mt-3" text="Este agente aún no tiene ofertas vinculadas mediante agent_id." />
              ) : (
                <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700/60">
                  {snapshot.quotations.slice(0, 8).map((quotation) => {
                    const href = quoteHref(role, quotation.id)
                    return (
                      <div key={quotation.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900 dark:text-white">{quotation.quotation_number || 'Sin número'}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${quotation.selected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                              {quotation.selected ? 'Seleccionada' : 'Ofertada'}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(quotation.status)}`}>
                              {quotation.status || 'Sin estado'}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {quotation.client_name || 'Cliente no disponible'} · {quotation.port_origin || quotation.origin || 'Origen pendiente'} → {quotation.port_destination || quotation.destination || 'Destino pendiente'}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">Oferta {formatDate(quotation.quoted_at)} · Vigencia {formatDate(quotation.agent_valid_until || quotation.valid_until)}</p>
                        </div>
                        {href ? (
                          <Link href={href} className="shrink-0 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                            Ver cotización
                          </Link>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Vínculo financiero</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">La contraparte financiera permanece separada del catálogo operativo.</p>
              {canAccessPath(role, '/suppliers') ? (
                providers.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {providers.map((provider) => (
                      <Link key={provider.id} href={`/suppliers/${provider.id}`} className="block rounded-xl border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-700/60 dark:hover:border-blue-800 dark:hover:bg-blue-950/20">
                        <p className="font-semibold text-slate-900 dark:text-white">{provider.nombre}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{provider.tipo} · {provider.moneda} · {provider.terminos_pago} días</p>
                        {!provider.is_active && <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">Proveedor inactivo</p>}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyMessage className="mt-3" text="No hay un proveedor financiero vinculado a este agente." />
                )
              ) : (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  Finanzas administra pagos y términos desde Proveedores; esta vista no expone esos datos a tu rol.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  compact = false,
}: {
  icon: typeof BriefcaseBusiness
  label: string
  value: number | string
  detail: string
  compact?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700/60 dark:bg-slate-900/50">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 font-bold text-slate-900 dark:text-white ${compact ? 'text-base' : 'text-2xl'}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  )
}

function EmptyMessage({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400 ${className}`}>
      {text}
    </div>
  )
}
