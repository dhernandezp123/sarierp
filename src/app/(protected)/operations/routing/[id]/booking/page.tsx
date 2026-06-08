'use client'

import type React from 'react'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Ship,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { createActivityLog } from '@/src/lib/activity-logger'
import { operationStatuses } from '@/src/lib/operation-status'
import { shipmentEventTypes } from '@/src/lib/shipment-events'
import {
  fieldClass,
  cardClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'
import { cn } from '@/src/lib/utils'

// ─── Datos del cliente que vienen en join desde la cotización ─────────────────
type ClienteJoin = {
  nombre:    string | null
  direccion: string | null
  ciudad:    string | null
  pais:      string | null
  telefono:  string | null
  email_1:   string | null
  rtn:       string | null
  contacto:  string | null
}

type QuotationJoin = {
  id:                string
  preferred_carrier: string | null
  incoterm:          string | null
  transit_time:      string | null
  cliente:           ClienteJoin | ClienteJoin[] | null
}

type SelectedAgentQuote = {
  carrier?: string | null
  transit_time?: string | number | null
  transit?: string | number | null
  free_days_destination?: string | number | null
  free_days?: string | number | null
  dias_libres?: string | number | null
}

type BookingRouting = {
  id: string
  quotation_id: string | null
  routing_number: string
  booking_number: string | null
  carrier_booking: string | null
  carrier: string | null
  master_bl: string | null
  house_bl: string | null
  etd: string | null
  eta: string | null
  free_days: string | null
  shipment_status: string | null
  reference_number: string | null
  vessel_name: string | null
  voyage: string | null
  tracking_url: string | null
  original_eta: string | null
  actual_etd: string | null
  actual_eta: string | null
  eir_date: string | null
  estimated_transit_days: number | null
  real_transit_days: number | null
  remaining_free_days: number | null
  operational_comments: string | null
  supplier_name: string | null
  supplier_contact: string | null
  supplier_email: string | null
  freight_terms: string | null
  release_type: string | null
  hbl_freight_visibility: string | null
  printed_at_destination: boolean | null
  shipper: string | null
  consignee: string | null
  consignee_tax_id: string | null
  consignee_address: string | null
  consignee_contact: string | null
  consignee_email: string | null
  consignee_phone: string | null
  notify_party: string | null
  notify_party_tax_id: string | null
  notify_party_address: string | null
  notify_party_contact: string | null
  notify_party_email: string | null
  notify_party_phone: string | null
  // Join
  quotation: QuotationJoin | QuotationJoin[] | null
}

type ShippingInstructionEvent = {
  id: string
  event_type: string
  event_date: string
  location: string | null
  notes: string | null
  created_at: string
}

// Notify Party estándar de Sari Express (igual al documento de BL Instructions)
const SARI_NOTIFY_PARTY =
  'SARI EXPRESS S DE R.L. DE C.V.,\n BO. LOS ANDES 9 CALLE 12-13 AVE N.E,\n San Pedro Sula, Cortés, Honduras, CP: 21101\n RTN/TAXID: 08019003239182'

const readonlyFieldClass = cn(
  fieldClass,
  'cursor-default border-slate-200 bg-slate-100 text-slate-700 focus:border-slate-200 focus:ring-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
)

const fieldHintClass = {
  cotizacion:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  shipping:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  referencia:
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  estandar:
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
} as const

type FieldHint = keyof typeof fieldHintClass

function SectionCard({
  title,
  children,
  gridClassName = 'md:grid-cols-2',
}: {
  title: string
  children: React.ReactNode
  gridClassName?: string
}) {
  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>
      <div className={`mt-5 grid gap-4 ${gridClassName}`}>{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
  hint,
  readonlySource,
}: {
  label: string
  children: React.ReactNode
  hint?: FieldHint
  readonlySource?: FieldHint
}) {
  const badge = readonlySource || hint

  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
        {readonlySource && <Lock className="h-3 w-3" />}
        {badge && (
          <span className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
            fieldHintClass[badge]
          )}>
            {badge === 'cotizacion'
              ? 'cotización'
              : badge === 'estandar'
                ? 'estándar'
                : badge}
          </span>
        )}
      </label>
      {children}
    </div>
  )
}

