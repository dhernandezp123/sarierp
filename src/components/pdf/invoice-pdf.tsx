import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

// ─── Types ───────────────────────────────────────────────────────────────────

export type InvoicePdfItem = {
  description: string
  quantity: number
  unit_price: number
  amount: number
  isv_rate: 0 | 15 | 18
}

export type InvoicePdfData = {
  // Document
  invoice_number: string
  invoice_type: 'Factura' | 'Proforma' | 'Nota de Crédito' | 'Nota de Débito'
  status: string
  issue_date: string
  due_date: string | null
  currency: string
  exchange_rate: number
  notes: string | null

  // Client
  cliente_nombre: string | null
  cliente_rtn: string | null
  cliente_direccion: string | null
  cliente_email: string | null

  // Items
  items: InvoicePdfItem[]

  // Totals
  subtotal: number
  tax_amount: number
  total: number
  total_lps: number | null
  importe_exento: number
  importe_exonerado: number
  isv_15_amount: number
  isv_18_amount: number
  gravado_15: number
  gravado_18: number

  // Exonerado
  es_exonerado: boolean
  orden_compra_exenta: string | null
  no_constancia_exonerado: string | null
  no_registro_sag: string | null

  // NC / ND
  parent_invoice_number: string | null
  motivo: string | null

  // CAI (solo Factura)
  cai: string | null
  rango_desde: string | null
  rango_hasta: string | null
  fecha_limite_emision: string | null
  lugar_emision: string | null

  // Company settings
  company_legal_name: string
  company_trade_name: string | null
  company_rtn: string | null
  company_address: string | null
  company_phone: string | null
  company_email: string | null
  company_invoice_footer: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAND_RED = '#B91C1C'
const BRAND_NAVY = '#1e3a5f'

Font.registerHyphenationCallback((word) => [word])

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtMoney(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function numToWords(n: number): string {
  if (n === 0) return 'CERO'
  if (n < 0) return 'MENOS ' + numToWords(-n)

  const int = Math.floor(n)
  const dec = Math.round((n - int) * 100)

  function below1000(x: number): string {
    if (x === 0) return ''
    if (x < 20) return UNIDADES[x]
    if (x < 100) {
      const d = Math.floor(x / 10)
      const u = x % 10
      return u === 0 ? DECENAS[d] : (d === 2 ? 'VEINTI' + UNIDADES[u] : DECENAS[d] + ' Y ' + UNIDADES[u])
    }
    if (x === 100) return 'CIEN'
    const c = Math.floor(x / 100)
    const rest = x % 100
    return rest === 0 ? CENTENAS[c] : CENTENAS[c] + ' ' + below1000(rest)
  }

  function convert(x: number): string {
    if (x < 1000) return below1000(x)
    if (x < 1000000) {
      const miles = Math.floor(x / 1000)
      const rest = x % 1000
      const milPart = miles === 1 ? 'MIL' : below1000(miles) + ' MIL'
      return rest === 0 ? milPart : milPart + ' ' + below1000(rest)
    }
    const mill = Math.floor(x / 1000000)
    const rest = x % 1000000
    const millPart = mill === 1 ? 'UN MILLÓN' : below1000(mill) + ' MILLONES'
    return rest === 0 ? millPart : millPart + ' ' + convert(rest)
  }

  const intWords = convert(int)
  const decStr = String(dec).padStart(2, '0')
  return `${intWords} CON ${decStr}/100`
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: 'Helvetica', color: '#111827' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2 solid ${BRAND_RED}`, paddingBottom: 10, marginBottom: 12 },
  companyBlock: { flex: 1 },
  companyName: { fontSize: 12, fontWeight: 700, color: BRAND_NAVY },
  companyTrade: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  companyRtn: { fontSize: 8, color: '#374151', marginTop: 4 },
  companyAddress: { fontSize: 8, color: '#374151', marginTop: 1 },
  titleBlock: { alignItems: 'flex-end', minWidth: 180 },
  docTitle: { fontSize: 18, fontWeight: 700, color: BRAND_RED },
  docNumber: { marginTop: 4, fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY },
  docDate: { marginTop: 3, fontSize: 8.5, color: '#374151' },

  // Parties row
  partiesRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  partyBox: { flex: 1, border: '1 solid #d1d5db', borderRadius: 3 },
  partyTitle: { backgroundColor: BRAND_NAVY, color: '#fff', padding: '3 8', fontSize: 8, fontWeight: 700, borderLeft: `3 solid ${BRAND_RED}` },
  partyBody: { padding: '6 8' },
  partyName: { fontSize: 9, fontWeight: 700, marginBottom: 2 },
  partyLine: { fontSize: 8, color: '#374151', lineHeight: 1.4 },

  // Section
  section: { border: '1 solid #d1d5db', marginBottom: 8 },
  sectionTitle: { backgroundColor: BRAND_NAVY, color: '#fff', padding: '3 8', fontSize: 8, fontWeight: 700, borderLeft: `3 solid ${BRAND_RED}` },

  // Data rows
  dataRow: { flexDirection: 'row', borderTop: '1 solid #e5e7eb' },
  cellLabel: { width: '28%', padding: '3 7', backgroundColor: '#eef1f7', fontWeight: 700, fontSize: 8 },
  cellValue: { flex: 1, padding: '3 7', lineHeight: 1.3, fontSize: 8 },

  // Items table
  tableHeader: { flexDirection: 'row', backgroundColor: BRAND_NAVY, color: '#fff', padding: '4 7', fontWeight: 700, fontSize: 8, borderLeft: `3 solid ${BRAND_RED}` },
  tableRow: { flexDirection: 'row', padding: '4 7', borderTop: '1 solid #e5e7eb', fontSize: 8 },
  colDesc: { flex: 1 },
  colQty: { width: 36, textAlign: 'right' },
  colPrice: { width: 72, textAlign: 'right' },
  colIsv: { width: 40, textAlign: 'center' },
  colAmount: { width: 80, textAlign: 'right' },

  // Totals
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  totalLabel: { width: 160, padding: '2 7', fontSize: 8, color: '#374151', textAlign: 'right' },
  totalValue: { width: 100, padding: '2 7', fontSize: 8, textAlign: 'right' },
  totalDivider: { borderTop: `1 solid ${BRAND_NAVY}`, marginTop: 2, marginBottom: 2 },
  grandTotal: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  grandLabel: { width: 160, padding: '3 7', fontSize: 10, fontWeight: 700, color: BRAND_NAVY, textAlign: 'right' },
  grandValue: { width: 100, padding: '3 7', fontSize: 10, fontWeight: 700, color: BRAND_NAVY, textAlign: 'right' },
  totalLetras: { marginTop: 6, border: `1 solid ${BRAND_NAVY}`, padding: '4 10', borderRadius: 3, fontSize: 8, fontStyle: 'italic', color: BRAND_NAVY },

  // CAI footer
  caiBox: { marginTop: 10, border: `1 solid ${BRAND_RED}`, borderRadius: 3, padding: '6 10', backgroundColor: '#fff7f7' },
  caiTitle: { fontSize: 8, fontWeight: 700, color: BRAND_RED, marginBottom: 4 },
  caiRow: { flexDirection: 'row', gap: 20, marginBottom: 2 },
  caiLabel: { fontSize: 7.5, fontWeight: 700, color: '#374151', width: 100 },
  caiValue: { fontSize: 7.5, color: '#374151', fontFamily: 'Helvetica-Bold' },
  caiNumber: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY, marginTop: 4 },

  // Footer
  footerNote: { marginTop: 8, fontSize: 7.5, color: '#6b7280', borderTop: '1 solid #e5e7eb', paddingTop: 6 },
  copies: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#374151' },
})

// ─── Component ───────────────────────────────────────────────────────────────

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const isFact = data.invoice_type === 'Factura'
  const currency = data.currency

  const gravado15 = data.gravado_15
  const gravado18 = data.gravado_18
  const isv15 = data.isv_15_amount
  const isv18 = data.isv_18_amount

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.companyBlock}>
            <Text style={s.companyName}>{data.company_legal_name}</Text>
            {data.company_trade_name && <Text style={s.companyTrade}>{data.company_trade_name}</Text>}
            {data.company_rtn && <Text style={s.companyRtn}>RTN: {data.company_rtn}</Text>}
            {data.company_address && <Text style={s.companyAddress}>{data.company_address}</Text>}
            {data.company_phone && <Text style={s.companyAddress}>Tel: {data.company_phone}</Text>}
            {data.company_email && <Text style={s.companyAddress}>{data.company_email}</Text>}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.docTitle}>{data.invoice_type.toUpperCase()}</Text>
            <Text style={s.docNumber}>{data.invoice_number}</Text>
            <Text style={s.docDate}>Emisión: {fmtDate(data.issue_date)}</Text>
            {data.due_date && <Text style={s.docDate}>Vence: {fmtDate(data.due_date)}</Text>}
          </View>
        </View>

        {/* ── Referencia factura original (NC/ND) ────────────────────── */}
        {data.parent_invoice_number && (
          <View style={{ marginBottom: 10, padding: '6 10', backgroundColor: '#eff6ff', border: '1 solid #bfdbfe', borderRadius: 3 }}>
            <Text style={{ fontSize: 8.5, color: '#1e40af', fontWeight: 700 }}>
              {data.invoice_type === 'Nota de Crédito' ? 'NOTA DE CRÉDITO emitida contra:' : 'NOTA DE DÉBITO emitida contra:'}
              {'  '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>{data.parent_invoice_number}</Text>
            </Text>
            {data.motivo && (
              <Text style={{ fontSize: 8, color: '#374151', marginTop: 3, fontStyle: 'italic' }}>
                Motivo: {data.motivo}
              </Text>
            )}
          </View>
        )}

        {/* ── Parties ────────────────────────────────────────────────── */}
        <View style={s.partiesRow}>
          {/* Emisor */}
          <View style={s.partyBox}>
            <Text style={s.partyTitle}>EMISOR</Text>
            <View style={s.partyBody}>
              <Text style={s.partyName}>{data.company_legal_name}</Text>
              {data.company_rtn && <Text style={s.partyLine}>RTN: {data.company_rtn}</Text>}
              {data.company_address && <Text style={s.partyLine}>{data.company_address}</Text>}
            </View>
          </View>
          {/* Cliente */}
          <View style={s.partyBox}>
            <Text style={s.partyTitle}>CLIENTE</Text>
            <View style={s.partyBody}>
              <Text style={s.partyName}>{data.cliente_nombre || '—'}</Text>
              {data.cliente_rtn && <Text style={s.partyLine}>RTN: {data.cliente_rtn}</Text>}
              {data.cliente_direccion && <Text style={s.partyLine}>{data.cliente_direccion}</Text>}
              {data.cliente_email && <Text style={s.partyLine}>{data.cliente_email}</Text>}
            </View>
          </View>
        </View>

        {/* ── Exonerado (si aplica) ───────────────────────────────────── */}
        {isFact && data.es_exonerado && (
          <View style={[s.section, { marginBottom: 8 }]}>
            <Text style={s.sectionTitle}>EXONERACIÓN</Text>
            {data.orden_compra_exenta && (
              <View style={s.dataRow}>
                <Text style={s.cellLabel}>N° Orden Compra Exenta</Text>
                <Text style={s.cellValue}>{data.orden_compra_exenta}</Text>
              </View>
            )}
            {data.no_constancia_exonerado && (
              <View style={s.dataRow}>
                <Text style={s.cellLabel}>N° Constancia Exoneración</Text>
                <Text style={s.cellValue}>{data.no_constancia_exonerado}</Text>
              </View>
            )}
            {data.no_registro_sag && (
              <View style={s.dataRow}>
                <Text style={s.cellLabel}>N° Registro SAG</Text>
                <Text style={s.cellValue}>{data.no_registro_sag}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Items table ─────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.tableHeader}>
            <Text style={s.colDesc}>Descripción</Text>
            <Text style={s.colQty}>Qty</Text>
            <Text style={s.colPrice}>P. Unit.</Text>
            {isFact && <Text style={s.colIsv}>ISV</Text>}
            <Text style={s.colAmount}>Importe</Text>
          </View>
          {data.items.map((it, i) => (
            <View key={i} style={s.tableRow}>
              <Text style={s.colDesc}>{it.description}</Text>
              <Text style={s.colQty}>{it.quantity}</Text>
              <Text style={s.colPrice}>{it.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
              {isFact && (
                <Text style={s.colIsv}>
                  {it.isv_rate === 0 ? 'Exento' : `${it.isv_rate}%`}
                </Text>
              )}
              <Text style={s.colAmount}>{it.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals ──────────────────────────────────────────────────── */}
        <View>
          {isFact ? (
            <>
              {data.importe_exento > 0 && (
                <View style={s.totalsRow}>
                  <Text style={s.totalLabel}>Importe exento de ISV</Text>
                  <Text style={s.totalValue}>{fmtMoney(data.importe_exento, currency)}</Text>
                </View>
              )}
              {data.importe_exonerado > 0 && (
                <View style={s.totalsRow}>
                  <Text style={s.totalLabel}>Importe exonerado de ISV</Text>
                  <Text style={s.totalValue}>{fmtMoney(data.importe_exonerado, currency)}</Text>
                </View>
              )}
              {gravado15 > 0 && (
                <View style={s.totalsRow}>
                  <Text style={s.totalLabel}>Importe gravado 15%</Text>
                  <Text style={s.totalValue}>{fmtMoney(gravado15, currency)}</Text>
                </View>
              )}
              {gravado18 > 0 && (
                <View style={s.totalsRow}>
                  <Text style={s.totalLabel}>Importe gravado 18%</Text>
                  <Text style={s.totalValue}>{fmtMoney(gravado18, currency)}</Text>
                </View>
              )}
              {isv15 > 0 && (
                <View style={s.totalsRow}>
                  <Text style={s.totalLabel}>ISV 15%</Text>
                  <Text style={s.totalValue}>{fmtMoney(isv15, currency)}</Text>
                </View>
              )}
              {isv18 > 0 && (
                <View style={s.totalsRow}>
                  <Text style={s.totalLabel}>ISV 18%</Text>
                  <Text style={s.totalValue}>{fmtMoney(isv18, currency)}</Text>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={s.totalsRow}>
                <Text style={s.totalLabel}>Subtotal</Text>
                <Text style={s.totalValue}>{fmtMoney(data.subtotal, currency)}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalLabel}>ISV (15%)</Text>
                <Text style={s.totalValue}>{fmtMoney(data.tax_amount, currency)}</Text>
              </View>
            </>
          )}

          <View style={s.grandTotal}>
            <Text style={s.grandLabel}>TOTAL</Text>
            <Text style={s.grandValue}>{fmtMoney(data.total, currency)}</Text>
          </View>

          {data.currency === 'USD' && data.total_lps != null && (
            <View style={s.totalsRow}>
              <Text style={[s.totalLabel, { color: '#6b7280' }]}>Equivalente HNL (T/C {data.exchange_rate.toFixed(4)})</Text>
              <Text style={[s.totalValue, { color: '#6b7280' }]}>HNL {data.total_lps.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
            </View>
          )}

          {/* Total en letras */}
          <View style={s.totalLetras}>
            <Text>
              Son: {numToWords(data.total)} {currency === 'HNL' ? 'LEMPIRAS' : 'DÓLARES AMERICANOS'}
            </Text>
          </View>
        </View>

        {/* ── Notas ──────────────────────────────────────────────────── */}
        {data.notes && (
          <View style={{ marginTop: 10, padding: '6 8', backgroundColor: '#f9fafb', border: '1 solid #e5e7eb', borderRadius: 3 }}>
            <Text style={{ fontSize: 8, color: '#374151', lineHeight: 1.5 }}>{data.notes}</Text>
          </View>
        )}

        {/* ── CAI footer (solo Factura) ────────────────────────────── */}
        {isFact && data.cai && (
          <View style={s.caiBox}>
            <Text style={s.caiTitle}>DATOS FISCALES — SAR HONDURAS</Text>
            <View style={s.caiRow}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={s.caiLabel}>Rango autorizado:</Text>
                <Text style={s.caiValue}>{data.rango_desde} al {data.rango_hasta}</Text>
              </View>
            </View>
            <View style={s.caiRow}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={s.caiLabel}>Fecha límite emisión:</Text>
                <Text style={s.caiValue}>{fmtDate(data.fecha_limite_emision)}</Text>
              </View>
              {data.lugar_emision && (
                <View style={{ flexDirection: 'row' }}>
                  <Text style={s.caiLabel}>Lugar de emisión:</Text>
                  <Text style={s.caiValue}>{data.lugar_emision}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: '#374151', marginTop: 4 }}>CAI:</Text>
            <Text style={s.caiNumber}>{data.cai}</Text>
          </View>
        )}

        {/* ── Footer note ────────────────────────────────────────────── */}
        {data.company_invoice_footer && (
          <Text style={s.footerNote}>{data.company_invoice_footer}</Text>
        )}

        <View style={s.copies}>
          <Text>Original: Cliente</Text>
          <Text>Copia: Emisor</Text>
        </View>
      </Page>
    </Document>
  )
}
