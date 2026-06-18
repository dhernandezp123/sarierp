import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

export type ArrivalNoticeData = {
  // SI / Booking
  si_number: string | null
  booking_number: string | null
  carrier_booking: string | null
  master_bl: string | null
  house_bl: string | null
  // Vessel
  carrier: string | null
  vessel_name: string | null
  voyage: string | null
  etd: string | null
  eta: string | null
  actual_eta: string | null
  // Port
  port_of_loading: string | null
  port_of_discharge: string | null
  // Free days
  free_days: number | null
  remaining_free_days: number | null
  freight_terms: string | null
  release_type: string | null
  // Consignee
  consignee: string | null
  consignee_address: string | null
  consignee_tax_id: string | null
  consignee_contact: string | null
  consignee_email: string | null
  consignee_phone: string | null
  // Cargo (from BL or booking)
  description_of_goods: string | null
  number_of_packages: number | null
  package_type: string | null
  gross_weight_kg: number | null
  measurement_cbm: number | null
  // Containers (FCL)
  containers?: Array<{
    container_number: string | null
    seal_number: string | null
    container_type: string | null
    quantity: number | null
  }>
  // Sari contact
  issued_by_name: string | null
}

const SARI_LEGAL_NAME = 'SARI EXPRESS S DE R.L. DE C.V.'
const SARI_ADDRESS = 'BO. LOS ANDES 9 CALLE 12-13 AVE N.E, San Pedro Sula, Cortes, Honduras, CP: 21101'
const SARI_RTN = '08019003239182'
const SARI_PHONE = '+504 2553-0000'
const SARI_EMAIL = 'operaciones@sariexpress.com'

const BRAND_RED = '#B91C1C'
const BRAND_NAVY = '#1e3a5f'

Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: `2 solid ${BRAND_RED}`,
    paddingBottom: 10,
    marginBottom: 14,
  },
  logo: { width: 110, objectFit: 'contain' },
  titleBlock: { alignItems: 'flex-end' },
  docTitle: { fontSize: 20, fontWeight: 700, color: BRAND_RED },
  docSubtitle: { marginTop: 3, fontSize: 8.5, color: '#4b5563' },
  issueDate: { marginTop: 5, fontSize: 9, fontWeight: 700, color: BRAND_NAVY },
  // Alert box
  alertBox: {
    backgroundColor: '#fef2f2',
    border: `1 solid ${BRAND_RED}`,
    borderRadius: 4,
    padding: '8 12',
    marginBottom: 12,
  },
  alertTitle: { fontSize: 10, fontWeight: 700, color: BRAND_RED, marginBottom: 3 },
  alertBody: { fontSize: 9, color: '#374151', lineHeight: 1.5 },
  // Section box
  sectionBox: { border: '1 solid #d1d5db', marginBottom: 8 },
  sectionTitle: {
    backgroundColor: BRAND_NAVY,
    color: '#ffffff',
    padding: '3 8',
    fontSize: 8.5,
    fontWeight: 700,
    borderLeft: `3 solid ${BRAND_RED}`,
  },
  // Rows
  twoCol: { flexDirection: 'row' },
  dataRow: { flexDirection: 'row', borderTop: '1 solid #e5e7eb' },
  cellLabel: { width: '35%', padding: '3 7', backgroundColor: '#eef1f7', fontWeight: 700 },
  cellValue: { flex: 1, padding: '3 7', lineHeight: 1.3 },
  halfCellLabel: { width: '20%', padding: '3 7', backgroundColor: '#eef1f7', fontWeight: 700 },
  halfCellValue: { width: '30%', padding: '3 7', lineHeight: 1.3 },
  // Party block
  partyBlock: { padding: '6 8', minHeight: 50 },
  partyName: { fontWeight: 700, fontSize: 10, marginBottom: 3 },
  partyLine: { color: '#374151', lineHeight: 1.5 },
  // Cargo table
  cargoHeader: {
    flexDirection: 'row',
    backgroundColor: BRAND_NAVY,
    color: '#ffffff',
    padding: '3 7',
    fontWeight: 700,
    fontSize: 8.5,
    borderLeft: `3 solid ${BRAND_RED}`,
  },
  cargoRow: { flexDirection: 'row', padding: '4 7', borderTop: '1 solid #e5e7eb' },
  cargoCell: { flex: 1, lineHeight: 1.4 },
  // Free days highlight
  freeDaysBox: {
    backgroundColor: '#f0fdf4',
    border: '1 solid #86efac',
    borderRadius: 4,
    padding: '6 10',
    marginBottom: 8,
    flexDirection: 'row',
    gap: 20,
  },
  freeDaysItem: { flex: 1 },
  freeDaysLabel: { fontSize: 8, color: '#6b7280', marginBottom: 2 },
  freeDaysValue: { fontSize: 13, fontWeight: 700, color: '#15803d' },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    borderTop: `1 solid ${BRAND_RED}`,
    paddingTop: 5,
    fontSize: 7.5,
    color: '#6b7280',
    textAlign: 'center',
  },
})