function getEventStyle(eventType: string) {
  if (eventType.includes('Booking'))
    return {
      icon: CalendarClock,
      dot: 'bg-blue-500',
      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    }
  if (
    eventType.includes('Zarpado') ||
    eventType.includes('Transbordo') ||
    eventType.includes('Arribo')
  )
    return {
      icon: Ship,
      dot: 'bg-indigo-500',
      badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    }
  if (eventType.includes('Despacho') || eventType.includes('Entregado'))
    return {
      icon: Truck,
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    }
  return {
    icon: CheckCircle2,
    dot: 'bg-slate-500',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  }
}

// ─── Helper: normaliza el join (puede llegar como array o como objeto) ─────────
function resolveJoin<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function toNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const match = value.match(/\d+/)
  if (!match) return null

  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function addDaysToDate(dateValue?: string | null, days?: number | null) {
  if (!dateValue || !days) return null

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null

  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

// ─── Aplica datos de cotización/cliente a los campos vacíos del booking ────────
function applyQuotationDefaults(
  data: BookingRouting,
  selectedAgent?: SelectedAgentQuote | null
): BookingRouting {
  const quote  = resolveJoin(data.quotation)
  const client = quote ? resolveJoin(quote.cliente) : null
  const estimatedTransitDays =
    data.estimated_transit_days ??
    toNumber(selectedAgent?.transit_time) ??
    toNumber(selectedAgent?.transit) ??
    toNumber(quote?.transit_time)
  const calculatedEta = addDaysToDate(data.etd, estimatedTransitDays)
  const remainingFreeDays =
    data.remaining_free_days ??
    toNumber(selectedAgent?.free_days_destination) ??
    toNumber(selectedAgent?.free_days) ??
    toNumber(selectedAgent?.dias_libres)

  return {
    ...data,
    // ETD viene de la SI directamente, no de la cotización
    etd:       data.etd       || null,
    free_days: data.free_days || null,

    // Freight Terms desde incoterm de la cotización como referencia
    freight_terms: data.freight_terms || null,

    estimated_transit_days: estimatedTransitDays,
    eta: data.eta || calculatedEta,
    original_eta: data.original_eta || calculatedEta,
    remaining_free_days: remainingFreeDays,

    // Defaults operativos estándar si están vacíos
    release_type:           data.release_type           || 'Express Release',
    hbl_freight_visibility: data.hbl_freight_visibility || 'No Freight Charges',

    // Shipper desde supplier_name que llenó Ventas en la SI
    shipper:         data.shipper         || data.supplier_name    || null,

    // Consignee desde el cliente de la cotización
    consignee:        data.consignee        || client?.nombre    || null,
    consignee_tax_id: data.consignee_tax_id || client?.rtn       || null,
    consignee_address:data.consignee_address|| (
      client ? [client.direccion, client.ciudad, client.pais].filter(Boolean).join(', ') : null
    ),
    consignee_email:  data.consignee_email  || client?.email_1   || null,
    consignee_contact: data.consignee_contact || client?.contacto  || null,
    consignee_phone:  data.consignee_phone  || client?.telefono  || null,

    // Notify Party: si ya tiene valor respetarlo, si no poner el estándar de Sari Express
    notify_party: data.notify_party || SARI_NOTIFY_PARTY,
  }
}

export default function RoutingBookingPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [routing, setRouting] = useState<BookingRouting | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgentQuote | null>(null)
  const [events, setEvents]   = useState<ShippingInstructionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [eventType,     setEventType]     = useState('Booking Solicitado')
  const [eventDate,     setEventDate]     = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventNotes,    setEventNotes]    = useState('')
  const [savingEvent,   setSavingEvent]   = useState(false)

  const loadRouting = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('shipping_instructions')
      .select(`
        id,
        quotation_id,
        routing_number,
        booking_number,
        carrier_booking,
        carrier,
        master_bl,
        house_bl,
        etd,
        eta,
        free_days,
        shipment_status,
        reference_number,
        vessel_name,
        voyage,
        tracking_url,
        original_eta,
        actual_etd,
        actual_eta,
        eir_date,
        estimated_transit_days,
        real_transit_days,
        remaining_free_days,
        operational_comments,
        supplier_name,
        supplier_contact,
        supplier_email,
        freight_terms,
        release_type,
        hbl_freight_visibility,
        printed_at_destination,
        shipper,
        consignee,
        consignee_tax_id,
        consignee_address,
        consignee_contact,
        consignee_email,
        consignee_phone,
        notify_party,
        notify_party_tax_id,
        notify_party_address,
        notify_party_contact,
        notify_party_email,
        notify_party_phone,
        quotation:quotations (
          id,
          preferred_carrier,
          incoterm,
          transit_time,
          cliente:clientes (
            nombre,
            direccion,
            ciudad,
            pais,
            telefono,
            email_1,
            rtn,
            contacto
          )
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      toast.error(error.message)
    } else {
      const routingData = data as BookingRouting
      const quote = resolveJoin(routingData.quotation)
      const quotationId = routingData.quotation_id || quote?.id
      let selectedAgentQuote: SelectedAgentQuote | null = null

      if (quotationId) {
        const { data: agentQuoteData } = await supabase
          .from('agent_quotes')
          .select('*')
          .eq('quotation_id', quotationId)
          .eq('is_selected', true)
          .maybeSingle()

        selectedAgentQuote = agentQuoteData
      }

      setSelectedAgent(selectedAgentQuote)

      // Aplica defaults desde la cotización/cliente antes de setear el estado
      setRouting(applyQuotationDefaults(routingData, selectedAgentQuote))
    }

    setLoading(false)
  }

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('shipping_instruction_events')
      .select('*')
      .eq('shipping_instruction_id', id)
      .order('event_date', { ascending: false })

    if (!error && data) setEvents(data)
  }

  useEffect(() => {
    loadRouting()
    loadEvents()
  }, [id])

  const saveBooking = async () => {
    if (!routing) return
    setSaving(true)

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        booking_number:         routing.booking_number,
        carrier_booking:        routing.carrier_booking,
        master_bl:              routing.master_bl,
        house_bl:               routing.house_bl,
        etd:                    routing.etd,
        eta:                    routing.eta,
        free_days:              routing.free_days,
        shipment_status:        routing.shipment_status,
        reference_number:       routing.reference_number,
        vessel_name:            routing.vessel_name,
        voyage:                 routing.voyage,
        tracking_url:           routing.tracking_url,
        original_eta:           routing.original_eta,
        actual_etd:             routing.actual_etd,
        actual_eta:             routing.actual_eta,
        eir_date:               routing.eir_date,
        estimated_transit_days: routing.estimated_transit_days,
        real_transit_days:      routing.real_transit_days,
        remaining_free_days:    routing.remaining_free_days,
        operational_comments:   routing.operational_comments,
        supplier_contact:       routing.supplier_contact,
        supplier_email:         routing.supplier_email,
        freight_terms:          routing.freight_terms,
        release_type:           routing.release_type,
        hbl_freight_visibility: routing.hbl_freight_visibility,
        printed_at_destination: routing.printed_at_destination,
        shipper:                routing.shipper,
        consignee:              routing.consignee,
        consignee_tax_id:       routing.consignee_tax_id,
        consignee_address:      routing.consignee_address,
        consignee_contact:      routing.consignee_contact,
        consignee_email:        routing.consignee_email,
        consignee_phone:        routing.consignee_phone,
        notify_party:           routing.notify_party,
        notify_party_tax_id:    routing.notify_party_tax_id,
        notify_party_address:   routing.notify_party_address,
        notify_party_contact:   routing.notify_party_contact,
        notify_party_email:     routing.notify_party_email,
        notify_party_phone:     routing.notify_party_phone,
      })
      .eq('id', routing.id)

    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    await createActivityLog({
      module:     'operations_booking',
      action:     'booking_updated',
      entityType: 'shipping_instruction',
      entityId:   routing.id,
      description: `Booking actualizado para ${routing.routing_number}`,
    })

    toast.success('Booking actualizado')
  }

  const createEvent = async () => {
    if (!routing) return
    setSavingEvent(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      toast.error('No se pudo validar el usuario')
      setSavingEvent(false)
      return
    }

    const { error } = await supabase
      .from('shipping_instruction_events')
      .insert({
        shipping_instruction_id: routing.id,
        event_type:  eventType,
        event_date:  eventDate || new Date().toISOString(),
        location:    eventLocation || null,
        notes:       eventNotes   || null,
        created_by:  user.id,
      })

    setSavingEvent(false)

    if (error) {
      toast.error(error.message)
      return
    }

    await createActivityLog({
      module:     'operations_booking',
      action:     'shipment_event_created',
      entityType: 'shipping_instruction',
      entityId:   routing.id,
      description: `${eventType} registrado para ${routing.routing_number}`,
      metadata: { eventType, eventDate, location: eventLocation },
    })

    toast.success('Evento operativo registrado')
    setEventType('Booking Solicitado')
    setEventDate('')
    setEventLocation('')
    setEventNotes('')
    loadEvents()
  }

  if (loading)
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando booking...</p>

  if (!routing)
    return <p className="text-sm text-red-500">Booking no encontrado.</p>

  const quotation = resolveJoin(routing.quotation)
  const carrierReference =
    routing.carrier ||
    selectedAgent?.carrier ||
    quotation?.preferred_carrier ||
    ''
  const incotermReference = quotation?.incoterm || ''

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Booking Operativo {routing.routing_number}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Información operativa interna del embarque.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push(`/operations/routing/${routing.id}`)}
          className={secondaryButtonClass}
        >
          Volver al Routing
        </button>
      </div>

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Referencia Operativa">
            <Field label="Carrier / Naviera" readonlySource="referencia">
              <input
                value={carrierReference}
                readOnly
                className={readonlyFieldClass}
              />
            </Field>

            <Field label="Incoterm" readonlySource="cotizacion">
              <input
                value={incotermReference}
                readOnly
                className={readonlyFieldClass}
              />
            </Field>

            <Field label="Reference Number">
              <input
                value={routing.reference_number || ''}
                onChange={(e) => setRouting({ ...routing, reference_number: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Booking Number">
              <input
                value={routing.booking_number || ''}
                onChange={(e) => setRouting({ ...routing, booking_number: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Carrier Booking">
              <input
                value={routing.carrier_booking || ''}
                onChange={(e) => setRouting({ ...routing, carrier_booking: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Shipment Status">
              <select
                value={routing.shipment_status || 'Pendiente Validación'}
                onChange={(e) => setRouting({ ...routing, shipment_status: e.target.value })}
                className={fieldClass}
              >
                {operationStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </Field>
          </SectionCard>

          <SectionCard title="Documentación">
            <Field label="Master BL">
              <input
                value={routing.master_bl || ''}
                onChange={(e) => setRouting({ ...routing, master_bl: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="House BL">
              <input
                value={routing.house_bl || ''}
                onChange={(e) => setRouting({ ...routing, house_bl: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="EIR Date">
              <input
                type="date"
                value={routing.eir_date || ''}
                onChange={(e) => setRouting({ ...routing, eir_date: e.target.value })}
                className={fieldClass}
              />
            </Field>
          </SectionCard>
        </div>

        <SectionCard
          title="Documentación BL / Routing"
          gridClassName="md:grid-cols-2 lg:grid-cols-4"
        >
          <Field label="Freight Terms">
            <select
              value={routing.freight_terms || ''}
              onChange={(e) => setRouting({ ...routing, freight_terms: e.target.value })}
              className={fieldClass}
            >
              <option value="">Seleccionar</option>
              <option value="Collect">Collect</option>
              <option value="Prepaid">Prepaid</option>
            </select>
          </Field>

          <Field label="Release Type">
            <select
              value={routing.release_type || ''}
              onChange={(e) => setRouting({ ...routing, release_type: e.target.value })}
              className={fieldClass}
            >
              <option value="">Seleccionar</option>
              <option value="Express Release">Express Release</option>
              <option value="Original BL">Original BL</option>
            </select>
          </Field>

          <Field label="HBL Freight Visibility">
            <select
              value={routing.hbl_freight_visibility || ''}
              onChange={(e) => setRouting({ ...routing, hbl_freight_visibility: e.target.value })}
              className={fieldClass}
            >
              <option value="">Seleccionar</option>
              <option value="No Freight Charges">No mostrar flete</option>
              <option value="Show Freight Charges">Mostrar flete</option>
            </select>
          </Field>

          <div className="flex items-center gap-3 pt-6">
            <input
              id="printed-at-destination"
              type="checkbox"
              checked={routing.printed_at_destination || false}
              onChange={(e) =>
                setRouting({ ...routing, printed_at_destination: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            <label
              htmlFor="printed-at-destination"
              className="text-sm text-slate-700 dark:text-slate-300"
            >
              Printed at Destination
            </label>
          </div>

          {/* ── Shipper ── */}
          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Shipper
            </p>
          </div>

          <Field label="Shipper" readonlySource="shipping">
            <input
              value={routing.shipper || ''}
              readOnly
              className={readonlyFieldClass}
            />
          </Field>

          <Field label="Shipper Contact" readonlySource="shipping">
            <input
              value={routing.supplier_contact || ''}
              readOnly
              className={readonlyFieldClass}
            />
          </Field>

          <Field label="Shipper Email" readonlySource="shipping">
            <input
              value={routing.supplier_email || ''}
              readOnly
              className={readonlyFieldClass}
            />
          </Field>

          {/* ── Consignee ── */}
          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Consignee
            </p>
          </div>

          <Field label="Consignee" readonlySource="cotizacion">
            <input
              value={routing.consignee || ''}
              readOnly
              className={readonlyFieldClass}
            />
          </Field>

          <Field label="Consignee Tax ID" readonlySource="cotizacion">
            <input
              value={routing.consignee_tax_id || ''}
              readOnly
              className={readonlyFieldClass}
            />
          </Field>

          <Field label="Consignee Address" readonlySource="cotizacion">
            <input
              value={routing.consignee_address || ''}
              readOnly
              className={readonlyFieldClass}
            />
          </Field>

          <Field label="Consignee Contact">
            <input
              value={routing.consignee_contact || ''}
              onChange={(e) => setRouting({ ...routing, consignee_contact: e.target.value })}
              className={fieldClass}
            />
          </Field>

          <Field label="Consignee Email" readonlySource="cotizacion">
            <input
              value={routing.consignee_email || ''}
              readOnly
              className={readonlyFieldClass}
            />
          </Field>

          <Field label="Consignee Phone" readonlySource="cotizacion">
            <input
              value={routing.consignee_phone || ''}
              readOnly
              className={readonlyFieldClass}
            />
          </Field>

          {/* ── Notify Party ── */}
          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Notify Party
            </p>
          </div>

          <div className="md:col-span-2 lg:col-span-4">
            <Field label="Notify Party" hint="estandar">
              <input
                value={routing.notify_party || ''}
                onChange={(e) => setRouting({ ...routing, notify_party: e.target.value })}
                className={fieldClass}
              />
            </Field>
          </div>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Navegación / Tránsito">
            <Field label="Vessel Name">
              <input
                value={routing.vessel_name || ''}
                onChange={(e) => setRouting({ ...routing, vessel_name: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Voyage">
              <input
                value={routing.voyage || ''}
                onChange={(e) => setRouting({ ...routing, voyage: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Estimated Transit Days">
              <input
                type="number"
                value={routing.estimated_transit_days ?? ''}
                onChange={(e) =>
                  setRouting({
                    ...routing,
                    estimated_transit_days: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={fieldClass}
              />
            </Field>

            <Field label="Real Transit Days">
              <input
                type="number"
                value={routing.real_transit_days ?? ''}
                onChange={(e) =>
                  setRouting({
                    ...routing,
                    real_transit_days: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={fieldClass}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Fechas Operativas">
            <Field label="ETD" hint="cotizacion">
              <input
                type="date"
                value={routing.etd || ''}
                onChange={(e) => setRouting({ ...routing, etd: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="ETA">
              <input
                type="date"
                value={routing.eta || ''}
                onChange={(e) => setRouting({ ...routing, eta: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Original ETA">
              <input
                type="date"
                value={routing.original_eta || ''}
                onChange={(e) => setRouting({ ...routing, original_eta: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Actual ETD">
              <input
                type="date"
                value={routing.actual_etd || ''}
                onChange={(e) => setRouting({ ...routing, actual_etd: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Actual ETA">
              <input
                type="date"
                value={routing.actual_eta || ''}
                onChange={(e) => setRouting({ ...routing, actual_eta: e.target.value })}
                className={fieldClass}
              />
            </Field>
          </SectionCard>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Tracking y Control">
            <Field label="Tracking URL">
              <input
                value={routing.tracking_url || ''}
                onChange={(e) => setRouting({ ...routing, tracking_url: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Remaining Free Days">
              <input
                type="number"
                value={routing.remaining_free_days ?? ''}
                onChange={(e) =>
                  setRouting({
                    ...routing,
                    remaining_free_days: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={fieldClass}
              />
            </Field>
          </SectionCard>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Comentarios Operativos
            </h2>
            <textarea
              rows={6}
              value={routing.operational_comments || ''}
              onChange={(e) => setRouting({ ...routing, operational_comments: e.target.value })}
              className={`${fieldClass} mt-5 min-h-36`}
            />
          </section>
        </div>

        {/* ── Timeline ── */}
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Timeline Operativo
          </h2>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-slate-800/30">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Evento">
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className={fieldClass}
                >
                  {shipmentEventTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>

              <Field label="Fecha del evento">
                <input
                  type="datetime-local"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className={fieldClass}
                />
              </Field>
            </div>

            <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Ubicación">
                <input
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder="Puerto, ciudad, bodega..."
                  className={fieldClass}
                />
              </Field>

              <Field label="Notas">
                <input
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  placeholder="Observación del evento..."
                  className={fieldClass}
                />
              </Field>

              <button
                type="button"
                onClick={createEvent}
                disabled={savingEvent}
                className="flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {savingEvent ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Agregar
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-5">
            {events.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-10 text-center dark:border-slate-700">
                <CalendarClock className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
                  Sin eventos registrados
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-600">
                  Agrega el primer evento operativo del embarque.
                </p>
              </div>
            ) : (
              <div className="relative space-y-3">
                <div className="absolute bottom-4 left-[15px] top-4 w-px bg-slate-200 dark:bg-slate-700" />

                {events.map((event) => {
                  const style = getEventStyle(event.event_type)
                  const Icon  = style.icon

                  return (
                    <div key={event.id} className="relative flex gap-3">
                      <div
                        className={`relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm ${style.dot}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>

                      <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style.badge}`}
                            >
                              {event.event_type}
                            </span>

                            {event.location && (
                              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <MapPin className="h-3 w-3" />
                                {event.location}
                              </span>
                            )}
                          </div>

                          <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                            {new Date(event.event_date).toLocaleString('es-HN', {
                              day:    '2-digit',
                              month:  'short',
                              year:   'numeric',
                              hour:   '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {event.notes && (
                          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                            {event.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={saveBooking}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar Booking'}
        </button>
      </div>
    </div>
  )
}
