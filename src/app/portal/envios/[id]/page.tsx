'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Anchor,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  Package,
  Plane,
  Ship,
  Truck,
} from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import {
  resolveBookingDocumentSummary,
  type StructuredBillOfLading,
} from '@/src/lib/booking-document-summary'

type PortalBooking = {
  id: string
  booking_number: string | null
  carrier_booking: string | null
  carrier: string | null
  vessel_name: string | null
  voyage: string | null
  original_etd: string | null
  original_eta: string | null
  etd: string | null
  eta: string | null
  actual_etd: string | null
  actual_eta: string | null
  tracking_url: string | null
  shipment_status: string | null
  free_days: number | null
  remaining_free_days: number | null
  freight_terms: string | null
  release_type: string | null
  master_bl: string | null
  house_bl: string | null
  revision_count: number
  last_schedule_update: string | null
  container_count: number
  bills_of_lading: StructuredBillOfLading[]
}

type ShipmentDetail = {
  id: string
  routing_number: string
  aggregate_status: string
  origin_address: string | null
  destination_address: string | null
  created_at: string
  service_product: string | null
  origen: string | null
  destino: string | null
  quotation_number: string | null
  commodity: string | null
  incoterm: string | null
  peso_kg: number | null
  volumen_cbm: number | null
  bookings: PortalBooking[]
}

type PortalReadinessBooking = {
  booking_id: string
  booking_number: string | null
  status: string | null
  ready: boolean
  blocking_count: number
  document_requests: Array<{
    code: string
    label: string
    status: string
    due_at: string | null
  }>
  client_cutoffs: Array<{
    code: string
    label: string
    due_at: string
    timezone: string | null
    status: string
  }>
  vgm: {
    required: boolean
    container_count: number
    submitted_count: number
  }
}

type PortalReadiness = {
  shipment_id: string
  bookings: PortalReadinessBooking[]
}

const SERVICE_LABELS: Record<string, string> = {
  miami_lcl: 'LCL Miami',
  miami_air: 'Aéreo Miami',
  other_origin_fcl: 'Contenedor (FCL)',
  other_origin_lcl: 'LCL Internacional',
  other_origin_air: 'Aéreo Consolidado',
  usa_ltl_ftl: 'Terrestre USA',
  courier: 'Courier',
}

const SERVICE_ICON: Record<string, React.ReactNode> = {
  miami_lcl: <Ship className="h-5 w-5" />,
  miami_air: <Plane className="h-5 w-5" />,
  other_origin_fcl: <Ship className="h-5 w-5" />,
  other_origin_lcl: <Ship className="h-5 w-5" />,
  other_origin_air: <Plane className="h-5 w-5" />,
  usa_ltl_ftl: <Truck className="h-5 w-5" />,
  courier: <Package className="h-5 w-5" />,
}

const TIMELINE = [
  {
    key: 'coordinando',
    label: 'Coordinando',
    internal: ['Pendiente Validación', 'Validada', 'Asignado', 'Listo para Booking', 'En Booking', 'Booking Solicitado'],
  },
  {
    key: 'booking',
    label: 'Booking confirmado',
    internal: ['Booking Confirmado', 'Documentación Pendiente'],
  },
  {
    key: 'embarque',
    label: 'Listo para embarque',
    internal: ['Listo para Embarque'],
  },
  {
    key: 'transito',
    label: 'En tránsito',
    internal: ['Embarcado', 'En Tránsito'],
  },
  {
    key: 'arribado',
    label: 'Llegó a Honduras',
    internal: ['Arribado', 'Finalizado'],
  },
]

function getTimelineIndex(status?: string | null) {
  for (let index = TIMELINE.length - 1; index >= 0; index -= 1) {
    if (TIMELINE[index].internal.includes(status || '')) return index
  }
  return -1
}

function fmt(date: string | null) {
  if (!date) return '—'
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtDateTime(date: string | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-900 dark:text-white">{value}</span>
    </div>
  )
}

