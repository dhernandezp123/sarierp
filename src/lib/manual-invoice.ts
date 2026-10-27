import { formatDate, parseDateValue, toMiamiDateInputValue } from './format'

export const MANUAL_INVOICE_PATH = '/manual-invoices'
export const MANUAL_INVOICE_ROLES = ['Admin', 'Operaciones', 'Finanzas', 'Contabilidad']
export const MANUAL_INVOICE_MAX_BYTES = 3 * 1024 * 1024
export const MANUAL_INVOICE_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const MANUAL_INVOICE_REMARKS = 'OJO: TODOS LOS PAGOS PUEDEN REALIZARSE A TRAVES DE TRANSFERENCIA BANCARIA O TARJETA DE CREDITO, PREGUNTENOS A EL RESPECTO'

export const manualInvoiceFields = [
  ['invoice_number', 'Invoice #', 40], ['issue_date', 'Fecha', 10], ['due_date', 'Vencimiento', 10],
  ['bill_to_name', 'Bill to · Nombre', 100], ['bill_to_address', 'Bill to · Dirección', 180],
  ['bill_to_city', 'Bill to · Ciudad / país', 100], ['file_number', 'File #', 40], ['customer_reference', 'Cust. Ref.', 60],
  ['shipper', 'Shipper', 100], ['consignee', 'Consignee', 100], ['carrier', 'Carrier', 100],
  ['goods_description', 'Desc of goods', 120], ['hbl', 'HAWB/HBL', 50], ['mbl', 'MAWB/MBL', 50],
  ['origin', 'Origin', 80], ['destination', 'Dest', 80], ['charges_term', 'Charges', 30],
  ['pieces', 'Pieces', 20], ['weight_lb', 'Weight (Lb)', 30], ['booking_number', 'Booking #', 40],
  ['container_size', 'Cont Size', 30], ['container_number', 'Container #', 60], ['consol_number', 'Consol #', 40],
] as const

export type ManualInvoiceField = typeof manualInvoiceFields[number][0]
export type ManualInvoiceDateOrder = 'mdy' | 'dmy'
export type ManualInvoiceItem = { description: string; amount: string }
export type ManualInvoiceData = Record<ManualInvoiceField, string> & {
  issuer?: ManualInvoiceIssuer
  date_format: ManualInvoiceDateOrder
  items: ManualInvoiceItem[]
  warehouse_receipts: string[]
}
export type ManualInvoiceIssuer = { name: string; address: string; phone: string; email: string; website: string }

export function validateManualInvoiceIssuer(value: unknown): ManualInvoiceIssuer {
  if (!value || typeof value !== 'object') throw new Error('Completa el emisor SARI USA en Configuración de empresa.')
  const source = value as Record<string, unknown>
  const result = {} as ManualInvoiceIssuer
  for (const key of ['name','address','phone','email','website'] as const) {
    if (typeof source[key] !== 'string' || source[key].length > 500 || /[\u0000-\u001f\u007f]/.test(source[key])) throw new Error('Revisa los datos del emisor SARI USA.')
    result[key] = source[key].trim()
    if (key !== 'website' && !result[key]) throw new Error('Completa el emisor SARI USA en Configuración de empresa.')
  }
  return result
}
export type SavedManualInvoice = {
  id: string; invoice_number: string; client_name: string; total: number; created_at: string; data: ManualInvoiceData
}

export function blankManualInvoice(): ManualInvoiceData {
  const fields = Object.fromEntries(manualInvoiceFields.map(([key]) => [key, ''])) as Record<ManualInvoiceField, string>
  return { ...fields, date_format: 'mdy', issue_date: toMiamiDateInputValue(), due_date: toMiamiDateInputValue(),
    shipper: 'SARI EXPRESS CONSOLIDATORS', origin: 'PORT EVERGLADES, FL', destination: 'PUERTO CORTES/HONDURAS',
    charges_term: 'COLLECT', items: [{ description: '', amount: '' }], warehouse_receipts: [] }
}

/** Standalone SARI PDFs use their saved format; other ERP documents keep DD/MM. */
export function formatManualInvoiceDate(value: string, order: ManualInvoiceDateOrder = 'dmy'): string {
  if (order === 'dmy') return formatDate(value, '')
  const date = parseDateValue(value)
  return date ? date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''
}

