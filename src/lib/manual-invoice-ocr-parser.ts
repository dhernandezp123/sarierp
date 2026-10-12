import { manualInvoiceFields, manualInvoiceCents, validateManualInvoice, type ManualInvoiceData, type ManualInvoiceField } from './manual-invoice'
import { parseDateValue } from './format'

export type InvoiceOcrWord = { text: string; x: number; y: number; width: number; height: number; confidence?: number }
export type InvoiceOcrPage = { width: number; height: number; words: InvoiceOcrWord[] }
export type InvoiceDateOrder = 'mdy' | 'dmy'
type Row = { y: number; height: number; words: InvoiceOcrWord[]; text: string }
const labels: Partial<Record<ManualInvoiceField, RegExp>> = {
  invoice_number: /\bInvoice\s*[#№:]\s*:?/i, issue_date: /\bDate\s*:/i, due_date: /\bDue\s*date\s*:/i,
  file_number: /\bFile\s*[#№:]\s*:?/i, customer_reference: /\bCust\.?\s*Ref\.?\s*:/i,
  shipper: /\bShipper\s*:?/i, consignee: /\bConsignee\s*:?/i, carrier: /\bCarrier\s*:?/i,
  goods_description: /\bDesc(?:ription)?\s*(?:of\s*)?goods\s*:?/i,
  hbl: /\b(?:(?:HAWB\s*\/\s*HBL|HAWBHBL)\s*:?|HBL\s*:)/i,
  mbl: /\b(?:(?:MAWB\s*\/\s*MBL|MAWBMBL)\s*:?|MBL\s*:)/i,
  origin: /\bOrigin\s*:?/i, destination: /\bDest(?:ination)?\s*:?/i,
  charges_term: /\bCharges\s*:/i, pieces: /\bPieces\s*:?/i, weight_lb: /\bWeight\s*:?/i,
  booking_number: /\bBooking\s*[#№:]\s*:?/i, container_size: /\bCont\.?\s*Size\s*:?/i,
  container_number: /\bContainer\s*[#№:]\s*:?/i, consol_number: /\bConsol\s*[#№:]\s*:?/i,
}
const billLabel = /\bBill\s*to\s*:?/i
const chargeHeading = /Description\s+of\s+Charges/i
const totalLabel = /Total\s*Amount\s*:?/i
const clean = (text: string) => text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()

export function invoiceOcrRows(page: InvoiceOcrPage): Row[] {
  const rows: Row[] = []
  const words = page.words.filter((w) => clean(w.text) && [w.x, w.y, w.width, w.height].every(Number.isFinite))
    .sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2) || a.x - b.x)
  for (const word of words) {
    const center = word.y + word.height / 2
    const row = rows.slice(-3).findLast((r) => Math.abs(r.y - center) <= Math.max(2, Math.min(r.height, word.height) * 0.65))
    if (row) { row.words.push(word); row.height = Math.max(row.height, word.height) }
    else rows.push({ y: center, height: word.height, words: [word], text: '' })
  }
  return rows.map((r) => ({ ...r, words: r.words.sort((a, b) => a.x - b.x), text: clean(r.words.map((w) => w.text).join(' ')) }))
}

function matches(row: Row) {
  return Object.entries(labels).flatMap(([key, pattern]) => {
    // The ordinary Date label must not capture the Due date value.
    const text = key === 'issue_date' ? row.text.replace(/Due\s*date/ig, (s) => ' '.repeat(s.length)) : row.text
    return [...text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))]
      .map((found) => ({ key: key as ManualInvoiceField, start: found.index, end: found.index + found[0].length }))
  }).sort((a, b) => a.start - b.start)
}

function wordAt(row: Row, index: number) {
  let offset = 0
  for (const word of row.words) {
    if (offset + word.text.trim().length > index) return word
    offset += word.text.trim().length + 1
  }
  return row.words.at(-1)!
}

export function invoiceOcrDate(value: string, order: InvoiceDateOrder) {
  const date = clean(value).match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
  if (!date) return ''
  const [, first, second, year] = date
  const month = order === 'mdy' ? first : second
  const day = order === 'mdy' ? second : first
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return parseDateValue(iso) ? iso : ''
}

