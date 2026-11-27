import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { DatosCotizacion } from './parse-cotizacion'
import { normalizeWhatsappPhone } from './whatsapp-intake'

/**
 * Acceso a datos del webhook de WhatsApp (Kapso).
 * El webhook llega sin sesion, por eso usa service role. Toda consulta recibe el
 * tenant resuelto por src/proxy.ts a partir del host y filtra por el: nunca se
 * devuelve un usuario ni una solicitud de otra empresa.
 * Esquema: supabase/migrations/20261126120000_whatsapp_quote_requests.sql
 */

export type UsuarioERP = { id: string; nombre: string }

function whatsappAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Falta configuración de Supabase en el servidor')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Busca al usuario de ventas/pricing del tenant por su número (solo dígitos). null si no está autorizado. */
export async function buscarUsuarioPorWhatsapp(tenantId: string, telefono: string): Promise<UsuarioERP | null> {
  const phone = normalizeWhatsappPhone(telefono)
  if (!phone) return null
  const { data, error } = await whatsappAdminClient()
    .rpc('whatsapp_find_sender', { p_tenant_id: tenantId, p_phone: phone })
    .maybeSingle()
  if (error) throw new Error(`No se pudo validar el remitente: ${error.message}`)
  const row = data as { profile_id: string; nombre: string } | null
  return row ? { id: row.profile_id, nombre: row.nombre } : null
}

/** true si ese mensaje de WhatsApp ya se registró como solicitud en el tenant. */
export async function yaProcesado(tenantId: string, whatsappMessageId: string): Promise<boolean> {
  const { data, error } = await whatsappAdminClient()
    .from('solicitudes_cotizacion')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('whatsapp_message_id', whatsappMessageId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo verificar el mensaje: ${error.message}`)
  return Boolean(data)
}

/** Crea la solicitud (idempotente por mensaje) y devuelve su código (SQ-0001). */
export async function crearSolicitudCotizacion(
  input: DatosCotizacion & {
    tenantId: string
    solicitadoPorId: string
    whatsappMessageId: string
    textoOriginal: string
    /** COTIZACION NUEVA: registrar aunque repita una solicitud de las últimas 24 horas. */
    forzar?: boolean
  },
): Promise<{ id: string; codigo: string; creada: boolean; duplicada: boolean }> {
  const { tenantId, solicitadoPorId, whatsappMessageId, textoOriginal, forzar = false, ...datos } = input
  const { data, error } = await whatsappAdminClient()
    .rpc('whatsapp_create_quote_request', {
      p_tenant_id: tenantId,
      p_profile_id: solicitadoPorId,
      p_message_id: whatsappMessageId,
      p_data: datos,
      p_texto: textoOriginal,
      p_force: forzar,
    })
    .single()
  if (error || !data) throw new Error(`No se pudo registrar la solicitud: ${error?.message ?? 'sin respuesta'}`)
  const row = data as { id: string; codigo: string; created: boolean; duplicate: boolean }
  return { id: row.id, codigo: row.codigo, creada: row.created, duplicada: row.duplicate }
}
