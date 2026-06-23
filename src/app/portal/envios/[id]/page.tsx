'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Ship, Plane, Truck, Package,
  MapPin, Calendar, Anchor, FileText, ExternalLink,
  CheckCircle2, Circle, Clock,
} from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'

type ShipmentDetail = {
  id: string
  routing_number: string
  shipment_status: string
  carrier: string | null
  etd: string | null
  eta: string | null
  actual_etd: string | null
  actual_eta: string | null
  vessel_name: string | null
  voyage: string | null
  tracking_url: string | null
  master_bl: string | null
  house_bl: string | null
  origin_address: string | null
  destination_address: string | null
  freight_terms: string | null
  quotation: {
    service_product: string | null
    origen: string | null
    destino: string | null
    commodity: string | null
    incoterm: string | null
    quotation_number: string | null
    peso_kg: number | null
    volumen_cbm: number | null
  } | null
}

type ClientShipmentRpcRow = Omit<ShipmentDetail, 'quotation'> & {
  service_product: string | null
  origen: string | null
  destino: string | null
  commodity: string | null
  incoterm: string | null
  quotation_number: string | null
  peso_kg: number | null
  volumen_cbm: number | null
}

const SERVICE_LABELS: Record<string, string> = {
  miami_lcl:         'LCL Miami',
  miami_air:         'Aéreo Miami',
  other_origin_fcl:  'Contenedor (FCL)',
  other_origin_lcl:  'LCL Internacional',
  other_origin_air:  'Aéreo Consolidado',
  usa_ltl_ftl:       'Terrestre USA',
  courier:           'Courier',
}

const SERVICE_ICON: Record<string, React.ReactNode> = {
  miami_lcl:         <Ship className="h-5 w-5" />,
  miami_air:         <Plane className="h-5 w-5" />,
  other_origin_fcl:  <Ship className="h-5 w-5" />,
  other_origin_lcl:  <Ship className="h-5 w-5" />,
  other_origin_air:  <Plane className="h-5 w-5" />,
  usa_ltl_ftl:       <Truck className="h-5 w-5" />,
  courier:           <Package className="h-5 w-5" />,
}

const SERVICE_COLOR: Record<string, string> = {
  miami_lcl:         'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  miami_air:         'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300',
  other_origin_fcl:  'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  other_origin_lcl:  'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300',
  other_origin_air:  'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300',
  usa_ltl_ftl:       'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
  courier:           'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
}

// Timeline: maps each milestone to the internal statuses that mark it as reached
const TIMELINE = [
  {
    key: 'coordinando',
    label: 'Coordinando',
    desc: 'Procesando documentación y reserva',
    internal: ['Pendiente Validación', 'Validada', 'Asignado', 'Listo para Booking', 'En Booking', 'Booking Solicitado'],
  },
  {
    key: 'booking',
    label: 'Booking confirmado',
    desc: 'Espacio reservado en la naviera / aerolínea',
    internal: ['Booking Confirmado', 'Documentación Pendiente'],
  },
  {
    key: 'embarque',
    label: 'Listo para embarque',
    desc: 'Documentación completa, carga en terminal',
    internal: ['Listo para Embarque'],
  },
  {
    key: 'transito',
    label: 'En tránsito',
    desc: 'Carga embarcada y en camino',
    internal: ['Embarcado', 'En Tránsito'],
  },
  {
    key: 'arribado',
    label: 'Llegó a Honduras',
    desc: 'Carga en puerto / aeropuerto de destino',
    internal: ['Arribado', 'Finalizado'],
  },
]

function getTimelineIndex(status: string): number {
  for (let i = TIMELINE.length - 1; i >= 0; i--) {
    if (TIMELINE[i].internal.includes(status)) return i
  }
  return -1
}

