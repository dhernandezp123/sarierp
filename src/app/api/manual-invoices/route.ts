import { authorizeManualInvoices, manualInvoiceErrorResponse, ManualInvoiceError, readLimitedInvoiceBody } from '@/src/lib/server/manual-invoices'
import { manualInvoiceTotal, validateManualInvoice } from '@/src/lib/manual-invoice'
import { literalTextFilter } from '@/src/lib/postgrest-search'

export async function GET(request: Request) {
  try {
    const { supabase, tenant } = await authorizeManualInvoices(request)
    const params = new URL(request.url).searchParams
    const rawOffset = params.get('offset') || '0'
    const rawSize = params.get('pageSize') || '25'
    const search = (params.get('search') || '').trim()
    if (!/^\d+$/.test(rawOffset) || !/^\d+$/.test(rawSize) || !Number.isSafeInteger(Number(rawOffset))
      || Number(rawOffset) > 10000000 || ![25,50,100].includes(Number(rawSize)) || search.length > 120) {
      throw new ManualInvoiceError('Paginacion o busqueda no valida.', 400)
    }
    const offset = Number(rawOffset), pageSize = Number(rawSize)
    let query = supabase.from('manual_invoices').select('id,invoice_number,client_name,total,created_at,data', { count: 'exact' })
      .eq('tenant_id', tenant.id)
    if (search) query = query.or(literalTextFilter(['invoice_number','client_name'], search))
    const { data, error, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || !data || (offset < count && data.length === 0)) {
      throw new ManualInvoiceError('No se pudo cargar el historial completo. Reintenta la consulta.', 503)
    }
    const nextOffset = offset + data.length
    return Response.json({ documents: data, total: count, nextOffset, hasMore: nextOffset < count }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return manualInvoiceErrorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const { supabase, tenant, user } = await authorizeManualInvoices(request)
    let source: unknown
    try { source = JSON.parse((await readLimitedInvoiceBody(request, 128 * 1024)).toString('utf8')) }
    catch (error) { if (error instanceof ManualInvoiceError) throw error; throw new ManualInvoiceError('Formulario no válido.', 400) }
    let data
    try { data = validateManualInvoice(source) } catch (error) { throw new ManualInvoiceError((error as Error).message, 400) }
    const { data: saved, error } = await supabase.from('manual_invoices').insert({ tenant_id: tenant.id, created_by: user.id,
      invoice_number: data.invoice_number, client_name: data.bill_to_name, total: manualInvoiceTotal(data), data })
      .select('id,invoice_number,client_name,total,created_at,data').single()
    if (error) throw new ManualInvoiceError('No se pudo guardar la factura. Verifica que la migración del módulo esté aplicada e intenta nuevamente.', 503)
    return Response.json({ document: saved }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return manualInvoiceErrorResponse(error) }
}
