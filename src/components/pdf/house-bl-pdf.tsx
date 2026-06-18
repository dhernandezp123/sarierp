import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

export type HBLData = {
  bl_number: string | null
  bl_date: string | null
  release_type: string | null
  originals_count: number | null
  copies_count: number | null
  freight_terms: string | null
  hbl_freight_visibility: string | null
  issue_date: string | null
  shipper: string | null
  shipper_address: string | null
  consignee: string | null
  consignee_address: string | null
  consignee_tax_id: string | null
  consignee_contact: string | null
  consignee_email: string | null
  notify_party: string | null
  notify_party_address: string | null
  notify_party_tax_id: string | null
  notify_party_contact: string | null
  notify_party_email: string | null
  place_of_receipt: string | null
  port_of_loading: string | null
  port_of_discharge: string | null
  place_of_delivery: string | null
  carrier: string | null
  vessel_name: string | null
  voyage: string | null
  etd: string | null
  eta: string | null
  description_of_goods: string | null
  marks_and_numbers: string | null
  number_of_packages: number | null
  package_type: string | null
  gross_weight_kg: number | null
  measurement_cbm: number | null
  special_instructions: string | null
  printed_at_destination: boolean | null
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
  blNumber: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: 700,
    color: BRAND_NAVY,
  },
  // Two-column layout
  twoCols: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 5,
  },
  col: { flex: 1 },
  // Section box
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
  // Data rows
  dataRow: {
    flexDirection: 'row',
    borderTop: '1 solid #e5e7eb',
  },
  cellLabel: {
    width: '30%',
    padding: '3 6',
    backgroundColor: '#eef1f7',
    fontWeight: 700,
  },
  cellValue: {
    flex: 1,
    padding: '3 6',
    lineHeight: 1.3,
  },
  // Cargo table
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
  // Signature block
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
    minHeight: 48,
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
  // Footer
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

export default function HouseBLPdf({ bl }: { bl: HBLData }) {
  const issuePlace = bl.printed_at_destination ? v(bl.port_of_discharge) : 'San Pedro Sula, Honduras'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src="/logo/sari-logo.png" style={styles.logo} />
          <View style={styles.titleBlock}>
            <Text style={styles.docTitle}>HOUSE BILL OF LADING</Text>
            <Text style={styles.docSubtitle}>{SARI_LEGAL_NAME} · RTN {SARI_RTN}</Text>
            <Text style={styles.docSubtitle}>{SARI_ADDRESS}</Text>
            {bl.bl_number && (
              <Text style={styles.blNumber}>HBL# {bl.bl_number}</Text>
            )}
          </View>
        </View>

        {/* Parties row */}
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <PartySection
              title="SHIPPER / EXPORTER"
              name={bl.shipper}
              address={bl.shipper_address}
            />
          </View>
          <View style={styles.col}>
            <PartySection
              title="CONSIGNEE"
              name={bl.consignee}
              address={bl.consignee_address}
              taxId={bl.consignee_tax_id}
              contact={bl.consignee_contact}
              email={bl.consignee_email}
            />
          </View>
        </View>

        <PartySection
          title="NOTIFY PARTY"
          name={bl.notify_party}
          address={bl.notify_party_address}
          taxId={bl.notify_party_tax_id}
          contact={bl.notify_party_contact}
          email={bl.notify_party_email}
        />

        {/* Route and vessel */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>ROUTE &amp; VESSEL</Text>
          <View style={styles.twoCols}>
            <View style={[styles.col, { border: 0 }]}>
              <DataRow label="Place of Receipt" value={v(bl.place_of_receipt)} />
              <DataRow label="Port of Loading" value={v(bl.port_of_loading)} />
              <DataRow label="Port of Discharge" value={v(bl.port_of_discharge)} />
              <DataRow label="Place of Delivery" value={v(bl.place_of_delivery)} />
            </View>
            <View style={styles.col}>
              <DataRow label="Carrier" value={v(bl.carrier)} />
              <DataRow label="Vessel / Flight" value={v(bl.vessel_name)} />
              <DataRow label="Voyage / Flt No." value={v(bl.voyage)} />
              <DataRow label="ETD" value={dateV(bl.etd)} />
              <DataRow label="ETA" value={dateV(bl.eta)} />
            </View>
          </View>
        </View>

        {/* Cargo table */}
        <View style={styles.cargoTable}>
          <View style={styles.cargoHeader}>
            <Text style={[styles.cargoHeaderCell, { flex: 1.5 }]}>MARKS &amp; NUMBERS</Text>
            <Text style={styles.cargoHeaderCell}>QTY / TYPE</Text>
            <Text style={[styles.cargoHeaderCell, { flex: 3 }]}>DESCRIPTION OF GOODS</Text>
            <Text style={styles.cargoHeaderCell}>GROSS WT (KG)</Text>
            <Text style={styles.cargoHeaderCell}>MEAS. (CBM)</Text>
          </View>
          <View style={styles.cargoRow}>
            <Text style={[styles.cargoCell, { flex: 1.5 }]}>{v(bl.marks_and_numbers)}</Text>
            <Text style={styles.cargoCell}>
              {bl.number_of_packages ? `${bl.number_of_packages} ${v(bl.package_type)}` : v(bl.package_type)}
            </Text>
            <Text style={[styles.cargoCell, { flex: 3 }]}>{v(bl.description_of_goods)}</Text>
            <Text style={styles.cargoCell}>{v(bl.gross_weight_kg)}</Text>
            <Text style={styles.cargoCell}>{v(bl.measurement_cbm)}</Text>
          </View>
        </View>

        {/* Terms */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>TERMS &amp; CONDITIONS</Text>
          <View style={[styles.twoCols, { padding: '4 0' }]}>
            <DataRow label="Freight Terms" value={v(bl.freight_terms)} />
            <DataRow label="Freight Visibility" value={v(bl.hbl_freight_visibility)} />
          </View>
          <DataRow label="Release Type" value={v(bl.release_type)} />
          <DataRow
            label="Originals / Copies"
            value={`${bl.originals_count ?? 3} Original(s) / ${bl.copies_count ?? 3} Copy(ies)`}
          />
          {bl.special_instructions ? (
            <DataRow label="Special Instructions" value={bl.special_instructions} />
          ) : null}
        </View>

        {/* Signature */}
        <View style={styles.sigBlock}>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>
              Place and Date of Issue: {issuePlace}, {dateV(bl.issue_date || bl.bl_date)}
            </Text>
            <Text style={styles.sigLine}>Signature &amp; Stamp — As Agent for the Carrier</Text>
            <Text style={[styles.sigLine, { marginTop: 4, fontWeight: 700 }]}>{SARI_LEGAL_NAME}</Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>
              Original BL: {bl.originals_count ?? 3} — One of which being accomplished, the others to stand void.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {SARI_LEGAL_NAME} · RTN {SARI_RTN} · {SARI_ADDRESS}
        </Text>
      </Page>
    </Document>
  )
}
