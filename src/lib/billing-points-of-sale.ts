import type { SupabaseClient } from '@supabase/supabase-js'

export function validateBillingPointsOfSale(points: string[]): string | null {
  if (!points.length || points.some(point => !point.trim() || point.trim().length > 120)) {
    return 'Registra al menos un punto de venta, con nombres de 1 a 120 caracteres.'
  }
  if (new Set(points.map(point => point.trim().toLowerCase())).size !== points.length) {
    return 'Los puntos de venta no pueden repetirse.'
  }
  return null
}

export async function loadBillingPointsOfSale(client: Pick<SupabaseClient, 'rpc'>) {
  const { data, error } = await client.rpc('get_billing_points_of_sale')
  return { data: Array.isArray(data) ? data as string[] : [], error }
}
