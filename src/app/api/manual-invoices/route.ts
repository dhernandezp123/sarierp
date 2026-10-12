import { authorizeManualInvoices, manualInvoiceErrorResponse, ManualInvoiceError, readLimitedInvoiceBody } from '@/src/lib/server/manual-invoices'
import { manualInvoiceTotal, validateManualInvoice } from '@/src/lib/manual-invoice'

export async function GET(request: Request) {
  try {
    const { supabase, tenant } = await authorizeManualInvoices(request)
    const { data, error } = await supabase.from('manual_invoices').select('id,invoice_number,client_name,total,created_at,data')
      .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(100)
    if (error) throw new ManualInvoiceError('No se pudo cargar el historial. Verifica que la migración del módulo esté aplicada.', 503)
    return Response.json({ documents: data }, { headers: { 'Cache-Control': 'no-store' } })
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
