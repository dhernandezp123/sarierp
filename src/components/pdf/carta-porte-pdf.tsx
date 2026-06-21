import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

export type CartaPorteData = {
  numero: string | null
  fecha: string | null
  issue_date: string | null
  shipper: string | null
  shipper_address: string | null
  consignee: string | null
  consignee_address: string | null
  consignee_tax_id: string | null
  consignee_contact: string | null
  consignee_email: string | null
  origin: string | null
  destination: string | null
  place_of_delivery: string | null
  carrier: string | null
  placa_camion: string | null
  nombre_operador: string | null
  description_of_goods: string | null
  marks_and_numbers: string | null
  number_of_packages: number | null
  package_type: string | null
  gross_weight_kg: number | null
  measurement_cbm: number | null
  special_instructions: string | null
  condiciones: string | null
}

const SARI_LEGAL_NAME = 'SARI EXPRESS S DE R.L. DE C.V.'
const SARI_ADDRESS = 'BO. LOS ANDES 9 CALLE 12-13 AVE N.E, San Pedro Sula, Cortes, Honduras, CP: 21101'
const SARI_RTN = '08019003239182'

const BRAND_RED = '#B91C1C'
const BRAND_NAVY = '#1e3a5f'

Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: {
    padding: 22,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: `2 solid ${BRAND_RED}`,
    paddingBottom: 8,
    marginBottom: 10,
  },
  logo: {
    width: 110,
    objectFit: 'contain',
  },
  titleBlock: {
    alignItems: 'flex-end',
  },
  docTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: BRAND_RED,
  },
  docSubtitle: {
    marginTop: 2,
    fontSize: 9,
    color: '#4b5563',
  },
  docNumber: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: 700,
    color: BRAND_NAVY,
  },
  twoCols: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 5,
  },
  col: { flex: 1 },
  sectionBox: {
    border: '1 solid #d1d5db',
    marginBottom: 5,
  },
  sectionTitle: {
    backgroundColor: BRAND_NAVY,
    color: '#ffffff',
    padding: '3 7',
    fontSize: 8,
    fontWeight: 700,
    borderLeft: `3 solid ${BRAND_RED}`,
  },
  partyBlock: {
    padding: '5 7',
    minHeight: 52,
  },
  partyName: {
    fontWeight: 700,
    marginBottom: 2,
  },
  partyLine: {
    color: '#374151',
    lineHeight: 1.4,
  },
  dataRow: {
    flexDirection: 'row',
    borderTop: '1 solid #e5e7eb',
  },
  cellLabel: {
    width: '35%',
    padding: '3 6',
    backgroundColor: '#eef1f7',
    fontWeight: 700,
  },
  cellValue: {
    flex: 1,
    padding: '3 6',
    lineHeight: 1.3,
  },
  cargoTable: {
    border: '1 solid #d1d5db',
    marginBottom: 5,
  },
  cargoHeader: {
    flexDirection: 'row',
    backgroundColor: BRAND_NAVY,
    color: '#ffffff',
    padding: '3 6',
    fontWeight: 700,
    fontSize: 8,
  },
  cargoHeaderCell: {
    flex: 1,
  },
  cargoRow: {
    flexDirection: 'row',
    borderTop: '1 solid #e5e7eb',
    padding: '4 6',
  },
  cargoCell: {
    flex: 1,
    lineHeight: 1.4,
  },
  conditionsBox: {
    border: '1 solid #d1d5db',
    marginBottom: 5,
    padding: '5 7',
  },
  conditionsTitle: {
    fontSize: 7.5,
    fontWeight: 700,
    color: BRAND_NAVY,
    marginBottom: 3,
  },
  conditionsText: {
    fontSize: 7,
    color: '#6b7280',
    lineHeight: 1.4,
  },
  sigBlock: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 5,
  },
  sigBox: {
    flex: 1,
    border: '1 solid #d1d5db',
    padding: 8,
    minHeight: 56,
  },
  sigLabel: {
    fontSize: 7.5,
    color: '#6b7280',
    marginBottom: 16,
  },
  sigLine: {
    borderTop: '1 solid #111827',
    paddingTop: 3,
    fontSize: 7.5,
    color: '#374151',
  },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 22,
    right: 22,
    borderTop: `1 solid ${BRAND_RED}`,
    paddingTop: 4,
    fontSize: 7,
    color: '#6b7280',
    textAlign: 'center',
  },
})

const v = (x?: string | number | null): string => {
  if (x === null || x === undefined || x === '') return '—'
  return String(x)
}

const dateV = (x?: string | null): string => {
  if (!x) return '—'
  try {
    const [y, m, d] = x.split('T')[0].split('-').map(Number)
    return new Intl.DateTimeFormat('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(y, m - 1, d))
  } catch {
    return x
  }
}

function PartySection({ title, name, address, taxId, contact, email }: {
  title: string
  name?: string | null
  address?: string | null
  taxId?: string | null
  contact?: string | null
  email?: string | null
}) {
  return (
    <View style={styles.sectionBox}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.partyBlock}>
        {name ? <Text style={styles.partyName}>{name}</Text> : null}
        {address ? <Text style={styles.partyLine}>{address}</Text> : null}
        {taxId ? <Text style={styles.partyLine}>RTN: {taxId}</Text> : null}
        {contact ? <Text style={styles.partyLine}>Contacto: {contact}</Text> : null}
        {email ? <Text style={styles.partyLine}>Email: {email}</Text> : null}
        {!name && !address && <Text style={{ color: '#9ca3af' }}>—</Text>}
      </View>
    </View>
  )
}

