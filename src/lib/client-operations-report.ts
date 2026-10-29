import { supabase } from '@/src/lib/supabase/client'
import { aggregateBookingStatus } from '@/src/lib/booking-status'
import { resolveShippingInstructionStatus } from '@/src/lib/operation-status'
import { formatDateTime } from '@/src/lib/format'
import { readAllReportRows, readReportRowsByIds } from '@/src/lib/report-query'
import type { ClientOption } from '@/src/lib/client-search'
import type { ReportPdfData } from '@/src/components/pdf/report-pdf'

type Join<T> = T | T[] | null
export type ReportQuotation = {
  id: string; cliente_id: string | null; quotation_number: string | null
  status: string | null; deleted_at: string | null; origen: string | null
  puerto_origen: string | null; quote_type: string | null; tipo_transporte: string | null
  service_product: string | null
}
export type ReportShipment = {
  id: string; client_id: string | null; quotation_id: string | null
  shipment_number: string | null; origin: string | null; service_type: string | null
  operational_status: string | null; closed_at: string | null
  quotation: Join<ReportQuotation>
  shipping_instruction: Join<{
    id: string; consignee: string | null; origin_address: string | null
    deleted_at: string | null; shipment_status: string | null; operational_status: string | null
  }>
}
export type ReportBooking = {
  id: string; shipment_id: string | null; shipment_status: string | null
  booking_lifecycle_status: string
}
export type ClientOperationRow = {
  clientId?:string;clientName?:string
  id: string; quotationId: string | null; instructionId: string | null
  quotation: string; operation: string; origin: string; consignee: string
  modality: string; status: string; phase: 'approved' | 'active'
}
export type OperationReportScope = 'all' | 'active' | 'approved'
export type OperationReportMode = 'all' | 'FCL' | 'LCL' | 'other'

const quotationFields = 'id,cliente_id,quotation_number,status,deleted_at,origen,puerto_origen,quote_type,tipo_transporte,service_product'
const pending = 'Pendiente de confirmar'
const join = <T,>(value: Join<T>): T | null => Array.isArray(value) ? value[0] || null : value
const clean = (value?: string | null) => value?.trim() || ''
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const terminal = (value?: string | null) => ['finalizado', 'finalizada', 'cancelado', 'cancelada', 'cerrado', 'cerrada', 'entregado'].includes(normalized(clean(value)))

function modality(q: ReportQuotation | null, service?: string | null) {
  const type = clean(q?.quote_type).toUpperCase()
  if (['FCL', 'LCL', 'FTL', 'LTL'].includes(type)) return type
  const product = clean(q?.service_product || service)
  if (product === 'other_origin_fcl' || product === 'FCL') return 'FCL'
  if (['other_origin_lcl', 'miami_lcl', 'LCL'].includes(product)) return 'LCL'
  if (product === 'customs_only') return 'Aduanas'
  if (['miami_air', 'other_origin_air'].includes(product)) return 'Aéreo'
  return clean(q?.quote_type) || clean(q?.tipo_transporte) || pending
}