function fmt(date: string | null, withYear = false) {
  if (!date) return '—'
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-HN', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-900 dark:text-white">{value}</span>
    </div>
  )
}

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [shipment, setShipment] = useState<ShipmentDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_client_shipments', {
        p_shipment_id: id,
        p_include_completed: true,
      })

      const row = (data as ClientShipmentRpcRow[] | null)?.[0]
      if (error || !row) {
        setNotFound(true)
      } else {
        setShipment({
          ...row,
          quotation: {
            service_product: row.service_product,
            origen: row.origen,
            destino: row.destino,
            commodity: row.commodity,
            incoterm: row.incoterm,
            quotation_number: row.quotation_number,
            peso_kg: row.peso_kg,
            volumen_cbm: row.volumen_cbm,
          },
        })
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
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
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

  const sp = shipment.quotation?.service_product ?? ''
  const currentStep = getTimelineIndex(shipment.shipment_status)

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href="/portal/envios"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Mis envíos
      </Link>

      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="px-5 py-5">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${SERVICE_COLOR[sp] ?? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
              {SERVICE_ICON[sp] ?? <Ship className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                {SERVICE_LABELS[sp] ?? 'Envío'} · {shipment.quotation?.quotation_number ?? shipment.routing_number}
              </p>
              <h1 className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-white">
                {shipment.routing_number}
              </h1>
              {shipment.quotation?.origen && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {shipment.quotation.origen}
                  <span className="text-slate-300 dark:text-slate-600">→</span>
                  {shipment.quotation.destino ?? '—'}
                </p>
              )}
            </div>
          </div>

          {/* Current status badge */}
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-2 dark:border-blue-900/30 dark:bg-blue-950/20">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              {shipment.shipment_status}
            </span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">Estado del envío</h2>
        </div>
        <div className="px-5 py-5">
          <ol className="relative space-y-0">
            {TIMELINE.map((step, i) => {
              const done    = i < currentStep
              const current = i === currentStep
              return (
                <li key={step.key} className="flex gap-4 pb-6 last:pb-0">
                  {/* Connector line */}
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition ${
                      done    ? 'border-emerald-500 bg-emerald-500'
                      : current ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                    }`}>
                      {done
                        ? <CheckCircle2 className="h-4 w-4 text-white" />
                        : current
                          ? <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                          : <Circle className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                      }
                    </div>
                    {i < TIMELINE.length - 1 && (
                      <div className={`mt-1 w-0.5 flex-1 min-h-[20px] ${done ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pt-1 pb-2">
                    <p className={`text-sm font-semibold ${
                      done    ? 'text-emerald-700 dark:text-emerald-400'
                      : current ? 'text-blue-700 dark:text-blue-300'
                      : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      {step.label}
                    </p>
                    {(done || current) && (
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{step.desc}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      {/* Dates */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Fechas</h2>
          </div>
        </div>
        <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
          <InfoRow label="ETD estimado" value={fmt(shipment.etd, true)} />
          <InfoRow label="ETA estimado" value={fmt(shipment.eta, true)} />
          {shipment.actual_etd && <InfoRow label="ETD real" value={fmt(shipment.actual_etd, true)} />}
          {shipment.actual_eta && <InfoRow label="ETA real" value={fmt(shipment.actual_eta, true)} />}
        </div>
      </div>

      {/* Vessel / transport */}
      {(shipment.carrier || shipment.vessel_name || shipment.voyage) && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Anchor className="h-4 w-4 text-slate-400" />
              <h2 className="font-semibold text-slate-900 dark:text-white">Transporte</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
            <InfoRow label="Naviera / Aerolínea" value={shipment.carrier} />
            <InfoRow label="Vessel / Vuelo" value={shipment.vessel_name} />
            <InfoRow label="Voyage" value={shipment.voyage} />
            <InfoRow label="Flete" value={shipment.freight_terms} />
          </div>
        </div>
      )}

      {/* Cargo info */}
      {shipment.quotation && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400" />
              <h2 className="font-semibold text-slate-900 dark:text-white">Carga</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
            <InfoRow label="Mercancía" value={shipment.quotation.commodity} />
            <InfoRow label="Incoterm" value={shipment.quotation.incoterm} />
            {shipment.quotation.peso_kg && (
              <InfoRow label="Peso" value={`${shipment.quotation.peso_kg.toLocaleString('es-HN')} kg`} />
            )}
            {shipment.quotation.volumen_cbm && (
              <InfoRow label="Volumen" value={`${shipment.quotation.volumen_cbm.toLocaleString('es-HN')} CBM`} />
            )}
            <InfoRow label="Origen" value={shipment.quotation.origen} />
            <InfoRow label="Destino" value={shipment.quotation.destino} />
          </div>
        </div>
      )}

      {/* Documents */}
      {(shipment.master_bl || shipment.house_bl) && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <h2 className="font-semibold text-slate-900 dark:text-white">Documentos</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
            <InfoRow label="Master BL" value={shipment.master_bl} />
            <InfoRow label="House BL" value={shipment.house_bl} />
          </div>
        </div>
      )}

      {/* External tracking */}
      {shipment.tracking_url && (
        <a
          href={shipment.tracking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 py-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300 dark:hover:bg-blue-950/40"
        >
          <ExternalLink className="h-4 w-4" />
          Tracking en sitio de la naviera
        </a>
      )}
    </div>
  )
}
