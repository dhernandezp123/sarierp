'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Ship,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'

type AlertCategory = 'Comercial' | 'Operativa' | 'Gerencial'
type AlertSeverity = 'Alta' | 'Media' | 'Baja'

type AlertRow = {
  id: string
  category: AlertCategory
  severity: AlertSeverity
  title: string
  detail: string
  entityLabel: string
  entityType: 'Cotización' | 'RT' | 'Booking'
  href: string
  ageLabel: string
}

type ClientJoin = {
  nombre: string | null
}

type QuotationRow = {
  id: string
  quotation_number: string | null
  status: string | null
  created_at: string | null
  updated_at?: string | null
  total_sale: number | string | null
  profit_amount: number | string | null
  gp_percentage: number | string | null
  clientes?: ClientJoin | ClientJoin[] | null
}

type PricingItemRow = {
  quotation_id: string | null
  cost_amount: number | string | null
  sale_amount: number | string | null
  quantity: number | string | null
}

type QuotationContainerRow = {
  quotation_id: string | null
  quantity: number | string | null
}

type BookingDocumentJoin = {
  document_type: string | null
}

type BookingContainerJoin = {
  container_type: string | null
  quantity: number | string | null
}

type ShippingInstructionRow = {
  id: string
  quotation_id: string | null
  routing_number: string | null
  shipment_status: string | null
  container_qty: number | null
  container_type: string | null
  quotation?: {
    clientes?: ClientJoin | ClientJoin[] | null
  } | {
    clientes?: ClientJoin | ClientJoin[] | null
  }[] | null
  bookings: Array<{
    id: string
    booking_number: string | null
  }> | null
}

type BookingRow = {
  id: string
  shipping_instruction_id: string
  booking_number: string | null
  carrier_booking: string | null
  master_bl: string | null
  house_bl: string | null
  eta: string | null
  actual_eta: string | null
  shipment_status: string | null
  remaining_free_days: number | null
  shipping_instruction: {
    id: string
    routing_number: string | null
    quotation_id: string | null
    container_qty: number | null
    container_type: string | null
    quotation?: {
      clientes?: ClientJoin | ClientJoin[] | null
    } | {
      clientes?: ClientJoin | ClientJoin[] | null
    }[] | null
  } | {
    id: string
    routing_number: string | null
    quotation_id: string | null
    container_qty: number | null
    container_type: string | null
    quotation?: {
      clientes?: ClientJoin | ClientJoin[] | null
    } | {
      clientes?: ClientJoin | ClientJoin[] | null
    }[] | null
  }[] | null
  booking_documents: BookingDocumentJoin[] | null
  booking_containers: BookingContainerJoin[] | null
}

const requiredDocumentTypes = [
  'Booking Confirmation',
  'Master BL',
  'House BL',
  'Packing List',
  'Commercial Invoice',
]

function resolveJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function clientNameFromQuote(quote: QuotationRow) {
  return resolveJoin(quote.clientes)?.nombre || 'Sin cliente'
}

function clientNameFromRouting(
  routing: ShippingInstructionRow | BookingRow['shipping_instruction'] | null
) {
  const singleRouting = resolveJoin(routing)
  const quote = resolveJoin(singleRouting?.quotation)
  return resolveJoin(quote?.clientes)?.nombre || 'Sin cliente'
}

function quoteLabel(quote: QuotationRow) {
  return quote.quotation_number || quote.id
}

function bookingLabel(booking: BookingRow) {
  return booking.booking_number || booking.carrier_booking || 'Sin booking'
}

function routingLabel(routing?: { routing_number: string | null; id: string } | null) {
  return routing?.routing_number || routing?.id || 'Sin RT'
}

function hoursSince(value?: string | null) {
  if (!value) return 0
  return (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60)
}

function daysSince(value?: string | null) {
  return hoursSince(value) / 24
}

function daysUntil(value?: string | null) {
  if (!value) return null

  const target = new Date(value)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)

  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function ageLabelFromHours(hours: number) {
  if (hours < 48) return `${Math.floor(hours)}h`
  return `${Math.floor(hours / 24)}d`
}