export function clientOperationRows(clientId: string, shipments: ReportShipment[], quotations: ReportQuotation[], bookings: ReportBooking[]): ClientOperationRow[] {
  // Count every linked shipment, including closed/hidden ones: a completed
  // quotation must never reappear as an approval awaiting an operation.
  const linked = new Set(shipments.map(shipment => shipment.quotation_id).filter(Boolean))
  const bookingGroups = new Map<string, ReportBooking[]>()
  for (const booking of bookings) {
    if (!booking.shipment_id || booking.booking_lifecycle_status !== 'ACTIVE') continue
    const group = bookingGroups.get(booking.shipment_id) || []
    group.push(booking); bookingGroups.set(booking.shipment_id, group)
  }
  const rows: ClientOperationRow[] = []
  for (const shipment of shipments) {
    const q = join(shipment.quotation), si = join(shipment.shipping_instruction)
    if (shipment.client_id !== clientId || (q && (q.cliente_id !== clientId || q.deleted_at)) || si?.deleted_at || shipment.closed_at) continue
    if ([shipment.operational_status, si?.operational_status, si?.shipment_status].some(terminal)) continue
    const operationBookings = bookingGroups.get(shipment.id) || []
    const aggregate = operationBookings.length ? aggregateBookingStatus(operationBookings) : ''
    if (terminal(aggregate)) continue
    const customs = [si?.operational_status, shipment.operational_status].find(status => ['En gestión aduanera', 'Liberado'].includes(status || ''))
    const canonicalStatus = clean(shipment.operational_status)
    const status = customs || aggregate || (canonicalStatus && canonicalStatus !== 'Sin bookings' ? canonicalStatus : si ? resolveShippingInstructionStatus(si) : '') || 'En preparación'
    rows.push({
      id: shipment.id, quotationId: q?.id || shipment.quotation_id, instructionId: si?.id || null,
      quotation: clean(q?.quotation_number) || 'Sin cotización vinculada',
      operation: clean(shipment.shipment_number) || 'Sin número asignado',
      origin: clean(shipment.origin) || clean(q?.origen) || clean(q?.puerto_origen) || clean(si?.origin_address) || pending,
      // The billed client and the consignee can be different legal entities.
      consignee: clean(si?.consignee) || pending, modality: modality(q, shipment.service_type), status, phase: 'active',
    })
  }
  for (const q of quotations) {
    if (q.cliente_id !== clientId || q.deleted_at || q.status !== 'Ganada' || linked.has(q.id)) continue
    rows.push({ id: `quotation-${q.id}`, quotationId: q.id, instructionId: null,
      quotation: clean(q.quotation_number) || 'Sin número asignado', operation: 'Por crear',
      origin: clean(q.origen) || clean(q.puerto_origen) || pending, consignee: pending,
      modality: modality(q), status: 'Aprobada · pendiente de operación', phase: 'approved' })
  }
  return rows.sort((a, b) => a.quotation.localeCompare(b.quotation, 'es', { numeric: true }) || a.operation.localeCompare(b.operation, 'es', { numeric: true }) || a.id.localeCompare(b.id))
}

export async function loadClientOperations(clientId: string, isCurrent: () => boolean) {
  const [shipments, quotations] = await Promise.all([
    readAllReportRows<ReportShipment>((from, to) => supabase.from('shipments').select(`
      id,client_id,quotation_id,shipment_number,origin,service_type,operational_status,closed_at,
      quotation:quotations (${quotationFields}),
      shipping_instruction:shipping_instructions (id,consignee,origin_address,deleted_at,shipment_status,operational_status)
    `).eq('client_id', clientId).order('id').range(from, to), { label: 'operaciones del cliente', isCurrent }),
    readAllReportRows<ReportQuotation>((from, to) => supabase.from('quotations').select(quotationFields)
      .eq('cliente_id', clientId).eq('status', 'Ganada').is('deleted_at', null).order('id').range(from, to), { label: 'cotizaciones aprobadas del cliente', isCurrent }),
  ])
  const bookings = await readReportRowsByIds<ReportBooking>(shipments.filter(s => !s.closed_at && !terminal(s.operational_status)).map(s => s.id),
    (ids, from, to) => supabase.from('bookings').select('id,shipment_id,shipment_status,booking_lifecycle_status')
      .in('shipment_id', ids).eq('booking_lifecycle_status', 'ACTIVE').order('id').range(from, to), { label: 'estados de embarque', isCurrent })
  return clientOperationRows(clientId, shipments, quotations, bookings)
}

