import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import {
  type CompanyBranding,
  getCompanyAddressLines,
  getCompanyDisplayName,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'
import { DemoPdfWatermark } from './DemoPdfWatermark'

export type HBLContainerData = {
  container_number: string | null
  seal_number: string | null
  container_type: string | null
  quantity: number | null
  gross_weight_kg: number | null
  measurement_cbm: number | null
  notes: string | null
}

export type HBLData = {
  status: string | null
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
  condiciones: string | null
  containers: HBLContainerData[]
}

const FORM_RED = '#ef3340'
const TEXT = '#151515'

Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: {
    paddingTop: 15,
    paddingHorizontal: 17,
    paddingBottom: 15,
    fontSize: 7.3,
    fontFamily: 'Helvetica',
    color: TEXT,
    backgroundColor: '#ffffff',
  },
  header: {
    height: 29,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottom: `0.8 solid ${FORM_RED}`,
  },
  headerBrand: {
    width: '66%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  companyName: {
    color: FORM_RED,
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
  },
  companyTax: {
    color: FORM_RED,
    fontSize: 7.5,
    marginLeft: 6,
    marginTop: 5,
  },
  title: {
    width: '34%',
    color: FORM_RED,
    fontSize: 18,
    textAlign: 'right',
  },
  row: { flexDirection: 'row' },
  field: {
    borderRight: `0.65 solid ${FORM_RED}`,
    borderBottom: `0.65 solid ${FORM_RED}`,
    paddingHorizontal: 4,
    paddingTop: 3,
    position: 'relative',
  },
  fieldLast: { borderRightWidth: 0 },
  label: {
    color: FORM_RED,
    fontSize: 5.8,
    lineHeight: 1.05,
    textTransform: 'uppercase',
  },
  hint: {
    fontFamily: 'Helvetica-Oblique',
    textTransform: 'none',
  },
  value: {
    marginTop: 5,
    paddingLeft: 9,
    fontSize: 8.4,
    lineHeight: 1.22,
    textTransform: 'uppercase',
  },
  valueCompact: {
    marginTop: 4,
    fontSize: 7.5,
    lineHeight: 1.18,
  },
  valueStrong: {
    fontFamily: 'Helvetica-Bold',
  },
  topLeft: { width: '51%' },
  topRight: { width: '49%' },
  shipper: { height: 74 },
  consignee: { height: 72 },
  notify: { height: 72 },
  docNumber: { width: '53%', height: 34 },
  blNumber: { width: '47%', height: 34 },
  exportReferences: { height: 40 },
  forwardingAgent: { height: 61 },
  origin: { height: 31 },
  routing: { height: 52 },
  routeField: { height: 28 },
  routeHalf: { width: '50%' },
  routeThird: { width: '33.333%' },
  routeWide: { width: '60%' },
  routeNarrow: { width: '40%' },
  cargoHeader: {
    flexDirection: 'row',
    height: 25,
    borderBottom: `0.65 solid ${FORM_RED}`,
  },
  cargoHeaderCell: {
    borderRight: `0.65 solid ${FORM_RED}`,
    color: FORM_RED,
    fontSize: 5.7,
    textAlign: 'center',
    paddingHorizontal: 2,
    paddingTop: 4,
  },
  marksCol: { width: '18.5%' },
  packagesCol: { width: '10.5%' },
  descriptionCol: { width: '43%' },
  weightCol: { width: '14%' },
  measurementCol: { width: '14%' },
  cargoBody: {
    flexDirection: 'row',
    height: 209,
    borderBottom: `0.65 solid ${FORM_RED}`,
    position: 'relative',
  },
  cargoBodyCell: {
    borderRight: `0.65 solid ${FORM_RED}`,
    paddingHorizontal: 6,
    paddingTop: 14,
    fontSize: 8.3,
    lineHeight: 1.25,
  },
  cargoCentered: { textAlign: 'center' },
  containerEntry: { marginBottom: 8 },
  totals: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    flexDirection: 'row',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.6,
  },
  watermark: {
    position: 'absolute',
    top: 112,
    left: 18,
    width: 420,
    color: '#e8ebef',
    fontFamily: 'Helvetica-Bold',
    fontSize: 31,
    opacity: 0.72,
    textAlign: 'center',
  },
  instructions: {
    minHeight: 19,
    borderBottom: `0.65 solid ${FORM_RED}`,
    color: FORM_RED,
    fontSize: 5.5,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  lower: {
    flexDirection: 'row',
    height: 176,
  },
  charges: {
    width: '51%',
    borderRight: `0.65 solid ${FORM_RED}`,
  },
  legal: { width: '49%' },
  lowerTitle: {
    height: 20,
    color: FORM_RED,
    fontSize: 8.5,
    textAlign: 'center',
    paddingTop: 6,
    borderBottom: `0.65 solid ${FORM_RED}`,
  },
  chargeColumns: {
    flexDirection: 'row',
    height: 22,
    borderBottom: `0.65 solid ${FORM_RED}`,
    color: FORM_RED,
    fontSize: 5.8,
    textAlign: 'center',
  },
  chargeDescription: { width: '64%', borderRight: `0.65 solid ${FORM_RED}`, paddingTop: 5 },
  chargeAmount: { width: '18%', borderRight: `0.65 solid ${FORM_RED}`, paddingTop: 5 },
  chargeAmountLast: { width: '18%', paddingTop: 5 },
  chargeBody: {
    flexDirection: 'row',
    height: 113,
    borderBottom: `0.65 solid ${FORM_RED}`,
  },
  chargeBodyDescription: {
    width: '64%',
    borderRight: `0.65 solid ${FORM_RED}`,
    paddingHorizontal: 11,
    paddingTop: 25,
    fontSize: 8.4,
  },
  chargeBodyAmount: { width: '18%', borderRight: `0.65 solid ${FORM_RED}` },
  chargeBodyAmountLast: { width: '18%' },
  grandTotal: {
    height: 21,
    flexDirection: 'row',
    alignItems: 'center',
    color: FORM_RED,
    fontSize: 6,
  },
  legalText: {
    height: 78,
    borderBottom: `0.65 solid ${FORM_RED}`,
    padding: 7,
    color: FORM_RED,
    fontSize: 5.5,
    lineHeight: 1.18,
  },
  signature: {
    height: 98,
    paddingHorizontal: 9,
    paddingTop: 7,
    color: FORM_RED,
    fontSize: 6,
  },
  signatureValue: {
    color: TEXT,
    fontSize: 8.2,
    textAlign: 'center',
    marginTop: 5,
    textTransform: 'uppercase',
  },
  signatureLine: {
    borderBottom: `0.65 solid ${FORM_RED}`,
    minHeight: 14,
    marginTop: 2,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    borderBottom: `0.65 solid ${FORM_RED}`,
    paddingHorizontal: 18,
    paddingBottom: 3,
  },
  footerNumber: {
    marginTop: 8,
    paddingLeft: 10,
    fontFamily: 'Helvetica-Bold',
    color: TEXT,
    fontSize: 8,
  },
})