function normalizeStatus(status?: string | null) {
  return (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isFinalStatus(status?: string | null) {
  const normalized = normalizeStatus(status)
  return normalized === 'Finalizado' || normalized === 'Convertida a Shipment'
}

function isArrived(status?: string | null) {
  return normalizeStatus(status) === 'Arribado'
}

function calculatePricingTotals(items: PricingItemRow[]) {
  return items.reduce(
    (totals, item) => {
      const quantity = Number(item.quantity || 1)
      const cost = Number(item.cost_amount || 0) * quantity
      const sale = Number(item.sale_amount || 0) * quantity

      totals.sale += sale
      totals.profit += sale - cost
      return totals
    },
    { sale: 0, profit: 0 }
  )
}

function gpForQuote(quote: QuotationRow, pricingByQuote: Record<string, PricingItemRow[]>) {
  const storedGp = Number(quote.gp_percentage)
  if (Number.isFinite(storedGp) && storedGp !== 0) return storedGp

  const storedSale = Number(quote.total_sale || 0)
  const storedProfit = Number(quote.profit_amount || 0)
  if (storedSale > 0) return (storedProfit / storedSale) * 100

  const pricingTotals = calculatePricingTotals(pricingByQuote[quote.id] || [])
  return pricingTotals.sale > 0
    ? (pricingTotals.profit / pricingTotals.sale) * 100
    : 0
}

function expectedContainers(
  routing: { quotation_id: string | null; container_qty: number | null; container_type: string | null },
  quotationTotals: Record<string, number>
) {
  if (routing.quotation_id && quotationTotals[routing.quotation_id]) {
    return quotationTotals[routing.quotation_id]
  }

  const directQty = Number(routing.container_qty || 0)
  if (directQty > 0) return directQty

  const match = routing.container_type?.trim().match(/^(\d+)\s*x\s+/i)
  return match ? Number(match[1]) : 0
}

function assignedContainers(bookings: BookingRow[]) {
  return bookings.reduce((total, booking) => {
    const bookingTotal = (booking.booking_containers || []).reduce(
      (sum, container) => sum + Number(container.quantity || 0),
      0
    )
    return total + bookingTotal
  }, 0)
}

function missingDocuments(booking: BookingRow) {
  const attached = new Set(
    (booking.booking_documents || [])
      .map((document) => document.document_type)
      .filter((type): type is string => Boolean(type))
  )

  return requiredDocumentTypes.filter((type) => !attached.has(type))
}

function severityClass(severity: AlertSeverity) {
  if (severity === 'Alta') {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200'
  }
  if (severity === 'Media') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
  }
  return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200'
}

function categoryClass(category: AlertCategory) {
  if (category === 'Comercial') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200'
  }
  if (category === 'Operativa') {
    return 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200'
  }
  return 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200'
}

