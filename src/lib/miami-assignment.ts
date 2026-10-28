import type { SupabaseClient } from '@supabase/supabase-js'

export type MiamiReceiptInput = {
  tracking_number: string
  carrier?: string | null
  tipo_carga?: string
  weight_lbs?: number | null
  weight_kg?: number | null
  length_in?: number | null
  width_in?: number | null
  height_in?: number | null
  description?: string | null
  notes?: string | null
}

export type MiamiAssignmentResult = {
  id: string
  tracking_number: string
  status: string
  warehouse_number: string | null
  cliente_id: string | null
  manifest_id: string | null
  assigned_at: string | null
  assigned_by: string | null
}

function persistedPackage(data: unknown): MiamiAssignmentResult {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : data
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('No se confirmó el paquete. Actualiza la lista antes de reintentar.')
  }
  const result = row as MiamiAssignmentResult
  if (typeof result.id !== 'string' || !result.id || typeof result.tracking_number !== 'string'
    || !result.tracking_number || !['Sin asignar', 'Asignado'].includes(result.status)) {
    throw new Error('No se confirmó el paquete. Actualiza la lista antes de reintentar.')
  }
  if (result.status === 'Asignado' && (typeof result.cliente_id !== 'string' || !result.cliente_id
    || typeof result.warehouse_number !== 'string' || !result.warehouse_number.trim()
    || typeof result.assigned_at !== 'string' || !result.assigned_at
    || typeof result.assigned_by !== 'string' || !result.assigned_by)) {
    throw new Error('No se confirmó la asignación completa. Actualiza la lista antes de reintentar.')
  }
  if (result.status === 'Sin asignar' && (result.cliente_id !== null || result.warehouse_number !== null
    || result.assigned_at !== null || result.assigned_by !== null)) {
    throw new Error('No se confirmó un ingreso completo. Actualiza el inventario antes de reintentar.')
  }
  return result
}

export async function assignMiamiPackage(
  client: Pick<SupabaseClient, 'rpc'>,
  packageId: string,
  clientId: string,
  manifestId: string | null = null
) {
  const { data, error } = await client.rpc('assign_miami_package', {
    p_package_id: packageId, p_cliente_id: clientId, p_expected_manifest_id: manifestId,
  })
  if (error) throw new Error(error.message)
  const result = persistedPackage(data)
  if (result.id !== packageId || result.cliente_id !== clientId || result.status !== 'Asignado'
    || result.manifest_id !== manifestId) {
    throw new Error('No se confirmó la asignación solicitada. Actualiza la lista antes de reintentar.')
  }
  return result
}

export async function receiveMiamiPackage(
  client: Pick<SupabaseClient, 'rpc'>,
  input: MiamiReceiptInput,
  clientId: string | null = null
) {
  const tracking = input.tracking_number.trim().toUpperCase()
  if (!tracking) throw new Error('El tracking es requerido')
  const { data, error } = await client.rpc('receive_miami_package', {
    p_package_data: { ...input, tracking_number: tracking }, p_cliente_id: clientId,
  })
  if (error) throw new Error(error.message)
  const result = persistedPackage(data)
  if (result.tracking_number !== tracking || result.manifest_id !== null
    || (clientId && (result.cliente_id !== clientId || result.status !== 'Asignado'))) {
    throw new Error('No se confirmó el ingreso solicitado. Actualiza el inventario antes de reintentar.')
  }
  return result
}
