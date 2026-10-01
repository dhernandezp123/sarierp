export type AgentQuoteActivity = {
  quotation_id: string | null
  is_selected: boolean | null
  created_at: string | null
  deleted_at?: string | null
  carrier?: string | null
  etd?: string | null
  valid_until?: string | null
}

export type AgentQuotation = {
  id: string
  quotation_number: string | null
  status: string | null
  origin: string | null
  destination: string | null
  port_origin: string | null
  port_destination: string | null
  created_at: string | null
  valid_until: string | null
  client_name: string | null
}

export type AgentShipment = {
  id: string
  shipment_number: string
  quotation_id: string | null
  shipping_instruction_id: string | null
  operational_status: string
  origin: string | null
  destination: string | null
  closed_at: string | null
  created_at: string | null
  updated_at: string | null
}

export type AgentBooking = {
  id: string
  shipment_id: string | null
  booking_number: string | null
  carrier_booking: string | null
  carrier: string | null
  shipment_status: string | null
  etd: string | null
  eta: string | null
  actual_etd: string | null
  actual_eta: string | null
  updated_at: string | null
}

export type AgentQuotationActivity = AgentQuotation & {
  selected: boolean
  quoted_at: string | null
  agent_carrier: string | null
  agent_etd: string | null
  agent_valid_until: string | null
}

export type AgentShipmentActivity = AgentShipment & {
  quotation: AgentQuotation | null
  bookings: AgentBooking[]
}

export type AgentLaneUsage = {
  key: string
  origin: string
  destination: string
  selections: number
  shipments: number
}

export type Agent360Snapshot = {
  metrics: {
    offeredQuotations: number
    selectedQuotations: number
    wonQuotations: number
    shipments: number
    activeShipments: number
    bookings: number
    lastActivityAt: string | null
  }
  quotations: AgentQuotationActivity[]
  shipments: AgentShipmentActivity[]
  lanes: AgentLaneUsage[]
}

function timeValue(value: string | null | undefined) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function latestValue(values: Array<string | null | undefined>) {
  return values.reduce<string | null>((latest, value) => {
    if (!value || timeValue(value) <= timeValue(latest)) return latest
    return value
  }, null)
}

function cleanLocation(value: string | null | undefined) {
  return value?.trim() || ''
}

function laneFor(
  quotation: AgentQuotation | null,
  shipment?: AgentShipment | null
) {
  const origin = cleanLocation(
    shipment?.origin || quotation?.port_origin || quotation?.origin
  ) || 'Origen no definido'
  const destination = cleanLocation(
    shipment?.destination || quotation?.port_destination || quotation?.destination
  ) || 'Destino no definido'

  return {
    key: `${origin.toLocaleLowerCase('es')}::${destination.toLocaleLowerCase('es')}`,
    origin,
    destination,
  }
}