const v = (x?: string | number | null): string =>
  x === null || x === undefined || x === '' ? '—' : String(x)

const dateV = (x?: string | null): string => {
  if (!x) return '—'
  try {
    const [y, m, d] = x.split('T')[0].split('-').map(Number)
    return new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(y, m - 1, d))
  } catch {
    return x
  }
}

const todayFormatted = () =>
  new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())

function DataRow({ label, value: val }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{val}</Text>
    </View>
  )
}

export default function ArrivalNoticePdf({ data }: { data: ArrivalNoticeData }) {
  const arrivalDate = data.actual_eta || data.eta
  const freeDaysLabel = data.remaining_free_days !== null && data.remaining_free_days !== undefined
    ? String(data.remaining_free_days)
    : data.free_days !== null && data.free_days !== undefined
      ? String(data.free_days)
      : '—'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src="/logo/sari-logo.png" style={styles.logo} />
          <View style={styles.titleBlock}>
            <Text style={styles.docTitle}>AVISO DE LLEGADA</Text>
            <Text style={styles.docSubtitle}>Arrival Notice · {SARI_LEGAL_NAME}</Text>
            <Text style={styles.docSubtitle}>{SARI_ADDRESS}</Text>
            <Text style={styles.issueDate}>Emitido: {todayFormatted()}</Text>
          </View>
        </View>

        {/* Alert message */}
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>Su carga ha llegado al puerto de destino</Text>
          <Text style={styles.alertBody}>
            Le informamos que su embarque ha llegado al puerto de {v(data.port_of_discharge)}.
            Por favor coordine la desconsolidación y retiro de su mercancía a la brevedad posible para evitar cargos adicionales por almacenamiento o sobreestadía.
          </Text>
        </View>

        {/* Free days highlight */}
        <View style={styles.freeDaysBox}>
          <View style={styles.freeDaysItem}>
            <Text style={styles.freeDaysLabel}>DÍAS LIBRES</Text>
            <Text style={styles.freeDaysValue}>{v(data.free_days)}</Text>
          </View>
          <View style={styles.freeDaysItem}>
            <Text style={styles.freeDaysLabel}>DÍAS RESTANTES</Text>
            <Text style={styles.freeDaysValue}>{freeDaysLabel}</Text>
          </View>
          <View style={styles.freeDaysItem}>
            <Text style={styles.freeDaysLabel}>FECHA DE ARRIBO</Text>
            <Text style={[styles.freeDaysValue, { fontSize: 11, color: BRAND_NAVY }]}>{dateV(arrivalDate)}</Text>
          </View>
          <View style={[styles.freeDaysItem, { flex: 2 }]}>
            <Text style={styles.freeDaysLabel}>TIPO DE LIBERACIÓN</Text>
            <Text style={[styles.freeDaysValue, { fontSize: 10, color: BRAND_NAVY }]}>{v(data.release_type)}</Text>
          </View>
        </View>

        {/* References */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>REFERENCIAS DEL EMBARQUE</Text>
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <DataRow label="SI / Routing #" value={v(data.si_number)} />
              <DataRow label="Booking #" value={v(data.booking_number)} />
              <DataRow label="Carrier Booking" value={v(data.carrier_booking)} />
            </View>
            <View style={{ flex: 1, borderLeft: '1 solid #e5e7eb' }}>
              <DataRow label="Master BL" value={v(data.master_bl)} />
              <DataRow label="House BL" value={v(data.house_bl)} />
              <DataRow label="Flete" value={v(data.freight_terms)} />
            </View>
          </View>
        </View>

        {/* Vessel */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>BUQUE / TRANSPORTE</Text>
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <DataRow label="Carrier" value={v(data.carrier)} />
              <DataRow label="Buque / Vuelo" value={v(data.vessel_name)} />
              <DataRow label="Voyage / Vuelo #" value={v(data.voyage)} />
            </View>
            <View style={{ flex: 1, borderLeft: '1 solid #e5e7eb' }}>
              <DataRow label="Puerto de Origen" value={v(data.port_of_loading)} />
              <DataRow label="Puerto de Destino" value={v(data.port_of_discharge)} />
              <DataRow label="ETD" value={dateV(data.etd)} />
            </View>
          </View>
        </View>

        {/* Consignee */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>CONSIGNEE / IMPORTADOR</Text>
          <View style={styles.partyBlock}>
            {data.consignee ? <Text style={styles.partyName}>{data.consignee}</Text> : null}
            {data.consignee_tax_id ? <Text style={styles.partyLine}>RTN: {data.consignee_tax_id}</Text> : null}
            {data.consignee_address ? <Text style={styles.partyLine}>{data.consignee_address}</Text> : null}
            {data.consignee_contact ? <Text style={styles.partyLine}>Contacto: {data.consignee_contact}</Text> : null}
            {data.consignee_email ? <Text style={styles.partyLine}>Email: {data.consignee_email}</Text> : null}
            {data.consignee_phone ? <Text style={styles.partyLine}>Tel: {data.consignee_phone}</Text> : null}
          </View>
        </View>

        {/* Cargo */}
        {data.description_of_goods && (
          <View style={[styles.sectionBox, { marginBottom: 12 }]}>
            <View style={styles.cargoHeader}>
              <Text style={[styles.cargoCell, { flex: 2 }]}>DESCRIPCIÓN DE MERCANCÍA</Text>
              <Text style={styles.cargoCell}>BULTOS</Text>
              <Text style={styles.cargoCell}>PESO (KG)</Text>
              <Text style={styles.cargoCell}>VOLUMEN (CBM)</Text>
            </View>
            <View style={styles.cargoRow}>
              <Text style={[styles.cargoCell, { flex: 2 }]}>{v(data.description_of_goods)}</Text>
              <Text style={styles.cargoCell}>
                {data.number_of_packages ? `${data.number_of_packages} ${v(data.package_type)}` : '—'}
              </Text>
              <Text style={styles.cargoCell}>{v(data.gross_weight_kg)}</Text>
              <Text style={styles.cargoCell}>{v(data.measurement_cbm)}</Text>
            </View>
          </View>
        )}

        {/* Containers (FCL) */}
        {data.containers && data.containers.length > 0 && (
          <View style={[styles.sectionBox, { marginBottom: 12 }]}>
            <View style={styles.cargoHeader}>
              <Text style={[styles.cargoCell, { flex: 2 }]}>CONTENEDOR</Text>
              <Text style={styles.cargoCell}>TIPO</Text>
              <Text style={styles.cargoCell}>QTY</Text>
              <Text style={styles.cargoCell}>PRECINTO</Text>
            </View>
            {data.containers.map((c, i) => (
              <View key={i} style={styles.cargoRow}>
                <Text style={[styles.cargoCell, { flex: 2 }]}>{v(c.container_number)}</Text>
                <Text style={styles.cargoCell}>{v(c.container_type)}</Text>
                <Text style={styles.cargoCell}>{v(c.quantity)}</Text>
                <Text style={styles.cargoCell}>{v(c.seal_number)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Signature */}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 2, border: '1 solid #d1d5db', padding: '8 10', minHeight: 52 }}>
            <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 14 }}>
              Emitido por: {v(data.issued_by_name)} · {SARI_LEGAL_NAME}
            </Text>
            <View style={{ borderTop: '1 solid #111827', paddingTop: 3 }}>
              <Text style={{ fontSize: 8 }}>Firma y sello — Agente de Carga</Text>
            </View>
          </View>
          <View style={{ flex: 1, border: '1 solid #d1d5db', padding: '8 10' }}>
            <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 4 }}>Contacto operaciones:</Text>
            <Text style={{ fontSize: 8.5, fontWeight: 700 }}>{SARI_PHONE}</Text>
            <Text style={{ fontSize: 8.5 }}>{SARI_EMAIL}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {SARI_LEGAL_NAME} · RTN {SARI_RTN} · {SARI_ADDRESS}
        </Text>
      </Page>
    </Document>
  )
}