export function parseInvoiceOcr(pages: InvoiceOcrPage[], dateOrder: InvoiceDateOrder = 'mdy') {
  // OCR must never fill unreadable fields with the manual form's default/example values.
  const data = Object.fromEntries(manualInvoiceFields.map(([key]) => [key, ''])) as Record<ManualInvoiceField, string>
  const result: ManualInvoiceData = { ...data, items: [], warehouse_receipts: [] }
  const warnings: string[] = []
  const allRows = pages.map(invoiceOcrRows)
  const text = allRows.map((rows) => rows.map((r) => r.text).join('\n')).join('\n\n').slice(0, 100_000)
  const empty = () => ({ data: { ...data, items: [], warehouse_receipts: [] } as ManualInvoiceData, source_total: '', warnings, text })
  const headerBottom = allRows[0]?.find((row) => billLabel.test(row.text))?.y ?? (pages[0]?.height ?? 0) * 0.2
  const header = (allRows[0] ?? []).filter((row) => row.y < headerBottom).map((row) => row.text).join(' ')
  if (!/\bSAR[I1]\b/i.test(header) || !/\bINVOICE\b/i.test(text)) {
    warnings.push('No se identificó el formato SARI USA. Usa una imagen más clara o completa los campos manualmente.')
    return empty()
  }
  const assign = (key: ManualInvoiceField, value: string) => {
    value = clean(value).replace(/^[:;|!]+\s*/, '')
    const [, label, max] = manualInvoiceFields.find(([name]) => name === key)!
    if (value.length > max) { warnings.push(`${label} excede la longitud permitida; complétalo manualmente.`); return }
    if (key === 'weight_lb') value = value.replace(/\s*(?:Lb|Lbs)\.?$/i, '').trim()
    if (key === 'issue_date' || key === 'due_date') {
      const parsed = invoiceOcrDate(value, dateOrder)
      if (value && !parsed) warnings.push(`No se pudo interpretar ${label}. Revisa el formato de fecha del original.`)
      value = parsed
    }
    result[key] = value
  }
  const invoiceNumbers = new Set<string>()
  let source_total = ''
  pages.forEach((page, pageIndex) => {
    const rows = allRows[pageIndex]
    const heading = rows.find((r) => chargeHeading.test(r.text))
    const regions = rows.filter((row) => !heading || row.y < heading.y).flatMap((row) => matches(row).map((match, index, found) => ({ ...match, row,
      value: row.text.slice(match.end, found[index + 1]?.start).trim(),
      x: wordAt(row, match.start).x,
      right: found[index + 1] ? wordAt(row, found[index + 1].start).x : page.width,
    })))
    for (const region of regions) {
      if (region.key === 'invoice_number' && region.value) invoiceNumbers.add(region.value)
      if (pageIndex !== 0) continue
      let value = region.value
      if (!value && ['booking_number', 'container_size', 'container_number', 'consol_number'].includes(region.key)) {
        const below = rows.find((row) => row.y > region.row.y + region.row.height / 2 && row.y < region.row.y + region.row.height * 3)
        if (below && !matches(below).length && !chargeHeading.test(below.text)) {
          value = clean(below.words.filter((w) => w.x >= region.x - page.width * 0.01 && w.x < region.right - page.width * 0.01).map((w) => w.text).join(' '))
        }
      }
      assign(region.key, value)
    }
    if (pageIndex === 0) {
      const bill = rows.find((row) => billLabel.test(row.text))
      if (bill) {
        const invoice = regions.find((r) => r.key === 'invoice_number')
        const right = invoice?.x ?? page.width * 0.58
        const bottom = regions.find((r) => r.key === 'shipper')?.row.y ?? bill.y + page.height * 0.11
        const entries = rows.filter((r) => r.y >= bill.y && r.y < bottom - bill.height / 2)
          .map((r) => {
            const text = clean(r.words.filter((w) => w.x >= bill.words[0].x - page.width * 0.02 && w.x < right - page.width * 0.015).map((w) => w.text).join(' '))
            const label = billLabel.exec(text)
            return label ? text.slice(label.index + label[0].length).trim() : text
          }).filter(Boolean)
        assign('bill_to_name', entries[0] ?? '')
        assign('bill_to_address', entries[1] ?? '')
        assign('bill_to_city', entries.slice(2).join(' '))
      }
    }
    const total = rows.find((r) => totalLabel.test(r.text))
    if (total) {
      const label = totalLabel.exec(total.text)!
      const value = clean(total.text.slice(label.index + label[0].length)).replace(/^USD\s*|^\$\s*/i, '')
      if (manualInvoiceCents(value) !== null) source_total = value
      else warnings.push('El total del original no es legible; revísalo manualmente.')
    }
    if (!heading) { warnings.push(`No se identificó la tabla de cargos en la página ${pageIndex + 1}.`); return }
    const amountLabel = /\bAmount\b/i.exec(heading.text)
    const amountX = amountLabel ? wordAt(heading, amountLabel.index).x - page.width * 0.035 : page.width * 0.8
    const footerY = total?.y ?? rows.find((r) => /Remarks|Continued\s+on/i.test(r.text))?.y ?? page.height * 0.9
    for (const row of rows.filter((r) => r.y > heading.y + heading.height / 2 && r.y < footerY - r.height / 2)) {
      const wr = [...row.text.matchAll(/\bW\s*R\s*[#№:]*\s*([A-Z0-9][A-Z0-9-]{0,39})/ig)]
      if (wr.length) { result.warehouse_receipts.push(...wr.map((m) => m[1])); continue }
      const description = clean(row.words.filter((w) => w.x < amountX).map((w) => w.text).join(' '))
      const rawAmount = clean(row.words.filter((w) => w.x >= amountX).map((w) => w.text).join(' '))
      if (!description) continue
      if (description.length > 180) { warnings.push('Un cargo excede 180 caracteres; transcríbelo manualmente.'); continue }
      const amount = rawAmount && manualInvoiceCents(rawAmount) !== null ? rawAmount : ''
      if (!amount) warnings.push(`Revisa el importe del cargo: ${description.slice(0, 65)}.`)
      result.items.push({ description, amount })
    }
  })
  if (invoiceNumbers.size > 1) {
    warnings.push('El documento contiene números de factura diferentes. Carga una sola factura; no se combinaron sus cargos.')
    return empty()
  }
  result.warehouse_receipts = [...new Set(result.warehouse_receipts)]
  if (result.items.length > 100 || result.warehouse_receipts.length > 200) {
    warnings.push('El documento excede 100 cargos o 200 WR. Divide el documento y revísalo manualmente.')
    return empty()
  }
  const uncertain = pages.some((p) => p.words.some((w) => w.confidence !== undefined && w.confidence < 50))
  if (uncertain) warnings.push('Hay texto con baja confianza. Compara los nombres, referencias e importes con el original.')
  warnings.push(`Revisa todas las fechas: se interpretaron como ${dateOrder === 'mdy' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'}.`)
  if (!result.invoice_number || !result.bill_to_name || !result.items.length) warnings.push('La lectura está incompleta. Puedes usar el texto reconocido para completar los campos faltantes.')
  return { data: validateManualInvoice(result, false), source_total, warnings: [...new Set(warnings)].slice(0, 20), text }
}
