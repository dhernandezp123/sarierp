import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateBookingStatus } from '@/src/lib/booking-status'

export type SystemAlertCategory = 'Comercial' | 'Operativa' | 'Gerencial'
export type SystemAlertSeverity = 'Alta' | 'Media' | 'Baja'

export type SystemAlert = {
  id: string
  category: SystemAlertCategory
  severity: SystemAlertSeverity
  title: string
  description: string
  entityLabel: string
  entityType: 'Cotización' | 'SI' | 'Booking'
  href: string
  createdAt: string
  ageLabel: string
}

type ProfileLike = {
  rol?: string | null
}

type UserLike = {
  id?: string | null
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
  created_by: string | null
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

type BillOfLadingJoin = {
  bl_type: string | null
}

type BookingContainerJoin = {
  container_type: string | null
  quantity: number | string | null
}

type RoutingQuoteJoin = {
  id?: string | null
  created_by?: string | null
  clientes?: ClientJoin | ClientJoin[] | null
}

type ShippingInstructionRow = {
  id: string
  shipping_instruction_id: string
  quotation_id: string | null
  routing_number: string | null
  operational_status: string | null
  container_qty: number | null
  container_type: string | null
  created_by: string | null
  quotation?: RoutingQuoteJoin | RoutingQuoteJoin[] | null
  bookings: Array<{
    id: string
    booking_number: string | null
    shipment_status: string | null
  }> | null
}

type ShipmentRoutingJoin = {
  id: string
  shipping_instruction_id: string
  routing_number: string | null
  quotation_id: string | null
  container_qty: number | null
  container_type: string | null
  created_by?: string | null
  quotation?: RoutingQuoteJoin | RoutingQuoteJoin[] | null
}

type BookingRow = {
  id: string
  shipment_id: string | null
  shipping_instruction_id: string
  booking_number: string | null
  carrier_booking: string | null
  eta: string | null
  actual_eta: string | null
  shipment_status: string | null
  booking_lifecycle_status: 'ACTIVE' | 'CANCELLED' | 'REPLACED'
  replaced_by_booking_id: string | null
  remaining_free_days: number | null
  shipment: ShipmentRoutingJoin | ShipmentRoutingJoin[] | null
  booking_documents: BookingDocumentJoin[] | null
  bills_of_lading: BillOfLadingJoin[] | null
  booking_containers: BookingContainerJoin[] | null
  booking_schedule_revisions: Array<{
    id: string
    revision_number: number
    revision_type: string
    vessel_name: string | null
    voyage: string | null
    etd: string | null
    created_at: string
    client_notified_at: string | null
  }> | null
}

type ShipmentInstructionContextJoin = {
  id: string
  container_qty: number | null
  container_type: string | null
  deleted_at?: string | null
}

type ShipmentAlertRaw = {
  id: string
  quotation_id: string | null
  shipment_number: string
  operational_status: string | null
  created_by: string | null
  shipping_instruction:
    | ShipmentInstructionContextJoin
    | ShipmentInstructionContextJoin[]
    | null
  quotation?: RoutingQuoteJoin | RoutingQuoteJoin[] | null
  bookings: ShippingInstructionRow['bookings']
}

type BookingShipmentJoin = {
  id: string
  shipment_number: string
  quotation_id: string | null
  created_by?: string | null
  shipping_instruction:
    | ShipmentInstructionContextJoin
    | ShipmentInstructionContextJoin[]
    | null
  quotation?: RoutingQuoteJoin | RoutingQuoteJoin[] | null
}

type BookingAlertRaw = Omit<BookingRow, 'shipment'> & {
  shipment: BookingShipmentJoin | BookingShipmentJoin[] | null
}

type ReadinessAlertRow = {
  alert_key: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  alert_code: string
  shipment_id: string
  booking_id: string
  booking_container_id: string | null
  cutoff_id: string | null
  title: string
  description: string
  due_at: string | null
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
  routing: ShippingInstructionRow | BookingRow['shipment'] | null
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
  return routing?.routing_number || routing?.id || 'Sin SI'
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

  ;(booking.bills_of_lading || []).forEach((bill) => {
    if (bill.bl_type === 'MBL') attached.add('Master BL')
    if (bill.bl_type === 'HBL') attached.add('House BL')
  })

  return requiredDocumentTypes.filter((type) => !attached.has(type))
}

function quoteBelongsToUser(quote: QuotationRow, userId?: string | null) {
  return Boolean(userId && quote.created_by === userId)
}

function routingBelongsToUser(
  routing: ShippingInstructionRow | ShipmentRoutingJoin | null,
  userId?: string | null
) {
  const quote = resolveJoin(routing?.quotation)
  return Boolean(userId && (routing?.created_by === userId || quote?.created_by === userId))
}

export async function getSystemAlerts(
  supabaseClient: SupabaseClient,
  profile?: ProfileLike | null,
  user?: UserLike | null
): Promise<SystemAlert[]> {
  const role = profile?.rol || ''
  const userId = user?.id || null
  const isAdmin = role === 'Admin'
  const isSales = role === 'Ventas'
  const isOperations = role === 'Operaciones'
  const isFinance = role === 'Contabilidad' || role === 'Finanzas'

  const { data: quoteData, error: quoteError } = await supabaseClient
    .from('quotations')
    .select('*, clientes ( nombre )')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (quoteError) throw quoteError

  let quotations = (quoteData || []) as QuotationRow[]

  if (isSales && !isAdmin) {
    quotations = quotations.filter((quote) => quoteBelongsToUser(quote, userId))
  }

  if (isOperations) {
    quotations = []
  }

  const quoteIds = quotations.map((quote) => quote.id)

  const { data: pricingData, error: pricingError } = quoteIds.length > 0
    ? await supabaseClient
        .from('pricing_items')
        .select('quotation_id, cost_amount, sale_amount, quantity')
        .in('quotation_id', quoteIds)
    : { data: [], error: null }

  if (pricingError) throw pricingError

  const { data: siData, error: siError } = await supabaseClient
    .from('shipments')
    .select(`
      id,
      quotation_id,
      shipment_number,
      operational_status,
      created_by,
      shipping_instruction:shipping_instructions!inner (
        id,
        container_qty,
        container_type,
        deleted_at
      ),
      quotation:quotations (
        id,
        created_by,
        clientes (
          nombre
        )
      ),
      bookings (
        id,
        booking_number,
        shipment_status
      )
    `)
    .is('shipping_instruction.deleted_at', null)

  if (siError) throw siError

  let shippingInstructions: ShippingInstructionRow[] =
    ((siData || []) as ShipmentAlertRaw[]).map((shipment) => {
      const instruction = resolveJoin(shipment.shipping_instruction)
      return {
        id: shipment.id,
        shipping_instruction_id: instruction?.id || shipment.id,
        quotation_id: shipment.quotation_id,
        routing_number: shipment.shipment_number,
        operational_status: shipment.operational_status,
        container_qty: instruction?.container_qty ?? null,
        container_type: instruction?.container_type ?? null,
        created_by: shipment.created_by,
        quotation: shipment.quotation,
        bookings: shipment.bookings,
      } as ShippingInstructionRow
    })

  if (isSales && !isAdmin) {
    shippingInstructions = shippingInstructions.filter((routing) =>
      routingBelongsToUser(routing, userId)
    )
  }

  if (isFinance) {
    shippingInstructions = []
  }

  const { data: bookingsData, error: bookingsError } = await supabaseClient
    .from('bookings')
    .select(`
      id,
      shipment_id,
      shipping_instruction_id,
      booking_number,
      carrier_booking,
      eta,
      actual_eta,
      shipment_status,
      booking_lifecycle_status,
      replaced_by_booking_id,
      remaining_free_days,
      shipment:shipments!bookings_shipment_id_fkey (
        id,
        shipment_number,
        quotation_id,
        created_by,
        shipping_instruction:shipping_instructions (
          id,
          container_qty,
          container_type
        ),
        quotation:quotations (
          id,
          created_by,
          clientes (
            nombre
          )
        )
      ),
      booking_documents (
        document_type
      ),
      bills_of_lading (
        bl_type
      ),
      booking_containers (
        container_type,
        quantity
      ),
      booking_schedule_revisions (
        id,
        revision_number,
        revision_type,
        vessel_name,
        voyage,
        etd,
        created_at,
        client_notified_at
      )
    `)

  if (bookingsError) throw bookingsError

  let bookings: BookingRow[] =
    ((bookingsData || []) as BookingAlertRaw[]).map((booking) => {
      const shipment = resolveJoin(booking.shipment)
      const instruction = resolveJoin(shipment?.shipping_instruction)
      return {
        ...booking,
        shipment: shipment
          ? {
              id: shipment.id,
              shipping_instruction_id:
                instruction?.id || booking.shipping_instruction_id,
              routing_number: shipment.shipment_number,
              quotation_id: shipment.quotation_id,
              container_qty: instruction?.container_qty ?? null,
              container_type: instruction?.container_type ?? null,
              created_by: shipment.created_by,
              quotation: shipment.quotation,
            }
          : null,
      } as BookingRow
    })

  if (isSales && !isAdmin) {
    bookings = bookings.filter((booking) =>
      routingBelongsToUser(resolveJoin(booking.shipment), userId)
    )
  }

  if (isFinance) {
    bookings = []
  }

  const { data: quotationContainerData, error: quotationContainerError } =
    await supabaseClient
      .from('quotation_containers')
      .select('quotation_id, quantity')

  if (quotationContainerError) throw quotationContainerError

  const quotationContainers = (quotationContainerData || []) as QuotationContainerRow[]
  const alerts: SystemAlert[] = []
  const shippingByQuoteId = new Set(
    shippingInstructions
      .map((routing) => routing.quotation_id)
      .filter((id): id is string => Boolean(id))
  )
  const pricingByQuote = ((pricingData || []) as PricingItemRow[]).reduce<
    Record<string, PricingItemRow[]>
  >((acc, item) => {
    if (!item.quotation_id) return acc
    acc[item.quotation_id] = [...(acc[item.quotation_id] || []), item]
    return acc
  }, {})
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
    const createdAt = quote.updated_at || quote.created_at || new Date().toISOString()

    if (!isFinance && quote.status === 'Pendiente de Fijar Precios' && quoteAgeHours > 24) {
      alerts.push({
        id: `pricing-${quote.id}`,
        category: 'Comercial',
        severity: quoteAgeHours > 72 ? 'Alta' : 'Media',
        title: 'Pricing pendiente >24h',
        description: `${clientNameFromQuote(quote)} espera pricing.`,
        entityLabel: quoteLabel(quote),
        entityType: 'Cotización',
        href: `/pricing-comparison?quoteId=${quote.id}`,
        createdAt,
        ageLabel: ageLabelFromHours(quoteAgeHours),
      })
    }

    if (!isFinance && quote.status === 'Enviada al Cliente' && quoteAgeHours > 24 * 7) {
      alerts.push({
        id: `sent-${quote.id}`,
        category: 'Comercial',
        severity: quoteAgeHours > 24 * 14 ? 'Alta' : 'Media',
        title: 'Enviada al Cliente >7 días',
        description: `${clientNameFromQuote(quote)} no tiene cierre registrado.`,
        entityLabel: quoteLabel(quote),
        entityType: 'Cotización',
        href: `/quotations/${quote.id}`,
        createdAt,
        ageLabel: ageLabelFromHours(quoteAgeHours),
      })
    }

    if (!isFinance && quote.status === 'Ganada' && !shippingByQuoteId.has(quote.id)) {
      alerts.push({
        id: `won-no-si-${quote.id}`,
        category: 'Comercial',
        severity: 'Alta',
        title: 'Ganada sin Shipping Instruction',
        description: `${clientNameFromQuote(quote)} requiere SI para Operaciones.`,
        entityLabel: quoteLabel(quote),
        entityType: 'Cotización',
        href: `/quotations/${quote.id}`,
        createdAt,
        ageLabel: ageLabelFromHours(quoteAgeHours),
      })
    }

    const gp = gpForQuote(quote, pricingByQuote)
    if (
      ['Pricing Aprobado', 'Enviada al Cliente', 'Ganada'].includes(quote.status || '') &&
      gp > 0 &&
      gp < 5
    ) {
      alerts.push({
        id: `low-gp-${quote.id}`,
        category: 'Gerencial',
        severity: 'Alta',
        title: 'GP% <5%',
        description: `${clientNameFromQuote(quote)} tiene GP ${gp.toFixed(2)}%.`,
        entityLabel: quoteLabel(quote),
        entityType: 'Cotización',
        href: `/quotations/${quote.id}`,
        createdAt,
        ageLabel: ageLabelFromHours(quoteAgeHours),
      })
    }

    if (
      !['Ganada', 'Perdida'].includes(quote.status || '') &&
      staleAgeDays > 15
    ) {
      alerts.push({
        id: `stale-${quote.id}`,
        category: 'Gerencial',
        severity: staleAgeDays > 30 ? 'Alta' : 'Media',
        title: 'Cotización detenida >15 días',
        description: `${clientNameFromQuote(quote)} sigue en ${quote.status || 'N/A'}.`,
        entityLabel: quoteLabel(quote),
        entityType: 'Cotización',
        href: `/quotations/${quote.id}`,
        createdAt,
        ageLabel: `${Math.floor(staleAgeDays)}d`,
      })
    }
  })

  if (!isFinance) {
    shippingInstructions.forEach((routing) => {
      const aggregateStatus = aggregateBookingStatus(
        routing.bookings || [],
        routing.operational_status || 'Sin bookings'
      )

      if (!isFinalStatus(aggregateStatus) && (routing.bookings || []).length === 0) {
        alerts.push({
          id: `rt-no-bookings-${routing.id}`,
          category: 'Operativa',
          severity: 'Alta',
          title: 'SI sin bookings',
          description: `${clientNameFromRouting(routing)} no tiene bookings creados.`,
          entityLabel: routingLabel(routing),
          entityType: 'SI',
          href: `/operations/shipping-instructions/${routing.shipping_instruction_id}`,
          createdAt: new Date().toISOString(),
          ageLabel: 'Activo',
        })
      }

      if (routing.operational_status === 'Pendiente Validación') {
        alerts.push({
          id: `rt-pending-validation-${routing.id}`,
          category: 'Operativa',
          severity: 'Media',
          title: 'SI pendiente de validación',
          description: `${clientNameFromRouting(routing)} requiere validación operativa.`,
          entityLabel: routingLabel(routing),
          entityType: 'SI',
          href: `/operations/shipping-instructions/${routing.shipping_instruction_id}`,
          createdAt: new Date().toISOString(),
          ageLabel: 'Activo',
        })
      }

      if (routing.operational_status === 'Listo para Booking') {
        alerts.push({
          id: `rt-ready-booking-${routing.id}`,
          category: 'Operativa',
          severity: 'Media',
          title: 'SI lista para booking',
          description: `${clientNameFromRouting(routing)} está lista para crear booking.`,
          entityLabel: routingLabel(routing),
          entityType: 'SI',
          href: `/operations/shipping-instructions/${routing.shipping_instruction_id}`,
          createdAt: new Date().toISOString(),
          ageLabel: 'Activo',
        })
      }
    })
  }

  const bookingsByRouting = bookings.reduce<Record<string, BookingRow[]>>((acc, booking) => {
    const operationId = booking.shipment_id || booking.shipping_instruction_id
    acc[operationId] = [
      ...(acc[operationId] || []),
      booking,
    ]
    return acc
  }, {})

  Object.entries(bookingsByRouting).forEach(([routingId, routingBookings]) => {
    const routing = resolveJoin(routingBookings[0]?.shipment)
    if (!routing) return

    const expected = expectedContainers(routing, quotationContainerTotals)
    const assigned = assignedContainers(routingBookings)
    const missing = Math.max(expected - assigned, 0)

    if (expected > 0 && missing > 0) {
      alerts.push({
        id: `containers-${routingId}`,
        category: 'Operativa',
        severity: missing >= expected ? 'Alta' : 'Media',
        title: 'Contenedores sin asignar',
        description: `${assigned}/${expected} asignados. Faltan ${missing}.`,
        entityLabel: routingLabel(routing),
        entityType: 'SI',
        href: `/operations/shipping-instructions/${routing.shipping_instruction_id}`,
        createdAt: new Date().toISOString(),
        ageLabel: 'Activo',
      })
    }
  })

  bookings.forEach((booking) => {
    const routing = resolveJoin(booking.shipment)
    const missingDocs = missingDocuments(booking)
    const etaDays = daysUntil(booking.actual_eta || booking.eta)
    const remainingFreeDays = Number(booking.remaining_free_days)
    const assignedContainers = (booking.booking_containers || []).reduce(
      (sum, container) => sum + Number(container.quantity || 0),
      0
    )
    const newestRevision = [...(booking.booking_schedule_revisions || [])].sort(
      (left, right) => right.revision_number - left.revision_number
    )[0]
    const revisionAgeDays = newestRevision
      ? Math.floor(
          (Date.now() - new Date(newestRevision.created_at).getTime()) /
            86_400_000
        )
      : null

    if (booking.booking_lifecycle_status === 'REPLACED') {
      const replacement = bookings.find(
        (candidate) => candidate.id === booking.replaced_by_booking_id
      )
      const hasReplacementConfirmation =
        replacement?.booking_documents?.some(
          (document) => document.document_type === 'Booking Confirmation'
        ) || false

      if (!replacement || !hasReplacementConfirmation) {
        alerts.push({
          id: `replacement-docs-${booking.id}`,
          category: 'Operativa',
          severity: 'Alta',
          title: 'Booking reemplazado con documentos pendientes',
          description: replacement
            ? 'El booking sustituto aún no tiene Booking Confirmation.'
            : 'La relación no tiene un booking sustituto válido.',
          entityLabel: bookingLabel(booking),
          entityType: 'Booking',
          href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
          createdAt: newestRevision?.created_at || new Date().toISOString(),
          ageLabel: routingLabel(routing),
        })
      }

      if (assignedContainers > 0) {
        alerts.push({
          id: `replacement-containers-${booking.id}`,
          category: 'Operativa',
          severity: 'Alta',
          title: 'Contenedores vinculados al booking anterior',
          description: `${assignedContainers} contenedor(es) permanecen en el booking reemplazado; confirma que fue intencional.`,
          entityLabel: bookingLabel(booking),
          entityType: 'Booking',
          href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
          createdAt: new Date().toISOString(),
          ageLabel: routingLabel(routing),
        })
      }
      return
    }

    if (booking.booking_lifecycle_status === 'CANCELLED') {
      alerts.push({
        id: `cancelled-without-replacement-${booking.id}`,
        category: 'Operativa',
        severity: 'Alta',
        title: 'Booking cancelado sin sustituto',
        description: 'La operación no tiene una reserva sustituta vinculada.',
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: new Date().toISOString(),
        ageLabel: routingLabel(routing),
      })
      return
    }

    if (
      newestRevision &&
      newestRevision.revision_number > 1 &&
      newestRevision.revision_type !== 'ADMIN_CORRECTION' &&
      revisionAgeDays !== null &&
      revisionAgeDays <= 7
    ) {
      const rollover =
        newestRevision.revision_type === 'ROLLOVER_SAME_BOOKING'
      alerts.push({
        id: `schedule-change-${newestRevision.id}`,
        category: 'Operativa',
        severity: rollover ? 'Alta' : 'Media',
        title: rollover
          ? 'Cambio reciente de vessel/voyage'
          : 'Cambio reciente de ETD',
        description: `Itinerario actualizado recientemente${
          newestRevision.etd ? `; ETD vigente ${newestRevision.etd}` : ''
        }.`,
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: newestRevision.created_at,
        ageLabel: routingLabel(routing),
      })
    }

    const unnotifiedRollover = (booking.booking_schedule_revisions || []).find(
      (revision) =>
        revision.revision_type === 'ROLLOVER_SAME_BOOKING' &&
        !revision.client_notified_at
    )
    if (unnotifiedRollover) {
      alerts.push({
        id: `rollover-unnotified-${unnotifiedRollover.id}`,
        category: 'Operativa',
        severity: 'Alta',
        title: 'Rollover sin notificación al cliente',
        description: 'Registra la notificación al cliente del nuevo itinerario.',
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: unnotifiedRollover.created_at,
        ageLabel: routingLabel(routing),
      })
    }

    if (
      !isFinalStatus(booking.shipment_status) &&
      (
        booking.shipment_status === 'Booking Solicitado' ||
        !booking.booking_number ||
        !booking.carrier_booking
      )
    ) {
      alerts.push({
        id: `booking-unconfirmed-${booking.id}`,
        category: 'Operativa',
        severity: 'Media',
        title: 'Booking sin confirmar',
        description: 'Falta número de booking, carrier booking o confirmación.',
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: new Date().toISOString(),
        ageLabel: routingLabel(routing),
      })
    }

    if (!isFinalStatus(booking.shipment_status) && assignedContainers === 0) {
      alerts.push({
        id: `booking-no-containers-${booking.id}`,
        category: 'Operativa',
        severity: 'Alta',
        title: 'Booking sin contenedores',
        description: 'Este booking no tiene contenedores físicos asignados.',
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: new Date().toISOString(),
        ageLabel: routingLabel(routing),
      })
    }

    if (
      isFinalStatus(booking.shipment_status) &&
      (missingDocs.length > 0 || assignedContainers === 0)
    ) {
      alerts.push({
        id: `booking-final-incomplete-${booking.id}`,
        category: 'Operativa',
        severity: 'Alta',
        title: 'Booking finalizado incompletamente',
        description: [
          missingDocs.length > 0 ? `documentos pendientes: ${missingDocs.join(', ')}` : '',
          assignedContainers === 0 ? 'sin contenedores asignados' : '',
        ].filter(Boolean).join('; '),
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: new Date().toISOString(),
        ageLabel: routingLabel(routing),
      })
    }

    if (!isFinalStatus(booking.shipment_status) && missingDocs.length > 0) {
      alerts.push({
        id: `docs-${booking.id}`,
        category: 'Operativa',
        severity: missingDocs.length >= 3 ? 'Alta' : 'Media',
        title: 'Booking sin documentos obligatorios',
        description: `Faltan: ${missingDocs.join(', ')}.`,
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: new Date().toISOString(),
        ageLabel: routingLabel(routing),
      })
    }

    if (
      !isFinalStatus(booking.shipment_status) &&
      etaDays !== null &&
      etaDays >= 0 &&
      etaDays <= 7
    ) {
      alerts.push({
        id: `eta-${booking.id}`,
        category: 'Operativa',
        severity: etaDays <= 2 ? 'Alta' : 'Media',
        title: 'ETA <=7 días',
        description: `${clientNameFromRouting(routing)} arriba en ${
          etaDays === 0 ? 'hoy' : `${etaDays} días`
        }.`,
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: booking.actual_eta || booking.eta || new Date().toISOString(),
        ageLabel: routingLabel(routing),
      })
    }

    if (
      (booking.actual_eta || isArrived(booking.shipment_status) || isFinalStatus(booking.shipment_status)) &&
      Number.isFinite(remainingFreeDays) &&
      remainingFreeDays >= 0 &&
      remainingFreeDays <= 3
    ) {
      alerts.push({
        id: `free-days-${booking.id}`,
        category: 'Operativa',
        severity: remainingFreeDays <= 1 ? 'Alta' : 'Media',
        title: 'Free Days <=3 días',
        description: `Quedan ${remainingFreeDays} días libres.`,
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: new Date().toISOString(),
        ageLabel: routingLabel(routing),
      })
    }
  })

  if (!isFinance) {
    const { data: readinessAlertData, error: readinessAlertError } =
      await supabaseClient.rpc('get_booking_readiness_alerts')

    if (readinessAlertError) throw readinessAlertError

    ;((readinessAlertData || []) as ReadinessAlertRow[]).forEach((readinessAlert) => {
      const booking = bookings.find(
        (candidate) => candidate.id === readinessAlert.booking_id
      )
      if (!booking) return

      alerts.push({
        id: `readiness-${readinessAlert.alert_key}`,
        category: 'Operativa',
        severity:
          readinessAlert.severity === 'CRITICAL'
            ? 'Alta'
            : readinessAlert.severity === 'WARNING'
              ? 'Media'
              : 'Baja',
        title: readinessAlert.title,
        description: readinessAlert.description,
        entityLabel: bookingLabel(booking),
        entityType: 'Booking',
        href: `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`,
        createdAt: readinessAlert.due_at || new Date().toISOString(),
        ageLabel: readinessAlert.alert_code,
      })
    })
  }

  const severityWeight: Record<SystemAlertSeverity, number> = {
    Alta: 0,
    Media: 1,
    Baja: 2,
  }

  return alerts.sort(
    (a, b) =>
      severityWeight[a.severity] - severityWeight[b.severity] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}
