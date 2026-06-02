type PricingValidationInput = {
  selectedQuote?: {
    quote_type?: string | null
    tipo_transporte?: string | null
    service_product?: string | null
  } | null
  selectedAgentQuote?: {
    id?: string
    agent_name?: string | null
    agente_nombre?: string | null
    provider_name?: string | null
    agent?: string | null
    agent_id?: string | null
    carrier?: string | null
    valid_until?: string | null
    validity_date?: string | null
    final_cost?: number | string | null
    sari_cost?: number | string | null
    total_cost?: number | string | null
    suggested_sale?: number | string | null
    sale_amount?: number | string | null
  } | null
  pricingItems?: Array<{
    sale_amount?: number | string | null
    cost_amount?: number | string | null
    total_amount?: number | string | null
    quantity?: number | string | null
  }>
}

const normalizeText = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function requiresCarrier(
  quote?: PricingValidationInput['selectedQuote']
) {
  if (!quote) return true

  const quoteType = normalizeText(quote.quote_type)
  const serviceProduct = quote.service_product || ''

  if (serviceProduct === 'miami_lcl' || serviceProduct === 'miami_air') {
    return false
  }

  if (quoteType === 'fcl') {
    return true
  }

  if (quoteType === 'lcl') {
    return false
  }

  return false
}

export function calculateGrossProfitPercent({
  saleTotal,
  costTotal,
}: {
  saleTotal: number
  costTotal: number
}) {
  if (saleTotal <= 0) return 0

  return ((saleTotal - costTotal) / saleTotal) * 100
}

export function validatePricingCompleteness({
  selectedQuote,
  selectedAgentQuote,
  pricingItems = [],
}: PricingValidationInput) {
  const errors: string[] = []

  if (!selectedAgentQuote?.id) {
    errors.push('Debe seleccionar una tarifa activa de agente.')
  }

  const agentName =
    selectedAgentQuote?.agent_name ||
    selectedAgentQuote?.agente_nombre ||
    selectedAgentQuote?.provider_name ||
    selectedAgentQuote?.agent ||
    selectedAgentQuote?.agent_id

  if (!agentName) {
    errors.push('La tarifa seleccionada no tiene agente.')
  }

  if (requiresCarrier(selectedQuote) && !selectedAgentQuote?.carrier) {
    errors.push('La tarifa seleccionada no tiene carrier/naviera.')
  }

  if (!selectedAgentQuote?.valid_until && !selectedAgentQuote?.validity_date) {
    errors.push('La tarifa seleccionada no tiene vigencia.')
  }

  const finalCost = Number(
    selectedAgentQuote?.final_cost ||
      selectedAgentQuote?.sari_cost ||
      selectedAgentQuote?.total_cost ||
      0
  )

  if (finalCost <= 0) {
    errors.push('El costo final debe ser mayor a cero.')
  }

  if (pricingItems.length === 0) {
    errors.push('Debe existir al menos una linea de venta.')
  }

  const agentQuoteSale = Number(
    selectedAgentQuote?.suggested_sale ||
      selectedAgentQuote?.sale_amount ||
      0
  )

  const totalSale = pricingItems.reduce(
    (sum, item) =>
      sum +
      Number(item.sale_amount || item.total_amount || 0) *
        Number(item.quantity || 1),
    0
  )

  const totalCost = pricingItems.reduce(
    (sum, item) =>
      sum + Number(item.cost_amount || 0) * Number(item.quantity || 1),
    0
  )

  const saleForValidation = totalSale > 0 ? totalSale : agentQuoteSale
  const costForValidation = totalCost > 0 ? totalCost : finalCost
  const profit = saleForValidation - costForValidation
  const marginPercentage = calculateGrossProfitPercent({
    saleTotal: saleForValidation,
    costTotal: costForValidation,
  })

  if (saleForValidation <= 0) {
    errors.push('El total de venta debe ser mayor a cero.')
  }

  const warnings: string[] = []

  if (profit < 0) {
    warnings.push('El profit es negativo. Debes justificar esta aprobacion.')
  }

  if (profit >= 0 && marginPercentage < 5) {
    warnings.push('El margen es menor al 5%. Debes justificar esta aprobacion.')
  }

  if (saleForValidation < costForValidation) {
    warnings.push('La venta sugerida es menor que el costo final.')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    requiresReason: warnings.length > 0,
  }
}
