import type { SupabaseClient } from '@supabase/supabase-js'
import { completeRequest, requestKey } from './pending-request'

export const MIAMI_INCIDENT_TYPES = ['Dañado', 'Incompleto', 'No reconozco este paquete', 'Pérdida', 'Otro'] as const
export const INCIDENT_DESCRIPTION_LIMIT = 5000
type Identity = { userId: string; tenantId: string; clientId: string }
type Input = { packageId: string; tipo: string; descripcion: string }
type Receipt = {
  incident_id: string; package_id: string; cliente_id: string; tenant_id: string
  created_by: string; request_key: string; tipo: string; descripcion: string
  status: string; package_status: string; tracking_number: string; already_applied: boolean
}

/** A payload fingerprint keeps retries stable without persisting description text. */
export async function reportMiamiIncident(client: Pick<SupabaseClient, 'rpc'>, input: Input, identity: Identity, isCurrent = () => true): Promise<Receipt> {
  const description = input.descripcion.trim()
  if (!identity.userId || !identity.tenantId || !identity.clientId) throw new Error('Se requiere una sesión de cliente activa.')
  if (!input.packageId || !MIAMI_INCIDENT_TYPES.some(tipo => tipo === input.tipo) || !description || description.length > INCIDENT_DESCRIPTION_LIMIT) {
    throw new Error('Selecciona un paquete, un tipo y una descripción de hasta 5000 caracteres.')
  }
  const fingerprint = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([input.packageId, input.tipo, description])))
  const hash = Array.from(new Uint8Array(fingerprint), value => value.toString(16).padStart(2, '0')).join('')
  const scope = `sari:miami-incident:${identity.tenantId}:${identity.userId}:${identity.clientId}:${hash}`
  const key = requestKey(scope)
  if (!isCurrent()) throw new Error('La sesión cambió. Actualiza el portal antes de reportar.')
  const { data, error } = await client.rpc('report_miami_incident', {
    p_package_id: input.packageId, p_tipo: input.tipo, p_descripcion: description, p_request_key: key, p_expected_user_id: identity.userId,
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) && data.length === 1 ? data[0] : data
  const receipt = row as Receipt | null
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || typeof receipt.incident_id !== 'string' || !receipt.incident_id
    || receipt.package_id !== input.packageId || receipt.cliente_id !== identity.clientId
    || receipt.tenant_id !== identity.tenantId || receipt.created_by !== identity.userId || receipt.request_key !== key
    || receipt.tipo !== input.tipo || receipt.descripcion !== description || typeof receipt.already_applied !== 'boolean'
    || !['Abierta', 'En revisión', 'Resuelta', 'Cerrada'].includes(receipt.status)
    || typeof receipt.tracking_number !== 'string' || !receipt.tracking_number
    || !['Asignado', 'Con incidencia', 'Entregado'].includes(receipt.package_status)
    || (!receipt.already_applied && (receipt.status !== 'Abierta' || receipt.package_status !== 'Con incidencia'))) {
    throw new Error('No se confirmó el reporte. Consulta Incidencias antes de reintentar con los mismos datos.')
  }
  completeRequest(scope, key)
  return receipt
}
