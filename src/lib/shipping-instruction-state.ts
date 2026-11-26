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

/** Admin can complete both sides of the handoff within the current tenant. */
export function getShippingInstructionHandoffAccess(
  role: string | null | undefined,
  userId: string | undefined,
  routing: {
    created_by: string | null
    sales_submitted_at: string | null
    operations_accepted_at: string | null
    operations_assigned_to: string | null
    operational_status: string | null
    shipment_status: string | null
  } | null,
) {
  const closed = !routing || [routing.operational_status, routing.shipment_status]
    .some((status) => status === 'Finalizado' || status === 'Cancelada')
  const admin = role === 'Admin'
  return {
    canSubmit: Boolean(userId && routing && !closed && !routing.sales_submitted_at &&
      (admin
        ? ['Pendiente Validación', 'Asignado'].includes(routing.operational_status || '')
        : role === 'Ventas' && routing.created_by === userId &&
          routing.operational_status === 'Pendiente Validación')),
    canAccept: Boolean(userId && routing && !closed && routing.sales_submitted_at &&
      !routing.operations_accepted_at && (admin || (role === 'Operaciones' &&
        (!routing.operations_assigned_to || routing.operations_assigned_to === userId)))),
  }
}