const value = (input?: string | number | null) =>
  input === null || input === undefined || input === '' ? '' : String(input)

const numberValue = (input?: number | null, decimals = 1) =>
  input === null || input === undefined
    ? ''
    : Number(input).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })

const dateParts = (input?: string | null) => {
  if (!input) return { month: '', day: '', year: '' }
  const [year = '', month = '', day = ''] = input.split('T')[0].split('-')
  return { month, day, year }
}

function Field({
  number,
  label,
  hint,
  children,
  style,
  last = false,
}: {
  number: string
  label: string
  hint?: string
  children?: React.ReactNode
  style?: Style | Style[]
  last?: boolean
}) {
  const fieldStyles: Style[] = [
    styles.field,
    ...(Array.isArray(style) ? style : style ? [style] : []),
    ...(last ? [styles.fieldLast] : []),
  ]

  return (
    <View style={fieldStyles}>
      <Text style={styles.label}>
        {number}. {label}{hint ? <Text style={styles.hint}> {hint}</Text> : null}
      </Text>
      {children}
    </View>
  )
}

function PartyValue({
  name,
  address,
  taxId,
  contact,
  email,
}: {
  name?: string | null
  address?: string | null
  taxId?: string | null
  contact?: string | null
  email?: string | null
}) {
  return (
    <View style={styles.value}>
      {name ? <Text style={styles.valueStrong}>{name}</Text> : null}
      {address ? <Text>{address}</Text> : null}
      {taxId ? <Text>RTN/TAX ID: {taxId}</Text> : null}
      {contact ? <Text>CONTACT: {contact}</Text> : null}
      {email ? <Text>EMAIL: {email}</Text> : null}
    </View>
  )
}