export default function AlertsPage() {
  const [quotations, setQuotations] = useState<QuotationRow[]>([])
  const [pricingItems, setPricingItems] = useState<PricingItemRow[]>([])
  const [shippingInstructions, setShippingInstructions] = useState<ShippingInstructionRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [quotationContainers, setQuotationContainers] = useState<QuotationContainerRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadAlerts = async () => {
    setLoading(true)

    const { data: quoteData, error: quoteError } = await supabase
      .from('quotations')
      .select('*, clientes ( nombre )')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (quoteError) {
      toast.error(quoteError.message)
    }

    const visibleQuotes = (quoteData || []) as QuotationRow[]
    const quoteIds = visibleQuotes.map((quote) => quote.id)

    const { data: pricingData, error: pricingError } = quoteIds.length > 0
      ? await supabase
          .from('pricing_items')
          .select('quotation_id, cost_amount, sale_amount, quantity')
          .in('quotation_id', quoteIds)
      : { data: [], error: null }

    if (pricingError) {
      toast.error(pricingError.message)
    }

    const { data: siData, error: siError } = await supabase
      .from('shipping_instructions')
      .select(`
        id,
        quotation_id,
        routing_number,
        shipment_status,
        container_qty,
        container_type,
        quotation:quotations (
          clientes (
            nombre
          )
        ),
        bookings (
          id,
          booking_number
        )
      `)

    if (siError) {
      toast.error(siError.message)
    }

    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        shipping_instruction_id,
        booking_number,
        carrier_booking,
        master_bl,
        house_bl,
        eta,
        actual_eta,
        shipment_status,
        remaining_free_days,
        shipping_instruction:shipping_instructions (
          id,
          routing_number,
          quotation_id,
          container_qty,
          container_type,
          quotation:quotations (
            clientes (
              nombre
            )
          )
        ),
        booking_documents (
          document_type
        ),
        booking_containers (
          container_type,
          quantity
        )
      `)

    if (bookingsError) {
      toast.error(bookingsError.message)
    }

    const { data: quotationContainerData, error: quotationContainerError } =
      await supabase
        .from('quotation_containers')
        .select('quotation_id, quantity')

    if (quotationContainerError) {
      toast.error(quotationContainerError.message)
    }

    setQuotations(visibleQuotes)
    setPricingItems((pricingData || []) as PricingItemRow[])
    setShippingInstructions((siData || []) as ShippingInstructionRow[])
    setBookings((bookingsData || []) as BookingRow[])
    setQuotationContainers((quotationContainerData || []) as QuotationContainerRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadAlerts()
  }, [])

  const alerts = useMemo(() => {
    const rows: AlertRow[] = []
    const shippingByQuoteId = new Set(
      shippingInstructions
        .map((routing) => routing.quotation_id)
        .filter((id): id is string => Boolean(id))
    )
    const pricingByQuote = pricingItems.reduce<Record<string, PricingItemRow[]>>(
      (acc, item) => {
        if (!item.quotation_id) return acc
        acc[item.quotation_id] = [...(acc[item.quotation_id] || []), item]
        return acc
      },
      {}
    )
    const quotationContainerTotals = quotationContainers.reduce<Record<string, number>>(
      (acc, container) => {
        if (!container.quotation_id) return acc
        acc[container.quotation_id] =
          (acc[container.quotation_id] || 0) + Number(container.quantity || 0)
        return acc
      },
      {}
    )

    quotations.forEach((quote) => {
      const quoteAgeHours = hoursSince(quote.created_at)
      const staleAgeDays = daysSince(quote.updated_at || quote.created_at)

      if (quote.status === 'Pendiente de Fijar Precios' && quoteAgeHours > 24) {
        rows.push({
          id: `pricing-${quote.id}`,
          category: 'Comercial',
          severity: quoteAgeHours > 72 ? 'Alta' : 'Media',
          title: 'Pricing pendiente >24h',
          detail: `${clientNameFromQuote(quote)} espera pricing.`,
          entityLabel: quoteLabel(quote),
          entityType: 'Cotización',
          href: `/pricing-comparison?quoteId=${quote.id}`,
          ageLabel: ageLabelFromHours(quoteAgeHours),
        })
      }

      if (quote.status === 'Enviada al Cliente' && quoteAgeHours > 24 * 7) {
        rows.push({
          id: `sent-${quote.id}`,
          category: 'Comercial',
          severity: quoteAgeHours > 24 * 14 ? 'Alta' : 'Media',
          title: 'Enviada al Cliente >7 días',
          detail: `${clientNameFromQuote(quote)} no tiene cierre registrado.`,
          entityLabel: quoteLabel(quote),
          entityType: 'Cotización',
          href: `/quotations/${quote.id}`,
          ageLabel: ageLabelFromHours(quoteAgeHours),
        })
      }

      if (quote.status === 'Ganada' && !shippingByQuoteId.has(quote.id)) {
        rows.push({
          id: `won-no-si-${quote.id}`,
          category: 'Comercial',
          severity: 'Alta',
          title: 'Ganada sin Shipping Instruction',
          detail: `${clientNameFromQuote(quote)} requiere SI para Operaciones.`,
          entityLabel: quoteLabel(quote),
          entityType: 'Cotización',
          href: `/quotations/${quote.id}`,
          ageLabel: ageLabelFromHours(quoteAgeHours),
        })
      }

      const gp = gpForQuote(quote, pricingByQuote)
      if (
        ['Pricing Aprobado', 'Enviada al Cliente', 'Ganada'].includes(quote.status || '') &&
        gp > 0 &&
        gp < 5
      ) {
        rows.push({
          id: `low-gp-${quote.id}`,
          category: 'Gerencial',
          severity: 'Alta',
          title: 'GP% <5%',
          detail: `${clientNameFromQuote(quote)} tiene GP ${gp.toFixed(2)}%.`,
          entityLabel: quoteLabel(quote),
          entityType: 'Cotización',
          href: `/quotations/${quote.id}`,
          ageLabel: ageLabelFromHours(quoteAgeHours),
        })
      }

      if (
        !['Ganada', 'Perdida'].includes(quote.status || '') &&
        staleAgeDays > 15
      ) {
        rows.push({
          id: `stale-${quote.id}`,
          category: 'Gerencial',
          severity: staleAgeDays > 30 ? 'Alta' : 'Media',
          title: 'Cotización detenida >15 días',
          detail: `${clientNameFromQuote(quote)} sigue en ${quote.status || 'N/A'}.`,
          entityLabel: quoteLabel(quote),
          entityType: 'Cotización',
          href: `/quotations/${quote.id}`,
          ageLabel: `${Math.floor(staleAgeDays)}d`,
        })
      }
    })

    shippingInstructions.forEach((routing) => {
      if (!isFinalStatus(routing.shipment_status) && (routing.bookings || []).length === 0) {
        rows.push({
          id: `rt-no-bookings-${routing.id}`,
          category: 'Operativa',
          severity: 'Alta',
          title: 'RT sin bookings',
          detail: `${clientNameFromRouting(routing)} no tiene bookings creados.`,
          entityLabel: routingLabel(routing),
          entityType: 'RT',
          href: `/operations/routing/${routing.id}`,
          ageLabel: 'Activo',
        })
      }
    })

    const bookingsByRouting = bookings.reduce<Record<string, BookingRow[]>>((acc, booking) => {
      acc[booking.shipping_instruction_id] = [
        ...(acc[booking.shipping_instruction_id] || []),
        booking,
      ]
      return acc
    }, {})

    Object.entries(bookingsByRouting).forEach(([routingId, routingBookings]) => {
      const routing = resolveJoin(routingBookings[0]?.shipping_instruction)
      if (!routing) return

      const expected = expectedContainers(routing, quotationContainerTotals)
      const assigned = assignedContainers(routingBookings)
      const missing = Math.max(expected - assigned, 0)

      if (expected > 0 && missing > 0) {
        rows.push({
          id: `containers-${routingId}`,
          category: 'Operativa',
          severity: missing >= expected ? 'Alta' : 'Media',
          title: 'Contenedores sin asignar',
          detail: `${assigned}/${expected} asignados. Faltan ${missing}.`,
          entityLabel: routingLabel(routing),
          entityType: 'RT',
          href: `/operations/routing/${routingId}`,
          ageLabel: 'Activo',
        })
      }
    })

    bookings.forEach((booking) => {
      const routing = resolveJoin(booking.shipping_instruction)
      const missingDocs = missingDocuments(booking)
      const etaDays = daysUntil(booking.actual_eta || booking.eta)
      const remainingFreeDays = Number(booking.remaining_free_days)

      if (!isFinalStatus(booking.shipment_status) && missingDocs.length > 0) {
        rows.push({
          id: `docs-${booking.id}`,
          category: 'Operativa',
          severity: missingDocs.length >= 3 ? 'Alta' : 'Media',
          title: 'Booking sin documentos obligatorios',
          detail: `Faltan: ${missingDocs.join(', ')}.`,
          entityLabel: bookingLabel(booking),
          entityType: 'Booking',
          href: `/operations/routing/${booking.shipping_instruction_id}/bookings/${booking.id}`,
          ageLabel: routingLabel(routing),
        })
      }

      if (
        !isFinalStatus(booking.shipment_status) &&
        etaDays !== null &&
        etaDays >= 0 &&
        etaDays <= 7
      ) {
        rows.push({
          id: `eta-${booking.id}`,
          category: 'Operativa',
          severity: etaDays <= 2 ? 'Alta' : 'Media',
          title: 'ETA <=7 días',
          detail: `${clientNameFromRouting(routing)} arriba en ${etaDays === 0 ? 'hoy' : `${etaDays} días`}.`,
          entityLabel: bookingLabel(booking),
          entityType: 'Booking',
          href: `/operations/routing/${booking.shipping_instruction_id}/bookings/${booking.id}`,
          ageLabel: routingLabel(routing),
        })
      }

      if (
        (booking.actual_eta || isArrived(booking.shipment_status) || isFinalStatus(booking.shipment_status)) &&
        Number.isFinite(remainingFreeDays) &&
        remainingFreeDays >= 0 &&
        remainingFreeDays <= 3
      ) {
        rows.push({
          id: `free-days-${booking.id}`,
          category: 'Operativa',
          severity: remainingFreeDays <= 1 ? 'Alta' : 'Media',
          title: 'Free Days <=3 días',
          detail: `Quedan ${remainingFreeDays} días libres.`,
          entityLabel: bookingLabel(booking),
          entityType: 'Booking',
          href: `/operations/routing/${booking.shipping_instruction_id}/bookings/${booking.id}`,
          ageLabel: routingLabel(routing),
        })
      }
    })

    const severityWeight: Record<AlertSeverity, number> = {
      Alta: 0,
      Media: 1,
      Baja: 2,
    }

    return rows.sort(
      (a, b) =>
        severityWeight[a.severity] - severityWeight[b.severity] ||
        a.category.localeCompare(b.category)
    )
  }, [bookings, pricingItems, quotationContainers, quotations, shippingInstructions])

  const counts = useMemo(() => {
    return {
      Comercial: alerts.filter((alert) => alert.category === 'Comercial').length,
      Operativa: alerts.filter((alert) => alert.category === 'Operativa').length,
      Gerencial: alerts.filter((alert) => alert.category === 'Gerencial').length,
    }
  }, [alerts])

  if (loading) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Cargando centro de alertas...
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
          Centro de control
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
          Alertas
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Riesgos comerciales, operativos y gerenciales calculados desde los datos existentes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Comerciales"
          value={counts.Comercial}
          icon={<BriefcaseBusiness className="h-5 w-5" />}
          tone="emerald"
        />
        <KpiCard
          title="Operativas"
          value={counts.Operativa}
          icon={<Ship className="h-5 w-5" />}
          tone="sky"
        />
        <KpiCard
          title="Gerenciales"
          value={counts.Gerencial}
          icon={<Building2 className="h-5 w-5" />}
          tone="violet"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Tabla consolidada
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {alerts.length} alertas activas.
            </p>
          </div>
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-3 pr-4">Categoría</th>
                <th className="pr-4">Severidad</th>
                <th className="pr-4">Alerta</th>
                <th className="pr-4">Entidad</th>
                <th className="pr-4">Edad / Ref.</th>
                <th className="text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="border-t border-slate-100 py-8 text-center text-slate-500 dark:border-slate-800 dark:text-slate-400"
                  >
                    No hay alertas activas.
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr
                    key={alert.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${categoryClass(
                          alert.category
                        )}`}
                      >
                        {alert.category}
                      </span>
                    </td>
                    <td className="pr-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severityClass(
                          alert.severity
                        )}`}
                      >
                        {alert.severity}
                      </span>
                    </td>
                    <td className="pr-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {alert.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {alert.detail}
                      </p>
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      <p className="font-medium">{alert.entityLabel}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {alert.entityType}
                      </p>
                    </td>
                    <td className="pr-4 text-slate-600 dark:text-slate-300">
                      {alert.ageLabel}
                    </td>
                    <td className="text-right">
                      <Link
                        href={alert.href}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function KpiCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string
  value: number
  icon: React.ReactNode
  tone: 'emerald' | 'sky' | 'violet'
}) {
  const toneClass = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200',
  }[tone]

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
        <div className={`rounded-xl p-2 ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </section>
  )
}
