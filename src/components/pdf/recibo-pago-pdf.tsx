import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export type ReciboPagoData = {
  recibo_numero: string
  empresa: string
  empresa_rtn: string | null
  empresa_dir: string | null
  empresa_tel: string | null
  factura_numero: string | null
  factura_tipo: string
  cliente_nombre: string | null
  cliente_rtn: string | null
  monto: number
  currency: string
  fecha_pago: string
  metodo: string | null
  referencia: string | null
  notas: string | null
  tipo_fiscal: string | null
  punto_venta: string | null
  condicion_pago: string | null
  dias_credito: number | null
  desglose: Array<{
    payment_method: string
    amount: number
    reference: string | null
  }>
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1e293b', padding: 40 },
  titulo: { fontSize: 18, fontWeight: 'bold', marginBottom: 2, color: '#0f172a' },
  empresa: { fontSize: 9, color: '#64748b', marginBottom: 16 },
  divider: { borderBottom: '1 solid #e2e8f0', marginVertical: 10 },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 110, color: '#64748b', fontSize: 8 },
  value: { flex: 1, fontSize: 9 },
  amountBox: { backgroundColor: '#f0fdf4', border: '1 solid #86efac', borderRadius: 4, padding: 12, marginVertical: 14 },
  amountLabel: { fontSize: 8, color: '#16a34a', marginBottom: 3 },
  amountValue: { fontSize: 20, fontWeight: 'bold', color: '#15803d' },
  sigRow: { flexDirection: 'row', gap: 24, marginTop: 40 },
  sigBox: { flex: 1, borderTop: '1 solid #1e293b', paddingTop: 4 },
  sigLabel: { fontSize: 7, color: '#94a3b8' },
  footer: { marginTop: 24, fontSize: 7, color: '#94a3b8', textAlign: 'center' },
})

const fmtDate = (d: string) => {
  const parts = d.split('T')[0].split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

export function ReciboPagoPdf({ data }: { data: ReciboPagoData }) {
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <Text style={styles.titulo}>RECIBO DE PAGO</Text>
        <Text style={styles.empresa}>
          {data.empresa}{data.empresa_rtn ? ` · RTN ${data.empresa_rtn}` : ''}
        </Text>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Recibo:</Text>
          <Text style={styles.value}>{data.recibo_numero}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Factura:</Text>
          <Text style={styles.value}>{data.factura_numero || '—'} ({data.factura_tipo})</Text>
        </View>
        {data.tipo_fiscal ? (
          <View style={styles.row}>
            <Text style={styles.label}>Tipo fiscal:</Text>
            <Text style={styles.value}>{data.tipo_fiscal}</Text>
          </View>
        ) : null}
        {data.punto_venta ? (
          <View style={styles.row}>
            <Text style={styles.label}>Punto de venta:</Text>
            <Text style={styles.value}>{data.punto_venta}</Text>
          </View>
        ) : null}
        {data.condicion_pago ? (
          <View style={styles.row}>
            <Text style={styles.label}>Condición:</Text>
            <Text style={styles.value}>
              {data.condicion_pago}{data.condicion_pago === 'Crédito' ? ` · ${data.dias_credito || 0} días` : ''}
            </Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.label}>Cliente:</Text>
          <Text style={styles.value}>{data.cliente_nombre || '—'}</Text>
        </View>
        {data.cliente_rtn ? (
          <View style={styles.row}>
            <Text style={styles.label}>RTN cliente:</Text>
            <Text style={styles.value}>{data.cliente_rtn}</Text>
          </View>
        ) : null}

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>MONTO RECIBIDO</Text>
          <Text style={styles.amountValue}>
            {data.currency} {data.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Fecha de pago:</Text>
          <Text style={styles.value}>{fmtDate(data.fecha_pago)}</Text>
        </View>
        {data.metodo ? (
          <View style={styles.row}>
            <Text style={styles.label}>Método:</Text>
            <Text style={styles.value}>{data.metodo}</Text>
          </View>
        ) : null}
        {data.referencia ? (
          <View style={styles.row}>
            <Text style={styles.label}>Referencia:</Text>
            <Text style={styles.value}>{data.referencia}</Text>
          </View>
        ) : null}
        {data.desglose.length > 1 ? (
          <View style={styles.row}>
            <Text style={styles.label}>Desglose:</Text>
            <Text style={styles.value}>
              {data.desglose.map((split) => (
                `${split.payment_method}: ${data.currency} ${Number(split.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}${split.reference ? ` (${split.reference})` : ''}`
              )).join('\n')}
            </Text>
          </View>
        ) : null}
        {data.notas ? (
          <View style={styles.row}>
            <Text style={styles.label}>Notas:</Text>
            <Text style={styles.value}>{data.notas}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.sigRow}>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>Firma — {data.empresa}</Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>Recibido conforme</Text>
          </View>
        </View>

        {(data.empresa_dir || data.empresa_tel) ? (
          <Text style={styles.footer}>
            {[data.empresa_dir, data.empresa_tel].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </Page>
    </Document>
  )
}
