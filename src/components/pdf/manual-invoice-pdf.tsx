import { Document, Image as PdfImage, Page, Polygon, StyleSheet, Svg, Text, View, pdf } from '@react-pdf/renderer'
import { MANUAL_INVOICE_REMARKS, formatManualInvoiceDate, manualInvoiceCents, manualInvoicePrintPages, manualInvoiceTotal, type ManualInvoiceData } from '@/src/lib/manual-invoice'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8, color: '#111', padding: 32, minHeight: 792 },
  logo: { position: 'absolute', left: 38, top: 26, width: 130, height: 72, objectFit: 'contain' },
  company: { position: 'absolute', left: 185, top: 28, width: 250, textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', lineHeight: 1.18 },
  title: { position: 'absolute', right: 32, top: 92, fontSize: 23, fontFamily: 'Helvetica-Bold' },
  pageNumber: { position: 'absolute', right: 32, top: 81, flexDirection: 'row', alignItems: 'center', gap: 3, fontSize: 8 },
  box: { borderWidth: 0.8, borderColor: '#444', borderRadius: 9, padding: 5 },
  bill: { position: 'absolute', top: 123, left: 32, width: 271, height: 82 },
  invoice: { position: 'absolute', top: 123, right: 32, width: 162, height: 82 },
  leftDetails: { position: 'absolute', top: 208, left: 32, width: 271, height: 78 },
  rightDetails: { position: 'absolute', top: 208, right: 32, width: 274, height: 78 },
  row: { flexDirection: 'row', height: 13.5, alignItems: 'flex-start' },
  label: { fontFamily: 'Helvetica-Bold', width: 72, fontSize: 7.5 },
  value: { flex: 1, fontSize: 7.5, lineHeight: 1.1 },
  containers: { position: 'absolute', top: 289, left: 32, right: 32, height: 32, flexDirection: 'row', padding: 4 },
  container: { width: '25%', fontSize: 7 },
  table: { position: 'absolute', left: 32, right: 32, top: 325, height: 356, borderWidth: 0.8, borderColor: '#444' },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 0.8, borderColor: '#444', height: 17, padding: 2, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  description: { width: '80%', paddingLeft: 4 },
  amount: { width: '20%', textAlign: 'right', paddingRight: 5 },
  charge: { flexDirection: 'row', height: 11, fontSize: 8, paddingTop: 1 },
  total: { position: 'absolute', top: 688, left: 32, right: 32, height: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', fontSize: 11, fontFamily: 'Helvetica-Bold' },
  remarks: { position: 'absolute', top: 720, left: 32, right: 32, height: 43, fontSize: 7.5 },
})

function Detail({ label, value, compact = false, prominent = false, dense = false }: { label: string; value: string; compact?: boolean; prominent?: boolean; dense?: boolean }) {
  const size = prominent ? (value.length <= 12 ? 12 : value.length <= 24 ? 9 : 6) : compact ? 6 : value.length > 35 ? 6 : 7.5
  return <View style={[s.row, prominent ? { height: 22 } : dense ? { height: 12 } : {}]}><Text style={[s.label, compact ? { width: 35, fontSize: 6 } : prominent ? { width: 60 } : {}]}>{label}</Text><Text style={[s.value, { fontSize: size }, prominent ? { fontFamily: 'Helvetica-Bold' } : {}]}>{value}</Text></View>
}