export async function loadClientsOperations(clients:ClientOption[],isCurrent:()=>boolean){
 const requested=[...new Map(clients.map(c=>[c.id,c])).values()]
 if(requested.length===1)return (await loadClientOperations(requested[0].id,isCurrent)).map(row=>({...row,clientId:requested[0].id,clientName:requested[0].nombre||'Cliente'}))
 const ids=requested.map(c=>c.id)
 const [shipments,quotations]=await Promise.all([
  readReportRowsByIds<ReportShipment>(ids,(batch,from,to)=>supabase.from('shipments').select(`id,client_id,quotation_id,shipment_number,origin,service_type,operational_status,closed_at,quotation:quotations (${quotationFields}),shipping_instruction:shipping_instructions (id,consignee,origin_address,deleted_at,shipment_status,operational_status)`).in('client_id',batch).order('id').range(from,to),{label:'operaciones de los clientes',isCurrent}),
  readReportRowsByIds<ReportQuotation>(ids,(batch,from,to)=>supabase.from('quotations').select(quotationFields).in('cliente_id',batch).eq('status','Ganada').is('deleted_at',null).order('id').range(from,to),{label:'cotizaciones aprobadas',isCurrent}),
 ])
 const bookings=await readReportRowsByIds<ReportBooking>(shipments.filter(s=>!s.closed_at&&!terminal(s.operational_status)).map(s=>s.id),(batch,from,to)=>supabase.from('bookings').select('id,shipment_id,shipment_status,booking_lifecycle_status').in('shipment_id',batch).eq('booking_lifecycle_status','ACTIVE').order('id').range(from,to),{label:'estados de embarque',isCurrent})
 return requested.flatMap(c=>clientOperationRows(c.id,shipments,quotations,bookings).map(row=>({...row,clientId:c.id,clientName:c.nombre||'Cliente'})))
}

export function filterClientOperations(rows: ClientOperationRow[], scope: OperationReportScope|OperationReportScope[], mode: OperationReportMode|OperationReportMode[],statuses:string[]=[]) {
  const scopes=Array.isArray(scope)?scope:[scope],modes=Array.isArray(mode)?mode:[mode]
  return rows.filter(row => (!scopes.length||scopes.includes('all')||scopes.includes(row.phase))&&(!modes.length||modes.includes('all')||modes.some(m=>m==='other'?!['FCL','LCL'].includes(row.modality):row.modality===m))&&(!statuses.length||statuses.includes(row.status)))
}

export function clientOperationsReport(client: ClientOption, rows: ClientOperationRow[], scope: OperationReportScope|OperationReportScope[], mode: OperationReportMode|OperationReportMode[], generatedAt: string, clients:ClientOption[]=[client],statuses:string[]=[]): ReportPdfData {
  const multiple=clients.length>1,scopes=Array.isArray(scope)?scope:[scope],modes=Array.isArray(mode)?mode:[mode]
  const scopeLabel=!scopes.length||scopes.includes('all')||scopes.length>1?'Aprobadas pendientes de operación y operaciones en curso':scopes[0]==='active'?'Operaciones en curso':'Aprobadas pendientes de operación'
  const modeLabel=!modes.length||modes.includes('all')?'Todas las modalidades':modes.map(m=>m==='other'?'Otras modalidades':`Modalidad: ${m}`).join(', ')
  return {
    audience: multiple?undefined:'client', title: 'Operaciones aprobadas y activas',
    subtitle: multiple?`Consolidado interno · ${clients.length} clientes`:[client.nombre || 'Cliente', client.codigo_cliente, client.rtn ? `RTN ${client.rtn}` : ''].filter(Boolean).join(' · '),
    generatedAt: formatDateTime(generatedAt),
    filters: [scopeLabel,modeLabel,...(statuses.length?[`Estados: ${statuses.join(', ')}`]:[]),...(multiple?[`Clientes: ${clients.map(c=>c.nombre||'Cliente').join(', ')}`]:[])],
    metrics: [{ label: 'Registros', value: String(rows.length) }, { label: 'FCL', value: String(rows.filter(r => r.modality === 'FCL').length) }, { label: 'LCL', value: String(rows.filter(r => r.modality === 'LCL').length) }],
    columns: [...(multiple?[{key:'client',label:'Cliente'}]:[]),{ key: 'quotation', label: 'N.º cotización', width: '14%' }, { key: 'operation', label: 'N.º operación', width: '13%' },
      { key: 'origin', label: 'Lugar de origen', width: '20%' }, { key: 'consignee', label: 'Consignatario', width: '24%' },
      { key: 'modality', label: 'Modalidad', width: '8%' }, { key: 'status', label: 'Estado', width: '21%' }],
    // Deliberate allowlist: no internal identifiers, notes, suppliers or prices.
    rows: rows.map(({ clientName,quotation, operation, origin, consignee, modality, status }) => ({ ...(multiple?{client:clientName||'Cliente'}:{}),quotation, operation, origin, consignee, modality, status })),
  }
}
