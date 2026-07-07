import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import {
  type CompanyBranding,
  getCompanyAddressLines,
  getCompanyDisplayName,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'

export type AWBData = {
  awb_number: string | null
  awb_date: string | null
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
  airport_of_departure: string | null
  airport_of_destination: string | null
  place_of_delivery: string | null
  airline: string | null
  flight_number: string | null
  etd: string | null
  eta: string | null
  description_of_goods: string | null
  marks_and_numbers: string | null
  number_of_packages: number | null
  package_type: string | null
  gross_weight_kg: number | null
  measurement_cbm: number | null
  special_instructions: string | null
  condiciones: string | null
}

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

export default function AWBPdf({
  awb,
  company,
}: {
  awb: AWBData
  company?: Partial<CompanyBranding> | null
}) {
  const companyBranding = normalizeCompanyBranding(company)
  const companyName = getCompanyDisplayName(companyBranding)
  const companyAddress = getCompanyAddressLines(companyBranding).join(' | ')
  const companyLogo = companyBranding.logo_url || '/logo/sari-logo.png'
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={companyLogo} style={styles.logo} />
          <View style={styles.titleBlock}>
            <Text style={styles.docTitle}>AIR WAYBILL</Text>
            <Text style={styles.docSubtitle}>
              {companyName}
              {companyBranding.rtn ? ` · RTN ${companyBranding.rtn}` : ''}
            </Text>
            {companyAddress && (
              <Text style={styles.docSubtitle}>{companyAddress}</Text>
            )}
            {awb.awb_number && (
              <Text style={styles.docNumber}>AWB# {awb.awb_number}</Text>
            )}
          </View>
        </View>

        {/* Parties */}
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <PartySection
              title="SHIPPER / EXPORTER"
              name={awb.shipper}
              address={awb.shipper_address}
            />
          </View>
          <View style={styles.col}>
            <PartySection
              title="CONSIGNEE"
              name={awb.consignee}
              address={awb.consignee_address}
              taxId={awb.consignee_tax_id}
              contact={awb.consignee_contact}
              email={awb.consignee_email}
            />
          </View>
        </View>

        {awb.notify_party && (
          <PartySection
            title="NOTIFY PARTY"
            name={awb.notify_party}
            address={awb.notify_party_address}
          />
        )}

        {/* Route & Flight */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>ROUTE &amp; FLIGHT</Text>
          <View style={styles.twoCols}>
            <View style={[styles.col, { border: 0 }]}>
              <DataRow label="Airport of Departure" value={v(awb.airport_of_departure)} />
              <DataRow label="Airport of Destination" value={v(awb.airport_of_destination)} />
              <DataRow label="Place of Delivery" value={v(awb.place_of_delivery)} />
            </View>
            <View style={styles.col}>
              <DataRow label="Airline / Carrier" value={v(awb.airline)} />
              <DataRow label="Flight No." value={v(awb.flight_number)} />
              <DataRow label="ETD" value={dateV(awb.etd)} />
              <DataRow label="ETA" value={dateV(awb.eta)} />
            </View>
          </View>
        </View>

        {/* Cargo */}
        <View style={styles.cargoTable}>
          <View style={styles.cargoHeader}>
            <Text style={[styles.cargoHeaderCell, { flex: 1.5 }]}>MARKS &amp; NUMBERS</Text>
            <Text style={styles.cargoHeaderCell}>QTY / TYPE</Text>
            <Text style={[styles.cargoHeaderCell, { flex: 3 }]}>DESCRIPTION OF GOODS</Text>
            <Text style={styles.cargoHeaderCell}>GROSS WT (KG)</Text>
            <Text style={styles.cargoHeaderCell}>VOL (CBM)</Text>
          </View>
          <View style={styles.cargoRow}>
            <Text style={[styles.cargoCell, { flex: 1.5 }]}>{v(awb.marks_and_numbers)}</Text>
            <Text style={styles.cargoCell}>
              {awb.number_of_packages ? `${awb.number_of_packages} ${v(awb.package_type)}` : v(awb.package_type)}
            </Text>
            <Text style={[styles.cargoCell, { flex: 3 }]}>{v(awb.description_of_goods)}</Text>
            <Text style={styles.cargoCell}>{v(awb.gross_weight_kg)}</Text>
            <Text style={styles.cargoCell}>{v(awb.measurement_cbm)}</Text>
          </View>
        </View>

        {/* Special Instructions */}
        {awb.special_instructions && (
          <View style={[styles.sectionBox, { padding: '4 7' }]}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: BRAND_NAVY, marginBottom: 2 }}>
              SPECIAL INSTRUCTIONS
            </Text>
            <Text style={{ fontSize: 8, lineHeight: 1.4 }}>{awb.special_instructions}</Text>
          </View>
        )}

        {/* Conditions */}
        {awb.condiciones && (
          <View style={styles.conditionsBox}>
            <Text style={styles.conditionsTitle}>TÉRMINOS Y CONDICIONES / TERMS &amp; CONDITIONS</Text>
            <Text style={styles.conditionsText}>{awb.condiciones}</Text>
          </View>
        )}

        {/* Signature */}
        <View style={styles.sigBlock}>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>
              Lugar y Fecha de Emisión / Place and Date of Issue: San Pedro Sula, Honduras,{' '}
              {dateV(awb.issue_date || awb.awb_date)}
            </Text>
            <Text style={styles.sigLine}>Firma y Sello — As Agent for the Carrier</Text>
            <Text style={[styles.sigLine, { marginTop: 4, fontWeight: 700 }]}>{companyName}</Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>
              Firma del Remitente / Shipper&apos;s Signature
            </Text>
            <Text style={[styles.sigLine, { marginTop: 20 }]}>Firma: ___________________________</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {[
            companyName,
            companyBranding.rtn ? `RTN ${companyBranding.rtn}` : null,
            companyAddress,
          ].filter(Boolean).join(' · ')}
        </Text>
      </Page>
    </Document>
  )
}