export default function HouseBLPdf({
  bl,
  company,
}: {
  bl: HBLData
  company?: Partial<CompanyBranding> | null
}) {
  const branding = normalizeCompanyBranding(company)
  const companyName = getCompanyDisplayName(branding)
  const companyAddress = getCompanyAddressLines(branding).join('\n')
  const issuePlace = bl.printed_at_destination
    ? value(bl.port_of_discharge)
    : [branding.city, branding.country].filter(Boolean).join(', ')
  const issueDate = dateParts(bl.issue_date || bl.bl_date)
  const isDraft = !['Emitido', 'Liberado'].includes(bl.status || '')
  const packageSummary = [value(bl.number_of_packages), value(bl.package_type)]
    .filter(Boolean)
    .join(' ')
  const containerLines = bl.containers.length > 0
    ? bl.containers
    : [{
        container_number: null,
        seal_number: null,
        container_type: null,
        quantity: null,
        gross_weight_kg: null,
        measurement_cbm: null,
        notes: null,
      }]

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <DemoPdfWatermark />
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <Text style={styles.companyName}>{companyName}</Text>
            {branding.rtn ? <Text style={styles.companyTax}>RTN {branding.rtn}</Text> : null}
          </View>
          <Text style={styles.title}>BILL OF LADING</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.topLeft}>
            <Field number="2" label="Exporter" hint="(Principal or seller - name and address including ZIP Code)" style={styles.shipper}>
              <PartyValue name={bl.shipper} address={bl.shipper_address} />
            </Field>
            <Field number="3" label="Consigned to" style={styles.consignee}>
              <PartyValue
                name={bl.consignee}
                address={bl.consignee_address}
                taxId={bl.consignee_tax_id}
                contact={bl.consignee_contact}
                email={bl.consignee_email}
              />
            </Field>
            <Field number="4" label="Notify party / intermediate consignee" hint="(Name and address)" style={styles.notify}>
              <PartyValue
                name={bl.notify_party}
                address={bl.notify_party_address}
                taxId={bl.notify_party_tax_id}
                contact={bl.notify_party_contact}
                email={bl.notify_party_email}
              />
            </Field>
          </View>

          <View style={styles.topRight}>
            <View style={styles.row}>
              <Field number="5" label="Document number" style={styles.docNumber} />
              <Field number="5a" label="B/L number" style={styles.blNumber} last>
                <Text style={[styles.value, styles.valueStrong]}>{value(bl.bl_number)}</Text>
              </Field>
            </View>
            <Field number="6" label="Export references" style={styles.exportReferences} last />
            <Field number="7" label="Forwarding agent" hint="(Name and address - references)" style={styles.forwardingAgent} last>
              <PartyValue name={companyName} address={companyAddress} taxId={branding.rtn} />
            </Field>
            <Field number="8" label="Point (state) of origin or FTZ number" style={styles.origin} last>
              <Text style={styles.valueCompact}>{value(bl.place_of_receipt)}</Text>
            </Field>
            <Field number="9" label="Domestic routing / export instructions" style={styles.routing} last>
              <Text style={styles.valueCompact}>{value(bl.special_instructions)}</Text>
            </Field>
          </View>
        </View>

        <View style={styles.row}>
          <Field number="12" label="Pre-carriage by" style={[styles.routeField, styles.routeThird]}>
            <Text style={styles.valueCompact}>{value(bl.carrier)}</Text>
          </Field>
          <Field number="13" label="Place of receipt by pre-carrier" style={[styles.routeField, styles.routeThird]}>
            <Text style={styles.valueCompact}>{value(bl.place_of_receipt)}</Text>
          </Field>
          <Field number="10" label="Loading pier / terminal" style={[styles.routeField, styles.routeThird]} last>
            <Text style={styles.valueCompact}>{value(bl.port_of_loading)}</Text>
          </Field>
        </View>
        <View style={styles.row}>
          <Field number="14" label="Exporting carrier" style={[styles.routeField, styles.routeThird]}>
            <Text style={styles.valueCompact}>{[bl.vessel_name, bl.voyage].filter(Boolean).join(' / ')}</Text>
          </Field>
          <Field number="15" label="Port of loading / export" style={[styles.routeField, styles.routeThird]}>
            <Text style={styles.valueCompact}>{value(bl.port_of_loading)}</Text>
          </Field>
          <Field number="11" label="Type of move" style={[styles.routeField, styles.routeThird]} last>
            <Text style={styles.valueCompact}>{value(bl.release_type)}</Text>
          </Field>
        </View>
        <View style={styles.row}>
          <Field number="16" label="Foreign port of unloading" hint="(Vessel and air only)" style={[styles.routeField, styles.routeHalf]}>
            <Text style={styles.valueCompact}>{value(bl.port_of_discharge)}</Text>
          </Field>
          <Field number="17" label="Place of delivery by on-carrier" style={[styles.routeField, styles.routeHalf]} last>
            <Text style={styles.valueCompact}>{value(bl.place_of_delivery)}</Text>
          </Field>
        </View>

        <View style={styles.cargoHeader}>
          <Text style={[styles.cargoHeaderCell, styles.marksCol]}>MARKS AND NUMBERS{`\n`}(18)</Text>
          <Text style={[styles.cargoHeaderCell, styles.packagesCol]}>NUMBER OF PACKAGES{`\n`}(19)</Text>
          <Text style={[styles.cargoHeaderCell, styles.descriptionCol]}>DESCRIPTION OF COMMODITIES{`\n`}(20)</Text>
          <Text style={[styles.cargoHeaderCell, styles.weightCol]}>GROSS WEIGHT{`\n`}(Kilos) (21)</Text>
          <Text style={[styles.cargoHeaderCell, styles.measurementCol, styles.fieldLast]}>MEASUREMENT{`\n`}(22)</Text>
        </View>

        <View style={styles.cargoBody}>
          {isDraft ? <Text style={styles.watermark}>DRAFT  DRAFT  DRAFT</Text> : null}
          <View style={[styles.cargoBodyCell, styles.marksCol]}>
            {containerLines.map((container, index) => (
              <View key={`${container.container_number || 'container'}-${index}`} style={styles.containerEntry}>
                {container.container_number ? <Text style={styles.valueStrong}>{container.container_number}</Text> : null}
                {container.seal_number ? <Text>SEAL / {container.seal_number}</Text> : null}
                {container.notes ? <Text>{container.notes}</Text> : null}
              </View>
            ))}
            {bl.marks_and_numbers ? <Text>{bl.marks_and_numbers}</Text> : null}
          </View>
          <View style={[styles.cargoBodyCell, styles.packagesCol, styles.cargoCentered]}>
            <Text>{value(bl.number_of_packages)}</Text>
          </View>
          <View style={[styles.cargoBodyCell, styles.descriptionCol]}>
            {containerLines.map((container, index) => (
              container.container_type ? (
                <Text key={`${container.container_type}-${index}`} style={styles.valueStrong}>
                  {container.quantity && container.quantity > 1 ? `${container.quantity} X ` : ''}{container.container_type} S.T.C
                </Text>
              ) : null
            ))}
            {packageSummary ? <Text style={[styles.valueStrong, { marginTop: 3 }]}>{packageSummary}</Text> : null}
            <Text style={{ marginTop: 3 }}>{value(bl.description_of_goods)}</Text>
          </View>
          <View style={[styles.cargoBodyCell, styles.weightCol, styles.cargoCentered]}>
            <Text>{numberValue(bl.gross_weight_kg)}{bl.gross_weight_kg != null ? ' Kgs' : ''}</Text>
          </View>
          <View style={[styles.cargoBodyCell, styles.measurementCol, styles.cargoCentered, styles.fieldLast]}>
            <Text>{numberValue(bl.measurement_cbm)}{bl.measurement_cbm != null ? ' Cbm' : ''}</Text>
          </View>
          <View style={styles.totals}>
            <Text style={[styles.marksCol, { paddingLeft: 15 }]}>TOTALS</Text>
            <Text style={[styles.packagesCol, styles.cargoCentered]}>{value(bl.number_of_packages)}</Text>
            <Text style={styles.descriptionCol} />
            <Text style={[styles.weightCol, styles.cargoCentered]}>{numberValue(bl.gross_weight_kg)}{bl.gross_weight_kg != null ? ' Kgs' : ''}</Text>
            <Text style={[styles.measurementCol, styles.cargoCentered]}>{numberValue(bl.measurement_cbm)}{bl.measurement_cbm != null ? ' Cbm' : ''}</Text>
          </View>
        </View>

        <Text style={styles.instructions}>
          {bl.special_instructions || 'CARRIER LIABILITY AND CARGO CONDITIONS ARE SUBJECT TO THE TERMS SHOWN ON THIS BILL OF LADING.'}
        </Text>

        <View style={styles.lower}>
          <View style={styles.charges}>
            <Text style={styles.lowerTitle}>FREIGHT RATES, CHARGES, WEIGHTS AND/OR MEASUREMENTS</Text>
            <View style={styles.chargeColumns}>
              <Text style={styles.chargeDescription}>SUBJECT TO CORRECTION</Text>
              <Text style={styles.chargeAmount}>PREPAID</Text>
              <Text style={styles.chargeAmountLast}>COLLECT</Text>
            </View>
            <View style={styles.chargeBody}>
              <Text style={styles.chargeBodyDescription}>
                {bl.hbl_freight_visibility === 'Freight Amount' ? 'FREIGHT CHARGES AS AGREED' : 'FREIGHT AS PER AGREEMENT'}
              </Text>
              <View style={styles.chargeBodyAmount} />
              <View style={styles.chargeBodyAmountLast} />
            </View>
            <View style={styles.grandTotal}>
              <Text style={{ width: '64%', textAlign: 'right', paddingRight: 28 }}>GRAND TOTAL:</Text>
              <Text style={{ width: '36%', color: TEXT, textAlign: 'center' }}>{value(bl.freight_terms)}</Text>
            </View>
          </View>

          <View style={styles.legal}>
            <Text style={styles.legalText}>
              {bl.condiciones || 'Received by the Carrier for shipment between the port of loading and port of discharge, and for arrangement or procurement of pre-carriage and on-carriage to place of delivery, the goods as specified above in apparent good order and condition unless otherwise stated. The goods are subject to the terms, exceptions, limitations and conditions of this Bill of Lading.'}
            </Text>
            <View style={styles.signature}>
              <Text>Dated at</Text>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureValue}>{issuePlace}</Text>
              </View>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureValue}>{companyName}</Text>
              </View>
              <Text style={{ textAlign: 'center', marginTop: 2 }}>AGENT FOR THE CARRIER</Text>
              <View style={styles.dateRow}>
                <Text>{issueDate.month}</Text>
                <Text>{issueDate.day}</Text>
                <Text>{issueDate.year}</Text>
              </View>
              <Text style={[styles.label, { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18 }]}>
                MO.                         DAY                         YEAR
              </Text>
              <Text style={styles.footerNumber}>B/L {value(bl.bl_number)}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
