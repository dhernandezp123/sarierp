import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllReportRows, readReportRowsByIds } from './report-query'

type PackageRow = { id: string; [field: string]: unknown }
type PackageDocument = { id: string; package_id: string; file_name: string; file_path: string; status: string; created_at: string }

export async function loadMiamiInventory(client: Pick<SupabaseClient, 'from'>, isCurrent = () => true) {
  const rows = await readAllReportRows((from, to) => client.from('miami_packages')
    .select('id, tracking_number, carrier, tipo_carga, cargo_status, status, weight_lbs, warehouse_number, cliente_id, rack_location, manifest_id, received_at, clientes(nombre)')
    .order('received_at', { ascending: false }).order('id').range(from, to),
  { label: 'inventario Miami', isCurrent }) as PackageRow[]
  const documents = await readReportRowsByIds<PackageDocument>(rows.map(row => row.id), (batch, from, to) => client.from('miami_package_documents')
    .select('id, package_id, file_name, file_path, status, created_at').in('package_id', batch).order('id').range(from, to),
  { label: 'documentos de paquetes', isCurrent })
  const grouped = new Map<string, PackageDocument[]>()
  for (const document of documents) { const group = grouped.get(document.package_id) || []; group.push(document); grouped.set(document.package_id, group) }
  return rows.map(row => ({ ...row, miami_package_documents: grouped.get(row.id) || [] }))
}

export async function loadMiamiDispatch(client: Pick<SupabaseClient, 'from'>, isCurrent = () => true) {
  const [packages, shipments] = await Promise.all([
    readAllReportRows((from, to) => client.from('miami_packages')
      .select('id, tracking_number, carrier, tipo_carga, cargo_status, weight_lbs, warehouse_number, received_at, clientes(nombre, codigo_cliente)')
      .in('cargo_status', ['Recibido en Miami', 'En Consolidación'])
      .order('received_at').order('id').range(from, to), { label: 'paquetes disponibles para despacho', isCurrent }),
    readAllReportRows((from, to) => client.from('miami_shipments')
      .select('id, shipment_number, transport_mode, status, total_packages, total_weight_lbs, dispatched_at')
      .order('dispatched_at', { ascending: false }).order('id').range(from, to), { label: 'embarques Miami', isCurrent }),
  ])
  return { packages, shipments }
}
