import { Document, Font, Image as PdfImage, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatDate, formatMoney } from '@/src/lib/format'
import { amountInWords } from '@/src/lib/amount-in-words'

export type FiscalIssuer = {
  legal_name: string; trade_name?: string | null; rtn?: string | null; address?: string | null
  fiscal_address?: string | null; phone?: string | null; email?: string | null; office_name?: string | null
  logo_url?: string | null
}
type Party = { name: string; identity?: string | null; address?: string | null; email?: string | null; phone?: string | null }
type Line = { description: string; quantity?: number; unit_price: number; discount?: number; tax: string; amount: number }
export type FiscalLayoutData = {
  title: string; number: string; status: string; issue_date?: string | null; due_date?: string | null
  issuer: FiscalIssuer; party: Party; party_label: 'CLIENTE' | 'PROVEEDOR' | 'SUJETO RETENIDO'
  currency: string; lines: Line[]; totals: { label: string; value: number }[]
  total: number; total_currency: string; total_label?: string; notes?: string | null; conditions?: string[]
  equivalence?: string | null; original_amount?: string | null
  reference?: { number?: string | null; cai?: string | null; issue_date?: string | null; reason?: string | null } | null
  fiscal?: { cai?: string | null; from?: string | null; to?: string | null; deadline?: string | null; office?: string | null; location?: string | null } | null
  signature?: boolean; retention?: boolean; invoice_legend?: boolean; footer_note?: string | null
}

export const SARI_FISCAL_RED = '#B3282D'
Font.registerHyphenationCallback(word => [word])
const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 30, paddingBottom: 52, fontFamily: 'Helvetica', fontSize: 8, color: '#24252B' },
  header: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: SARI_FISCAL_RED, paddingBottom: 12, marginBottom: 13 },
  logo: { width: 72, height: 42, objectFit: 'contain', marginRight: 12 },
  company: { flex: 1, paddingRight: 13 }, name: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  small: { fontSize: 7.2, color: '#5F6872', lineHeight: 1.45 },
  titleBlock: { width: 187, alignItems: 'flex-end' }, title: { fontSize: 16, fontWeight: 700, color: SARI_FISCAL_RED, marginBottom: 7, textAlign: 'right' },
  number: { fontSize: 10, fontWeight: 700, marginBottom: 7 }, meta: { fontSize: 7.5, marginBottom: 4 },
  status: { fontSize: 7.5, color: SARI_FISCAL_RED, fontWeight: 700, marginTop: 3 },
  sectionTitle: { fontSize: 7, fontWeight: 700, color: SARI_FISCAL_RED, marginBottom: 6 },
  party: { backgroundColor: '#F6F7F8', padding: 10, borderRadius: 3, marginBottom: 12 },
  partyName: { fontSize: 9, fontWeight: 700, marginBottom: 5 },
  reference: { padding: 10, borderLeftWidth: 2, borderLeftColor: SARI_FISCAL_RED, backgroundColor: '#F6F7F8', marginBottom: 12 },
  tableHeader: { flexDirection: 'row', backgroundColor: SARI_FISCAL_RED, color: '#FFFFFF', paddingVertical: 7, paddingHorizontal: 5, fontWeight: 700, fontSize: 7 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#E2E4E7', paddingVertical: 8, paddingHorizontal: 5, fontSize: 7.5 },
  quantity: { width: '7%' }, description: { width: '36%', paddingRight: 7 }, unit: { width: '17%', textAlign: 'right', paddingRight: 7 },
  discount: { width: '14%', textAlign: 'right', paddingRight: 7 }, tax: { width: '9%', textAlign: 'right', paddingRight: 7 }, amount: { width: '17%', textAlign: 'right' },
  retentionDescription: { width: '45%', paddingRight: 7 }, retentionUnit: { width: '23%', textAlign: 'right', paddingRight: 7 }, retentionTax: { width: '12%', textAlign: 'right', paddingRight: 7 }, retentionAmount: { width: '20%', textAlign: 'right' },
  lower: { flexDirection: 'row', marginTop: 14 }, left: { width: '54%', paddingRight: 17 }, right: { width: '46%' },
  notes: { fontSize: 7.5, lineHeight: 1.5, marginBottom: 4 }, words: { fontSize: 7.5, lineHeight: 1.5, marginTop: 9, fontWeight: 700 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, fontSize: 7.3 },
  sumLabel: { flex: 1, paddingRight: 8 }, sumValue: { fontWeight: 700, textAlign: 'right' },
  equivalence: { backgroundColor: '#F6F7F8', padding: 7, marginTop: 5, fontSize: 7, color: '#5F6872' },
  total: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: SARI_FISCAL_RED, color: '#FFFFFF', padding: 9, fontSize: 10, fontWeight: 700, marginTop: 6 },
  fiscal: { borderTopWidth: 0.6, borderTopColor: '#E2E4E7', marginTop: 15, paddingTop: 9 },
  fiscalColumns: { flexDirection: 'row', justifyContent: 'space-between' }, fiscalColumn: { width: '49%' },
  footerNote: { fontSize: 7, color: '#5F6872', marginTop: 9, lineHeight: 1.4 },
  signature: { marginTop: 28, alignItems: 'center' }, signatureLine: { width: 190, borderTopWidth: 0.6, borderTopColor: '#5F6872', paddingTop: 8, fontSize: 8, textAlign: 'center' },
  fingerprint: { width: 50, height: 55, borderWidth: 0.6, borderColor: '#E2E4E7', marginTop: 10, alignItems: 'center', justifyContent: 'center', fontSize: 6.5, color: '#5F6872' },
  footer: { position: 'absolute', height: 34, bottom: 16, left: 30, right: 30, borderTopWidth: 0.5, borderTopColor: '#E2E4E7', paddingTop: 5, fontSize: 6.3, color: '#5F6872', textAlign: 'center' },
})

