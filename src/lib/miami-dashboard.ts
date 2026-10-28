import type { SupabaseClient } from '@supabase/supabase-js'
import { miamiDayRange } from './format'

type ManifestRow = {
  id: string
  manifest_number: string
  status: string
  total_packages: number
  created_at: string
  received_by: string | null
}
type PackageRow = {
  id: string
  tracking_number: string
  carrier: string | null
  weight_lbs: number | null
  status: string
  received_at: string
  warehouse_number: string | null
}
export type MiamiDashboardData = {
  metrics: { sinAsignar: number; asignadosHoy: number; manifiestoAbiertos: number; recibidosHoy: number }
  openManifests: ManifestRow[]
  unassignedPackages: PackageRow[]
}

/** Publish a complete read only: a missing count/list is not a verified zero. */
export async function loadMiamiDashboard(client: Pick<SupabaseClient, 'from'>, tenantId: string, now = new Date()): Promise<MiamiDashboardData> {
  if (!tenantId) throw new Error('Se requiere una empresa activa para consultar Miami.')
  const { start, end } = miamiDayRange(now)
  const results = await Promise.all([
    client.from('miami_packages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'Sin asignar'),
    client.from('miami_packages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'Asignado').gte('assigned_at', start).lt('assigned_at', end),
    client.from('miami_manifests').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'Abierto'),
    client.from('miami_packages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('received_at', start).lt('received_at', end),
    client.from('miami_manifests').select('id, manifest_number, status, total_packages, created_at, received_by')
      .eq('tenant_id', tenantId).eq('status', 'Abierto').order('created_at', { ascending: false }).limit(10),
    client.from('miami_packages').select('id, tracking_number, carrier, weight_lbs, status, received_at, warehouse_number')
      .eq('tenant_id', tenantId).eq('status', 'Sin asignar').order('received_at', { ascending: false }).limit(15),
  ])
  const labels = ['paquetes sin asignar', 'asignados hoy', 'manifiestos abiertos', 'recibidos hoy', 'lista de manifiestos', 'lista de paquetes']
  for (const [index, result] of results.entries()) {
    const invalid = index < 4
      ? typeof result.count !== 'number' || !Number.isInteger(result.count) || result.count < 0
      : !Array.isArray(result.data)
    if (result.error || invalid) throw new Error(`No se pudo cargar ${labels[index]}. Reintenta la consulta.`)
  }
  return {
    metrics: { sinAsignar: results[0].count!, asignadosHoy: results[1].count!, manifiestoAbiertos: results[2].count!, recibidosHoy: results[3].count! },
    openManifests: results[4].data as ManifestRow[],
    unassignedPackages: results[5].data as PackageRow[],
  }
}