export function ManualInvoicePdf({ data, logo }: { data: ManualInvoiceData; logo: string }) {
  const pages = manualInvoicePrintPages(data)
  return <Document title={`SARI USA Invoice ${data.invoice_number}`} author="SARI EXPRESS FORWARDERS, INC">
    {pages.map((rows, index) => <Page key={index} size="LETTER" style={s.page} wrap={false}>
      <PdfImage src={logo} style={s.logo} />
      <Text style={s.company}>{'SARI EXPRESS FORWARDERS, INC\n11200 NW 107th Street, Suite 13\nMIAMI, FL 33178 - USA\nT (305) 827-5453 / F (305) 827-3234\nwww.sariexp.com'}</Text>
      <View style={s.pageNumber}>
        <Svg width={6} height={6} viewBox="0 0 6 6"><Polygon points="6,0 0,3 6,6" fill="#111" /></Svg>
        <Text>PAGE {index + 1} OF {pages.length}</Text>
        <Svg width={6} height={6} viewBox="0 0 6 6"><Polygon points="0,0 6,3 0,6" fill="#111" /></Svg>
      </View>
      <Text style={s.title}>INVOICE</Text>
      <View style={[s.box, s.bill]}>
        <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>Bill to:</Text>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 3 }}>{data.bill_to_name}</Text>
        <Text style={{ lineHeight: 1.15 }}>{data.bill_to_address}</Text>
        <Text style={{ marginTop: 2 }}>{data.bill_to_city}</Text>
      </View>
      <View style={[s.box, s.invoice]}>
        <Detail label="Invoice #:" value={data.invoice_number} prominent />
        <Detail label="Date:" value={formatManualInvoiceDate(data.issue_date, data.date_format)} dense />
        <Detail label="File #:" value={data.file_number} dense />
        <Detail label="Cust. Ref.:" value={data.customer_reference} dense />
        <Detail label="Due date:" value={formatManualInvoiceDate(data.due_date, data.date_format)} dense />
      </View>
      <View style={[s.box, s.leftDetails]}>
        <Detail label="Shipper:" value={data.shipper} />
        <Detail label="Consignee:" value={data.consignee} />
        <Detail label="Carrier:" value={data.carrier} />
        <Detail label="Desc of goods:" value={data.goods_description} />
      </View>
      <View style={[s.box, s.rightDetails]}>
        <View style={{ flexDirection: 'row' }}><View style={{ width: '65%' }}>
          <Detail label="HAWB/HBL:" value={data.hbl} />
          <Detail label="MAWB/MBL:" value={data.mbl} />
        </View><View style={{ flex: 1 }}>
          <Detail label="Charges:" value={data.charges_term} compact />
          <Detail label="Pieces:" value={data.pieces} compact />
        </View></View>
        <View style={{ flexDirection: 'row' }}><View style={{ width: '65%' }}><Detail label="Origin:" value={data.origin} /></View>
          <View style={{ flex: 1 }}><Detail label="Weight:" value={data.weight_lb ? `${data.weight_lb} Lb` : ''} compact /></View></View>
        <Detail label="Dest:" value={data.destination} />
      </View>
      <View style={[s.box, s.containers]}>
        {[['Booking #:', data.booking_number], ['Cont Size:', data.container_size], ['Container #:', data.container_number], ['Consol #:', data.consol_number]].map(([label, value]) => <View key={label} style={s.container}><Text style={{ fontFamily: 'Helvetica-Bold' }}>{label}</Text><Text>{value}</Text></View>)}
      </View>
      <View style={s.table}>
        <View style={s.tableHeader}><Text style={[s.description, { textAlign: 'center' }]}>Description of Charges</Text><Text style={s.amount}>Amount</Text></View>
        {rows.map((row, rowIndex) => <View key={rowIndex} style={s.charge}>
          <Text style={[s.description, row.wr ? { fontFamily: 'Helvetica-Oblique' } : {}]}>{row.description}</Text>
          <Text style={s.amount}>{row.amount ? ((manualInvoiceCents(row.amount) ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</Text>
        </View>)}
      </View>
      <View style={[s.box, s.total]}><Text>{index === pages.length - 1 ? 'Total Amount:   ' : 'Continued on next page'}</Text>
        {index === pages.length - 1 && <Text style={{ width: 110, textAlign: 'right' }}>USD {manualInvoiceTotal(data).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>}
      </View>
      <View style={[s.box, s.remarks]}><Text style={{ marginBottom: 2 }}>Remarks:</Text><Text>{MANUAL_INVOICE_REMARKS}</Text></View>
    </Page>)}
  </Document>
}

export async function createManualInvoiceBlob(data: ManualInvoiceData) {
  // Resolve a local static asset only; uploaded documents cannot change company identity.
  const logo = `${window.location.origin}/logo/sari-usa-invoice.jpeg`
  return pdf(<ManualInvoicePdf data={data} logo={logo} />).toBlob()
}