function DataRow({ label, value: val }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{val}</Text>
    </View>
  )
}

export default function CartaPortePdf({ cp }: { cp: CartaPorteData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src="/logo/sari-logo.png" style={styles.logo} />
          <View style={styles.titleBlock}>
            <Text style={styles.docTitle}>CARTA PORTE</Text>
            <Text style={styles.docSubtitle}>{SARI_LEGAL_NAME} · RTN {SARI_RTN}</Text>
            <Text style={styles.docSubtitle}>{SARI_ADDRESS}</Text>
            {cp.numero && (
              <Text style={styles.docNumber}>CP# {cp.numero}</Text>
            )}
          </View>
        </View>

        {/* Parties */}
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <PartySection
              title="REMITENTE / SHIPPER"
              name={cp.shipper}
              address={cp.shipper_address}
            />
          </View>
          <View style={styles.col}>
            <PartySection
              title="DESTINATARIO / CONSIGNEE"
              name={cp.consignee}
              address={cp.consignee_address}
              taxId={cp.consignee_tax_id}
              contact={cp.consignee_contact}
              email={cp.consignee_email}
            />
          </View>
        </View>

        {/* Transport & Route */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>TRANSPORTE Y RUTA</Text>
          <View style={styles.twoCols}>
            <View style={[styles.col, { border: 0 }]}>
              <DataRow label="Origen" value={v(cp.origin)} />
              <DataRow label="Destino" value={v(cp.destination)} />
              <DataRow label="Lugar de Entrega" value={v(cp.place_of_delivery)} />
            </View>
            <View style={styles.col}>
              <DataRow label="Transportista" value={v(cp.carrier)} />
              <DataRow label="Placa del Camión" value={v(cp.placa_camion)} />
              <DataRow label="Nombre del Operador" value={v(cp.nombre_operador)} />
              <DataRow label="Fecha" value={dateV(cp.fecha || cp.issue_date)} />
            </View>
          </View>
        </View>

        {/* Cargo */}
        <View style={styles.cargoTable}>
          <View style={styles.cargoHeader}>
            <Text style={[styles.cargoHeaderCell, { flex: 1.5 }]}>MARCAS Y NÚMEROS</Text>
            <Text style={styles.cargoHeaderCell}>CANT. / TIPO</Text>
            <Text style={[styles.cargoHeaderCell, { flex: 3 }]}>DESCRIPCIÓN DE LA MERCANCÍA</Text>
            <Text style={styles.cargoHeaderCell}>PESO BRUTO (KG)</Text>
            <Text style={styles.cargoHeaderCell}>VOL. (CBM)</Text>
          </View>
          <View style={styles.cargoRow}>
            <Text style={[styles.cargoCell, { flex: 1.5 }]}>{v(cp.marks_and_numbers)}</Text>
            <Text style={styles.cargoCell}>
              {cp.number_of_packages ? `${cp.number_of_packages} ${v(cp.package_type)}` : v(cp.package_type)}
            </Text>
            <Text style={[styles.cargoCell, { flex: 3 }]}>{v(cp.description_of_goods)}</Text>
            <Text style={styles.cargoCell}>{v(cp.gross_weight_kg)}</Text>
            <Text style={styles.cargoCell}>{v(cp.measurement_cbm)}</Text>
          </View>
        </View>

        {/* Special Instructions */}
        {cp.special_instructions && (
          <View style={[styles.sectionBox, { padding: '4 7' }]}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: BRAND_NAVY, marginBottom: 2 }}>
              INSTRUCCIONES ESPECIALES
            </Text>
            <Text style={{ fontSize: 8, lineHeight: 1.4 }}>{cp.special_instructions}</Text>
          </View>
        )}

        {/* Conditions */}
        {cp.condiciones && (
          <View style={styles.conditionsBox}>
            <Text style={styles.conditionsTitle}>TÉRMINOS Y CONDICIONES</Text>
            <Text style={styles.conditionsText}>{cp.condiciones}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.sigBlock}>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>
              Emitido por / Issued by: San Pedro Sula, Honduras,{' '}
              {dateV(cp.issue_date || cp.fecha)}
            </Text>
            <Text style={styles.sigLine}>Firma y Sello — {SARI_LEGAL_NAME}</Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>Firma del Remitente / Shipper&apos;s Signature</Text>
            <Text style={[styles.sigLine, { marginTop: 20 }]}>Firma: ___________________________</Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>Firma del Destinatario / Consignee&apos;s Signature</Text>
            <Text style={[styles.sigLine, { marginTop: 20 }]}>Firma: ___________________________</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {SARI_LEGAL_NAME} · RTN {SARI_RTN} · {SARI_ADDRESS}
        </Text>
      </Page>
    </Document>
  )
}