export function FiscalDocumentLayout({ data, logo }: { data: FiscalLayoutData; logo?: string | null }) {
  const isSari = /sari\s*express/i.test(`${data.issuer.legal_name} ${data.issuer.trade_name || ''}`)
  const logoSource = logo ?? (isSari ? '/logo/sari-logo.png' : data.issuer.logo_url)
  const printedAt = new Intl.DateTimeFormat('es-HN', { timeZone: 'America/Tegucigalpa', dateStyle: 'short', timeStyle: 'short' }).format(new Date())
  const partyIdentity = data.party_label === 'PROVEEDOR' ? 'RTN / Identidad' : 'RTN'
  return <Document title={`${data.title} ${data.number}`} author={data.issuer.legal_name}>
    <Page size="LETTER" style={styles.page}>
      <View fixed wrap={false} style={styles.header}>
        {logoSource && <PdfImage src={logoSource} style={styles.logo} />}
        <View style={styles.company}>
          <Text style={styles.name}>{data.issuer.legal_name}</Text>
          {data.issuer.rtn && <Text style={styles.small}>RTN: {data.issuer.rtn}</Text>}
          {data.issuer.office_name && <Text style={styles.small}>Establecimiento: {data.issuer.office_name}</Text>}
          {data.issuer.address && <Text style={styles.small}>Dirección: {data.issuer.address}</Text>}
          {data.issuer.fiscal_address && data.issuer.fiscal_address !== data.issuer.address && <Text style={styles.small}>Casa matriz / domicilio fiscal: {data.issuer.fiscal_address}</Text>}
          {data.issuer.phone && <Text style={styles.small}>Tel.: {data.issuer.phone}</Text>}
          {data.issuer.email && <Text style={styles.small}>Correo: {data.issuer.email}</Text>}
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{data.title}</Text><Text style={styles.number}>{data.number}</Text>
          <Text style={styles.meta}>Emisión: {formatDate(data.issue_date)}</Text>
          {data.due_date && <Text style={styles.meta}>Vencimiento: {formatDate(data.due_date)}</Text>}
          {['Borrador', 'Anulada', 'Proforma'].includes(data.status) && <Text style={styles.status}>{data.status.toUpperCase()}</Text>}
        </View>
      </View>
      <View wrap={false} style={styles.party}>
        <Text style={styles.sectionTitle}>DATOS DEL {data.party_label}</Text><Text style={styles.partyName}>{data.party.name}</Text>
        <Text style={styles.small}>{partyIdentity}: {data.party.identity || '—'}</Text>
        {data.party.address && <Text style={styles.small}>Dirección: {data.party.address}</Text>}
        {data.party.phone && <Text style={styles.small}>Tel.: {data.party.phone}</Text>}
        {data.party.email && <Text style={styles.small}>Correo: {data.party.email}</Text>}
      </View>
      {data.reference && <View wrap={false} style={styles.reference}>
        <Text style={styles.sectionTitle}>DOCUMENTO AFECTADO / DE ORIGEN</Text>
        <Text style={styles.notes}>Número: {data.reference.number || 'No registrado'} · Fecha: {formatDate(data.reference.issue_date)}</Text>
        <Text style={styles.small}>CAI de origen: {data.reference.cai || 'No registrado / no aplica'}</Text>
        {data.reference.reason && <Text style={styles.notes}>Motivo: {data.reference.reason}</Text>}
      </View>}
      <Text style={[styles.small, { marginBottom: 5 }]}>Importes en {data.currency}</Text>
      <View wrap={false} style={styles.tableHeader}>
        {!data.retention && <Text style={styles.quantity}>Cant.</Text>}
        <Text style={data.retention ? styles.retentionDescription : styles.description}>Descripción</Text>
        <Text style={data.retention ? styles.retentionUnit : styles.unit}>{data.retention ? 'Base' : 'Precio unitario'}</Text>
        {!data.retention && <Text style={styles.discount}>Descuento</Text>}
        <Text style={data.retention ? styles.retentionTax : styles.tax}>{data.retention ? 'Tasa' : 'ISV'}</Text>
        <Text style={data.retention ? styles.retentionAmount : styles.amount}>Importe</Text>
      </View>
      {data.lines.map((line, index) => <View wrap={false} style={styles.row} key={index}>
        {!data.retention && <Text style={styles.quantity}>{line.quantity}</Text>}
        <Text style={data.retention ? styles.retentionDescription : styles.description}>{line.description}</Text>
        <Text style={data.retention ? styles.retentionUnit : styles.unit}>{formatMoney(line.unit_price, data.currency)}</Text>
        {!data.retention && <Text style={styles.discount}>{formatMoney(line.discount || 0, data.currency)}</Text>}
        <Text style={data.retention ? styles.retentionTax : styles.tax}>{line.tax}</Text>
        <Text style={data.retention ? styles.retentionAmount : styles.amount}>{formatMoney(line.amount, data.currency)}</Text>
      </View>)}
      <View style={styles.lower}>
        <View style={styles.left}>
          <Text style={styles.sectionTitle}>CONDICIONES Y OBSERVACIONES</Text>
          {data.conditions?.map((condition, index) => <Text style={styles.notes} key={index}>{condition}</Text>)}
          {data.notes && <Text style={styles.notes}>{data.notes}</Text>}
          <Text style={styles.words}>Total en letras: {amountInWords(data.total)} {data.total_currency === 'HNL' ? 'LEMPIRAS' : data.total_currency === 'USD' ? 'DÓLARES AMERICANOS' : data.total_currency}</Text>
        </View>
        <View wrap={false} style={styles.right}>
          {data.totals.map((total, index) => <View style={styles.sumRow} key={index}><Text style={styles.sumLabel}>{total.label}</Text><Text style={styles.sumValue}>{formatMoney(total.value, data.currency)}</Text></View>)}
          {(data.equivalence || data.original_amount) && <View style={styles.equivalence}>
            {data.original_amount && <Text style={{lineHeight:1.4}}>{data.original_amount}</Text>}{data.equivalence && <Text style={{lineHeight:1.4}}>{data.equivalence}</Text>}
          </View>}
          <View style={styles.total}><Text>{data.total_label || 'TOTAL'}</Text><Text>{formatMoney(data.total, data.total_currency)}</Text></View>
        </View>
      </View>
      {data.signature && <View wrap={false} style={styles.signature}><Text style={styles.signatureLine}>{data.retention ? 'FIRMA Y SELLO DEL AGENTE DE RETENCIÓN' : 'FIRMA DEL PROVEEDOR'}</Text>{!data.retention && <View style={styles.fingerprint}><Text>HUELLA DIGITAL</Text></View>}</View>}
      {data.fiscal?.cai && <View wrap={false} style={styles.fiscal}>
        <Text style={styles.sectionTitle}>AUTORIZACIÓN FISCAL DEL DOCUMENTO</Text><View style={styles.fiscalColumns}>
          <View style={styles.fiscalColumn}><Text style={styles.small}>CAI: {data.fiscal.cai}</Text><Text style={styles.small}>Fecha límite de emisión: {formatDate(data.fiscal.deadline)}</Text></View>
          <View style={styles.fiscalColumn}><Text style={styles.small}>Rango autorizado: {data.fiscal.from}</Text><Text style={styles.small}>al {data.fiscal.to}</Text>{data.fiscal.office && <Text style={styles.small}>Punto de venta: {data.fiscal.office}</Text>}{data.fiscal.location && <Text style={styles.small}>Lugar de emisión: {data.fiscal.location}</Text>}</View>
        </View>
      </View>}
      {data.footer_note && <Text style={styles.footerNote}>{data.footer_note}</Text>}
      <Text fixed style={styles.footer} render={({ pageNumber, totalPages }) => [
        ...(data.invoice_legend ? ['LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA'] : []),
        data.party_label === 'PROVEEDOR' ? 'Original: Contribuyente Adquirente · Copia: Proveedor' : data.retention ? 'Original: Sujeto retenido · Copia: Obligado Tributario Emisor' : 'Original: Cliente · Copia: Obligado Tributario Emisor',
        `Generado con Forwarders · Impresión: ${printedAt} · Página ${pageNumber} de ${totalPages}`,
      ].join('\n')} />
    </Page>
  </Document>
}