export function buildAgent360Snapshot({
  agentQuotes,
  quotations,
  shipments,
  bookings,
}: {
  agentQuotes: AgentQuoteActivity[]
  quotations: AgentQuotation[]
  shipments: AgentShipment[]
  bookings: AgentBooking[]
}): Agent360Snapshot {
  const liveQuotes = agentQuotes.filter((quote) => !quote.deleted_at && quote.quotation_id)
  const quotationById = new Map(quotations.map((quotation) => [quotation.id, quotation]))
  const quoteRowsByQuotation = new Map<string, AgentQuoteActivity[]>()

  for (const quote of liveQuotes) {
    const quotationId = quote.quotation_id as string
    const current = quoteRowsByQuotation.get(quotationId) || []
    current.push(quote)
    quoteRowsByQuotation.set(quotationId, current)
  }

  const quotationActivities = [...quoteRowsByQuotation.entries()]
    .flatMap(([quotationId, quoteRows]) => {
      const quotation = quotationById.get(quotationId)
      if (!quotation) return []

      const orderedRows = [...quoteRows].sort(
        (left, right) => timeValue(right.created_at) - timeValue(left.created_at)
      )
      const latest = orderedRows[0]
      const selected = quoteRows.some((quote) => quote.is_selected === true)
      const selectedRow = orderedRows.find((quote) => quote.is_selected === true) || latest

      return [{
        ...quotation,
        selected,
        quoted_at: latest?.created_at || quotation.created_at,
        agent_carrier: selectedRow?.carrier || null,
        agent_etd: selectedRow?.etd || null,
        agent_valid_until: selectedRow?.valid_until || null,
      }]
    })
    .sort((left, right) => timeValue(right.quoted_at) - timeValue(left.quoted_at))

  const selectedQuotationIds = new Set(
    quotationActivities.filter((quotation) => quotation.selected).map((quotation) => quotation.id)
  )
  const visibleShipments = shipments.filter(
    (shipment) => shipment.quotation_id && selectedQuotationIds.has(shipment.quotation_id)
  )
  const shipmentIds = new Set(visibleShipments.map((shipment) => shipment.id))
  const visibleBookings = bookings.filter(
    (booking) => booking.shipment_id && shipmentIds.has(booking.shipment_id)
  )
  const bookingsByShipment = new Map<string, AgentBooking[]>()

  for (const booking of visibleBookings) {
    const shipmentId = booking.shipment_id as string
    const current = bookingsByShipment.get(shipmentId) || []
    current.push(booking)
    bookingsByShipment.set(shipmentId, current)
  }

  const shipmentActivities = visibleShipments
    .map((shipment) => ({
      ...shipment,
      quotation: shipment.quotation_id
        ? quotationById.get(shipment.quotation_id) || null
        : null,
      bookings: (bookingsByShipment.get(shipment.id) || []).sort(
        (left, right) => timeValue(right.updated_at) - timeValue(left.updated_at)
      ),
    }))
    .sort((left, right) => {
      if (Boolean(left.closed_at) !== Boolean(right.closed_at)) return left.closed_at ? 1 : -1
      return timeValue(right.updated_at || right.created_at) - timeValue(left.updated_at || left.created_at)
    })

  const laneMap = new Map<string, AgentLaneUsage>()
  for (const quotation of quotationActivities.filter((item) => item.selected)) {
    const representativeShipment = shipmentActivities.find(
      (shipment) => shipment.quotation_id === quotation.id
    )
    const lane = laneFor(quotation, representativeShipment)
    const current = laneMap.get(lane.key) || { ...lane, selections: 0, shipments: 0 }
    current.selections += 1
    laneMap.set(lane.key, current)
  }
  for (const shipment of shipmentActivities) {
    const lane = laneFor(shipment.quotation, shipment)
    const current = laneMap.get(lane.key) || { ...lane, selections: 0, shipments: 0 }
    current.shipments += 1
    laneMap.set(lane.key, current)
  }

  const lanes = [...laneMap.values()].sort(
    (left, right) => right.shipments - left.shipments
      || right.selections - left.selections
      || left.key.localeCompare(right.key, 'es')
  )
  const lastActivityAt = latestValue([
    ...liveQuotes.map((quote) => quote.created_at),
    ...shipmentActivities.flatMap((shipment) => [shipment.updated_at, shipment.created_at]),
    ...visibleBookings.map((booking) => booking.updated_at),
  ])

  return {
    metrics: {
      offeredQuotations: quotationActivities.length,
      selectedQuotations: selectedQuotationIds.size,
      wonQuotations: quotationActivities.filter(
        (quotation) => quotation.selected && quotation.status === 'Ganada'
      ).length,
      shipments: shipmentActivities.length,
      activeShipments: shipmentActivities.filter((shipment) => !shipment.closed_at).length,
      bookings: new Set(visibleBookings.map((booking) => booking.id)).size,
      lastActivityAt,
    },
    quotations: quotationActivities,
    shipments: shipmentActivities,
    lanes,
  }
}
