type PricingValidationInput = {
  selectedAgentQuote?: {
    id?: string
    agent_name?: string | null
    agent?: string | null
    carrier?: string | null
    valid_until?: string | null
    validity_date?: string | null
    final_cost?: number | string | null
    sari_cost?: number | string | null
    suggested_sale?: number | string | null
    sale_amount?: number | string | null
    profit_amount?: number | string | null
    profit?: number | string | null
  } | null
  pricingItems?: Array<{
    sale_amount?: number | string | null
    cost_amount?: number | string | null
    total_amount?: number | string | null
  }>
}

export function validatePricingCompleteness({
  selectedAgentQuote,
  pricingItems = [],
}: PricingValidationInput) {
  const errors: string[] = []

  if (!selectedAgentQuote?.id) {
    errors.push('Debe seleccionar una tarifa activa de agente.')
  }

  if (!selectedAgentQuote?.agent_name && !selectedAgentQuote?.agent) {
    errors.push('La tarifa seleccionada no tiene agente.')
  }

  if (!selectedAgentQuote?.carrier) {
    errors.push('La tarifa seleccionada no tiene carrier/naviera.')
  }

  if (!selectedAgentQuote?.valid_until && !selectedAgentQuote?.validity_date) {
    errors.push('La tarifa seleccionada no tiene vigencia.')
  }

  const finalCost = Number(
    selectedAgentQuote?.final_cost ||
      selectedAgentQuote?.sari_cost ||
      0
  )

  const sale = Number(
    selectedAgentQuote?.suggested_sale ||
      selectedAgentQuote?.sale_amount ||
      0
  )

  const profit =
    Number(
      selectedAgentQuote?.profit_amount ||
        selectedAgentQuote?.profit ||
        0
    ) || sale - finalCost

  if (finalCost <= 0) {
    errors.push('El costo final debe ser mayor a cero.')
  }

  if (sale <= 0) {
    errors.push('La venta sugerida debe ser mayor a cero.')
  }

  if (pricingItems.length === 0) {
    errors.push('Debe existir al menos una línea de venta.')
  }

  const totalSale = pricingItems.reduce(
    (sum, item) => sum + Number(item.sale_amount || item.total_amount || 0),
    0
  )

  if (totalSale <= 0) {
    errors.push('El total de venta debe ser mayor a cero.')
  }

  const warnings: string[] = []

  const marginPercentage =
    sale > 0 ? (profit / sale) * 100 : 0

  if (profit < 0) {
    warnings.push('El profit es negativo. Debes justificar esta aprobación.')
  }

  if (profit >= 0 && marginPercentage < 5) {
    warnings.push('El margen es menor al 5%. Debes justificar esta aprobación.')
  }

  if (sale < finalCost) {
    warnings.push('La venta sugerida es menor que el costo final.')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    requiresReason: warnings.length > 0,
  }
}
