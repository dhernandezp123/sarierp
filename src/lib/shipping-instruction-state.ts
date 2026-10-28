type ShippingInstructionRelations = {
  cliente?: unknown
  quotation?: unknown
}

/** Match the customer source used by the Shipping Instruction PDF. */
export function getShippingInstructionClient<T>(routing: {
  quotation?: { cliente?: T | null } | null
  cliente?: T | null
}): T | null {
  return routing.quotation?.cliente ?? routing.cliente ?? null
}

/**
 * RPC mutations return only the physical shipping_instructions row. Preserve
 * the embedded relations loaded by PostgREST so the detail view does not lose
 * its quotation and client context after a successful mutation.
 */
export function mergeShippingInstructionMutation<
  T extends ShippingInstructionRelations,
>(current: T | null, updated: T): T {
  if (!current) return updated

  return {
    ...current,
    ...updated,
    cliente: updated.cliente ?? current.cliente,
    quotation: updated.quotation ?? current.quotation,
  }
}
