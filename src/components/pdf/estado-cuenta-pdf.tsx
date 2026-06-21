import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export type EstadoCuentaItem = {
  invoice_number: string | null
  invoice_type: string
  status: string
  issue_date: string | null
  due_date: string | null
  total_original: number
  notas_credito: number
  notas_debito: number
  total_ajustado: number
  currency: string
  pagado: number
  saldo: number
}

export type EstadoCuentaData = {
  empresa: string
  empresa_rtn: string | null
  empresa_dir: string | null
  empresa_tel: string | null
  cliente_nombre: string
  cliente_rtn: string | null
  cliente_email: string | null
  fecha_generacion: string
  items: EstadoCuentaItem[]
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8.5, color: '#1e293b', padding: '32 40 48' },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  empresa: { fontSize: 13, fontWeight: 'bold', color: '#0f172a', marginBottom: 2 },
  empresaSub: { fontSize: 8, color: '#64748b' },
  docTitle: { fontSize: 14, fontWeight: 'bold', color: '#0f172a', textAlign: 'right' },
  docSub: { fontSize: 8, color: '#64748b', textAlign: 'right', marginTop: 2 },

  divider: { borderBottom: '1 solid #e2e8f0', marginVertical: 10 },

  // Client block
  clientBox: { backgroundColor: '#f8fafc', border: '1 solid #e2e8f0', borderRadius: 4, padding: '8 12', marginBottom: 14 },
  clientLabel: { fontSize: 7, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  clientName: { fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginBottom: 2 },
  clientRtn: { fontSize: 8, color: '#64748b' },

  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 3, padding: '5 6', marginBottom: 2 },
  tableHeaderCell: { color: '#ffffff', fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', padding: '5 6', borderBottom: '1 solid #f1f5f9' },
  tableRowAlt: { flexDirection: 'row', padding: '5 6', borderBottom: '1 solid #f1f5f9', backgroundColor: '#fafafa' },

  // Column widths
  colNum: { width: '14%' },
  colStatus: { width: '12%' },
  colEmision: { width: '11%' },
  colVence: { width: '11%' },
  colTotal: { width: '15%', textAlign: 'right' },
  colAjustes: { width: '15%', textAlign: 'right' },
  colPagado: { width: '11%', textAlign: 'right' },
  colSaldo: { width: '11%', textAlign: 'right' },

  textGray: { color: '#64748b' },
  textRed: { color: '#dc2626', fontWeight: 'bold' },
  textGreen: { color: '#16a34a' },
  textBold: { fontWeight: 'bold' },

  // Summary box
  summaryBox: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  summaryInner: { width: '45%' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: '1 solid #f1f5f9' },
  summaryLabel: { color: '#64748b', fontSize: 8 },
  summaryValue: { fontSize: 8, fontWeight: 'bold' },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fef2f2', border: '1 solid #fecaca', borderRadius: 4, padding: '8 10', marginTop: 6 },
  totalLabel: { fontSize: 10, fontWeight: 'bold', color: '#991b1b' },
  totalValue: { fontSize: 10, fontWeight: 'bold', color: '#991b1b' },

  footer: { position: 'absolute', bottom: 16, left: 40, right: 40, fontSize: 7, color: '#94a3b8', textAlign: 'center' },
})

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const parts = d.split('T')[0].split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