/** USD strings are kept as strings while editing; totals are calculated in cents. */
export function manualInvoiceCents(value: string): number | null {
  const clean = value.trim().replace(/^(?:USD\s*|\$\s*)/i, '')
  if (!/^(?:\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.\d{1,2})?$/.test(clean)) return null
  const [whole, fraction = ''] = clean.replaceAll(',', '').split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export function manualInvoiceTotal(data: ManualInvoiceData): number {
  return data.items.reduce((sum, item) => sum + (manualInvoiceCents(item.amount) ?? 0), 0) / 100
}

export function validateManualInvoice(value: unknown, requireComplete = true): ManualInvoiceData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La factura no es válida.')
  const source = value as Record<string, unknown>
  // Older saved invoices printed DD/MM and must keep that format when reopened.
  const date_format = source.date_format === undefined ? 'dmy' : source.date_format
  if (date_format !== 'mdy' && date_format !== 'dmy') throw new Error('Selecciona MM/DD/YYYY o DD/MM/YYYY para las fechas de la factura.')
  const fields = {} as Record<ManualInvoiceField, string>
  for (const [key, label, max] of manualInvoiceFields) {
    if (typeof source[key] !== 'string' || source[key].length > max || /[\u0000-\u001f\u007f]/.test(source[key])) {
      throw new Error(`Revisa ${label}: máximo ${max} caracteres.`)
    }
    fields[key] = source[key].trim()
  }
  for (const key of ['issue_date', 'due_date'] as const) {
    if (fields[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(fields[key]) || !parseDateValue(fields[key]))) {
      throw new Error('Revisa las fechas de la factura.')
    }
  }
  if (requireComplete && (!fields.invoice_number || !fields.bill_to_name || !fields.issue_date || !fields.due_date)) {
    throw new Error('Completa número de factura, cliente, fecha y vencimiento.')
  }
  if (!Array.isArray(source.items) || source.items.length > 100 || (requireComplete && !source.items.length)) {
    throw new Error('Agrega entre 1 y 100 cargos.')
  }
  const items = source.items.map((value): ManualInvoiceItem => {
    if (!value || typeof value !== 'object') throw new Error('Cargo no válido.')
    const item = value as Record<string, unknown>
    if (typeof item.description !== 'string' || item.description.length > 180 || /[\u0000-\u001f\u007f]/.test(item.description)
      || typeof item.amount !== 'string' || (item.amount !== '' && manualInvoiceCents(item.amount) === null)) {
      throw new Error('Revisa los cargos: descripción de hasta 180 caracteres e importe USD válido (ej. 3,300.00).')
    }
    if (requireComplete && (!item.description.trim() || item.amount === '')) throw new Error('Completa la descripción y el importe de cada cargo.')
    return { description: item.description.trim(), amount: item.amount.trim() }
  })
  if (!Array.isArray(source.warehouse_receipts) || source.warehouse_receipts.length > 200
    || source.warehouse_receipts.some((wr) => typeof wr !== 'string' || wr.length > 40 || /[\u0000-\u001f\u007f]/.test(wr))) {
    throw new Error('Revisa los WR: hasta 200 referencias de 40 caracteres.')
  }
  return { ...fields, date_format, items, warehouse_receipts: source.warehouse_receipts.map((wr: string) => wr.trim()).filter(Boolean),
    ...(source.issuer ? { issuer: validateManualInvoiceIssuer(source.issuer) } : {}),
  }
}

export type ManualInvoicePrintRow = { description: string; amount: string; wr?: boolean }

/** Explicit line wrapping and pagination keep long charges out of the total/remarks boxes. */
export function manualInvoicePrintPages(data: ManualInvoiceData): ManualInvoicePrintRow[][] {
  const rows: ManualInvoicePrintRow[] = []
  for (const item of data.items) {
    const lines = item.description.match(/.{1,56}(?:\s|$)|.{1,56}/g) || ['']
    lines.forEach((line, index) => rows.push({ description: line.trim(), amount: index === 0 ? item.amount : '' }))
  }
  data.warehouse_receipts.forEach((wr) => rows.push({ description: `WR #: ${wr}`, amount: '', wr: true }))
  const pages: ManualInvoicePrintRow[][] = []
  for (let index = 0; index < rows.length; index += 30) pages.push(rows.slice(index, index + 30))
  return pages.length ? pages : [[]]
}

export function manualInvoiceFileName(data: ManualInvoiceData) {
  return `SARI-USA-Invoice-${data.invoice_number.replace(/[^a-zA-Z0-9_-]/g, '_') || 'manual'}.pdf`
}

export function manualInvoiceMime(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (ascii(0, 5) === '%PDF-') return 'application/pdf'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}