function BookingTimeline({ status }: { status: string | null }) {
  const currentStep = getTimelineIndex(status)

  return (
    <ol className="grid gap-2 sm:grid-cols-5">
      {TIMELINE.map((step, index) => {
        const complete = index < currentStep
        const current = index === currentStep
        return (
          <li
            key={step.key}
            className={`rounded-xl border px-3 py-2 text-xs ${
              complete
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
                : current
                  ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300'
                  : 'border-slate-200 text-slate-400 dark:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {complete
                ? <CheckCircle2 className="h-3.5 w-3.5" />
                : current
                  ? <Clock className="h-3.5 w-3.5" />
                  : <Circle className="h-3.5 w-3.5" />}
              <span className="font-semibold">{step.label}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function BookingCard({
  booking,
  index,
  readiness,
}: {
  booking: PortalBooking
  index: number
  readiness?: PortalReadinessBooking
}) {
  const documents = resolveBookingDocumentSummary(
    { master_bl: booking.master_bl, house_bl: booking.house_bl },
    booking.bills_of_lading
  )
  const bookingLabel = booking.booking_number || booking.carrier_booking || `Booking ${index + 1}`

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">Booking {index + 1}</p>
            <h2 className="font-mono text-lg font-bold text-slate-900 dark:text-white">
              {bookingLabel}
            </h2>
            {booking.container_count > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                {booking.container_count} contenedor{booking.container_count === 1 ? '' : 'es'} asignado{booking.container_count === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
            {booking.shipment_status || 'Sin estado'}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {readiness && (
          <section
            className={`rounded-xl border p-4 ${
              readiness.ready
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Preparación del embarque
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {readiness.ready
                    ? 'La operación cumple los requisitos previos.'
                    : `${readiness.blocking_count} solicitud(es) pendiente(s).`}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  readiness.ready
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {readiness.ready ? 'LISTO' : 'EN PREPARACIÓN'}
              </span>
            </div>

            {readiness.document_requests.some(
              (request) =>
                request.status !== 'COMPLETED' &&
                request.status !== 'NOT_APPLICABLE'
            ) && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Documentos solicitados
                </p>
                <ul className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {readiness.document_requests
                    .filter(
                      (request) =>
                        request.status !== 'COMPLETED' &&
                        request.status !== 'NOT_APPLICABLE'
                    )
                    .map((request) => (
                      <li key={request.code}>• {request.label}</li>
                    ))}
                </ul>
              </div>
            )}

            {readiness.client_cutoffs.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Fechas límite relevantes
                </p>
                <div className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {readiness.client_cutoffs.map((cutoff) => (
                    <p key={`${cutoff.code}-${cutoff.due_at}`}>
                      {cutoff.label}: {fmtDateTime(cutoff.due_at)}
                      {cutoff.timezone ? ` · ${cutoff.timezone}` : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {readiness.vgm.required && (
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                VGM enviada: {readiness.vgm.submitted_count}/
                {readiness.vgm.container_count} contenedores
              </p>
            )}
          </section>
        )}

        {booking.last_schedule_update && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <p className="font-semibold">Itinerario actualizado</p>
            <p className="mt-0.5 text-xs">
              Última actualización: {fmtDateTime(booking.last_schedule_update)}
            </p>
          </div>
        )}
        <BookingTimeline status={booking.shipment_status} />

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl bg-slate-50 px-4 dark:bg-slate-800/40">
            <div className="flex items-center gap-2 border-b border-slate-200 py-3 dark:border-slate-700">
              <Calendar className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold">Fechas</h3>
            </div>
            <InfoRow label="ETD original" value={fmt(booking.original_etd)} />
            <InfoRow label="ETD estimado" value={fmt(booking.etd)} />
            <InfoRow label="ETA original" value={fmt(booking.original_eta)} />
            <InfoRow label="ETA estimado" value={fmt(booking.eta)} />
            {booking.actual_etd && <InfoRow label="ETD real" value={fmt(booking.actual_etd)} />}
            {booking.actual_eta && <InfoRow label="ETA real" value={fmt(booking.actual_eta)} />}
            <InfoRow label="Free days" value={booking.free_days} />
            <InfoRow label="Free days restantes" value={booking.remaining_free_days} />
          </section>

          <section className="rounded-xl bg-slate-50 px-4 dark:bg-slate-800/40">
            <div className="flex items-center gap-2 border-b border-slate-200 py-3 dark:border-slate-700">
              <Anchor className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold">Transporte</h3>
            </div>
            <InfoRow label="Carrier" value={booking.carrier} />
            <InfoRow label="Carrier booking" value={booking.carrier_booking} />
            <InfoRow label="Vessel / Vuelo" value={booking.vessel_name} />
            <InfoRow label="Voyage" value={booking.voyage} />
            <InfoRow label="Flete" value={booking.freight_terms} />
          </section>

          <section className="rounded-xl bg-slate-50 px-4 dark:bg-slate-800/40">
            <div className="flex items-center gap-2 border-b border-slate-200 py-3 dark:border-slate-700">
              <FileText className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold">Documentos</h3>
            </div>
            <InfoRow
              label="Master BL"
              value={documents.master
                ? `${documents.master.number}${documents.master.status ? ` · ${documents.master.status}` : ''}`
                : 'Pendiente'}
            />
            {documents.houses.length === 0 ? (
              <InfoRow label="House BL" value="Pendiente" />
            ) : (
              documents.houses.map((house, houseIndex) => (
                <InfoRow
                  key={house.id || `${house.number}-${houseIndex}`}
                  label={documents.houses.length > 1 ? `House BL ${houseIndex + 1}` : 'House BL'}
                  value={`${house.number}${house.status ? ` · ${house.status}` : ''}`}
                />
              ))
            )}
            <InfoRow
              label="Tipo de liberación"
              value={documents.master?.releaseType || booking.release_type}
            />
          </section>
        </div>

        {booking.tracking_url && (
          <a
            href={booking.tracking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300"
          >
            <ExternalLink className="h-4 w-4" />
            Tracking de este booking
          </a>
        )}
      </div>
    </article>
  )
}

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [shipment, setShipment] = useState<ShipmentDetail | null>(null)
  const [readiness, setReadiness] = useState<PortalReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return

    async function load() {
      setLoading(true)
      const [{ data, error }, readinessResult] = await Promise.all([
        supabase.rpc('get_client_shipment_detail_v2', {
          p_shipment_id: id,
        }),
        supabase.rpc('get_client_booking_readiness_v1', {
          p_shipment_id: id,
        }),
      ])
      const row = (data as ShipmentDetail[] | null)?.[0]

      if (error || !row) {
        setNotFound(true)
        setShipment(null)
      } else {
        setShipment({ ...row, bookings: row.bookings || [] })
        setReadiness(
          readinessResult.error
            ? null
            : (readinessResult.data as PortalReadiness)
        )
        setNotFound(false)
      }
      setLoading(false)
    }

    void load()
  }, [id])

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-6 w-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    )
  }

  if (notFound || !shipment) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Ship className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" />
        <p className="font-semibold text-slate-700 dark:text-slate-300">Envío no encontrado</p>
        <Link href="/portal/envios" className="mt-4 text-sm text-blue-600 hover:underline dark:text-blue-400">
          Volver a mis envíos
        </Link>
      </div>
    )
  }

  const service = shipment.service_product || ''

  return (
    <div className="space-y-5">
      <Link
        href="/portal/envios"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Mis envíos
      </Link>

      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">
            {SERVICE_ICON[service] || <Ship className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-400">
              {SERVICE_LABELS[service] || 'Envío'} · {shipment.quotation_number || shipment.routing_number}
            </p>
            <h1 className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-white">
              {shipment.routing_number}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {shipment.origen || '—'} → {shipment.destino || '—'}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {shipment.aggregate_status}
          </span>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          {shipment.bookings.length === 0
            ? 'Esta operación aún no tiene bookings.'
            : `${shipment.bookings.length} booking${shipment.bookings.length === 1 ? '' : 's'} relacionado${shipment.bookings.length === 1 ? '' : 's'}.`}
        </p>
      </header>

      {shipment.bookings.map((booking, index) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          index={index}
          readiness={readiness?.bookings.find(
            (item) => item.booking_id === booking.id
          )}
        />
      ))}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Carga de la operación</h2>
          </div>
        </div>
        <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
          <InfoRow label="Mercancía" value={shipment.commodity} />
          <InfoRow label="Incoterm" value={shipment.incoterm} />
          <InfoRow label="Peso" value={shipment.peso_kg ? `${shipment.peso_kg.toLocaleString('es-HN')} kg` : null} />
          <InfoRow label="Volumen" value={shipment.volumen_cbm ? `${shipment.volumen_cbm.toLocaleString('es-HN')} CBM` : null} />
          <InfoRow label="Origen" value={shipment.origen} />
          <InfoRow label="Destino" value={shipment.destino} />
        </div>
      </section>
    </div>
  )
}