const fmtMoney = (n: number, currency = 'USD') =>
  `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function EstadoCuentaPdf({ data }: { data: EstadoCuentaData }) {
  const grouped = new Map<string, EstadoCuentaItem[]>()
  for (const item of data.items) {
    const cur = item.currency || 'USD'
    if (!grouped.has(cur)) grouped.set(cur, [])
    grouped.get(cur)!.push(item)
  }

  const totalesPorMoneda = Array.from(grouped.entries()).map(([currency, items]) => {
    const totalFacturado = items.reduce((s, i) => s + i.total_ajustado, 0)
    const totalPagado = items.reduce((s, i) => s + i.pagado, 0)
    const totalSaldo = items.reduce((s, i) => s + i.saldo, 0)
    return { currency, totalFacturado, totalPagado, totalSaldo, items }
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.empresa}>{data.empresa}</Text>
            {data.empresa_rtn ? <Text style={styles.empresaSub}>RTN: {data.empresa_rtn}</Text> : null}
            {data.empresa_dir ? <Text style={styles.empresaSub}>{data.empresa_dir}</Text> : null}
            {data.empresa_tel ? <Text style={styles.empresaSub}>Tel: {data.empresa_tel}</Text> : null}
          </View>
          <View>
            <Text style={styles.docTitle}>ESTADO DE CUENTA</Text>
            <Text style={styles.docSub}>Fecha: {fmtDate(data.fecha_generacion)}</Text>
            <Text style={styles.docSub}>Facturas pendientes de pago</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Client block */}
        <View style={styles.clientBox}>
          <Text style={styles.clientLabel}>Cliente</Text>
          <Text style={styles.clientName}>{data.cliente_nombre}</Text>
          {data.cliente_rtn ? <Text style={styles.clientRtn}>RTN: {data.cliente_rtn}</Text> : null}
        </View>

        {/* Tables per currency */}
        {totalesPorMoneda.map(({ currency, items, totalFacturado, totalPagado, totalSaldo }) => (
          <View key={currency} style={{ marginBottom: 16 }}>
            {totalesPorMoneda.length > 1 ? (
              <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#475569', marginBottom: 4 }}>{currency}</Text>
            ) : null}

            {/* Table header */}
            <View style={styles.tableHeader} fixed={totalesPorMoneda.length === 1}>
              <Text style={[styles.tableHeaderCell, styles.colNum]}>Factura</Text>
              <Text style={[styles.tableHeaderCell, styles.colStatus]}>Estado</Text>
              <Text style={[styles.tableHeaderCell, styles.colEmision]}>Emisión</Text>
              <Text style={[styles.tableHeaderCell, styles.colVence]}>Vencimiento</Text>
              <Text style={[styles.tableHeaderCell, styles.colTotal]}>Original</Text>
              <Text style={[styles.tableHeaderCell, styles.colAjustes]}>NC / ND</Text>
              <Text style={[styles.tableHeaderCell, styles.colPagado]}>Pagado</Text>
              <Text style={[styles.tableHeaderCell, styles.colSaldo]}>Saldo</Text>
            </View>

            {/* Rows */}
            {items.map((item, idx) => {
              const isAlt = idx % 2 === 1
              return (
                <View key={`${item.invoice_number}-${idx}`} style={isAlt ? styles.tableRowAlt : styles.tableRow} wrap={false}>
                  <Text style={[styles.colNum, styles.textBold]}>{item.invoice_number || '—'}</Text>
                  <Text style={[styles.colStatus, item.status === 'Vencida' ? styles.textRed : styles.textGray]}>{item.status}</Text>
                  <Text style={[styles.colEmision, styles.textGray]}>{fmtDate(item.issue_date)}</Text>
                  <Text style={[styles.colVence, item.status === 'Vencida' ? styles.textRed : styles.textGray]}>{fmtDate(item.due_date)}</Text>
                  <Text style={styles.colTotal}>{fmtMoney(item.total_original, currency)}</Text>
                  <Text style={[styles.colAjustes, styles.textGray]}>
                    {item.notas_credito > 0 || item.notas_debito > 0
                      ? `-${fmtMoney(item.notas_credito, currency)} / +${fmtMoney(item.notas_debito, currency)}`
                      : '—'}
                  </Text>
                  <Text style={[styles.colPagado, styles.textGreen]}>{item.pagado > 0 ? fmtMoney(item.pagado, currency) : '—'}</Text>
                  <Text style={[styles.colSaldo, styles.textRed]}>{fmtMoney(item.saldo, currency)}</Text>
                </View>
              )
            })}

            {/* Summary */}
            <View style={styles.summaryBox} wrap={false}>
              <View style={styles.summaryInner}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total ajustado</Text>
                  <Text style={styles.summaryValue}>{fmtMoney(totalFacturado, currency)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total pagado</Text>
                  <Text style={[styles.summaryValue, styles.textGreen]}>{fmtMoney(totalPagado, currency)}</Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>SALDO PENDIENTE</Text>
                  <Text style={styles.totalValue}>{fmtMoney(totalSaldo, currency)}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}

        {data.items.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#94a3b8', marginTop: 20 }}>
            No hay facturas pendientes para este cliente.
          </Text>
        ) : null}

        <View style={styles.divider} />
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${data.empresa}${data.empresa_rtn ? ` · RTN ${data.empresa_rtn}` : ''} · Página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  )
}
