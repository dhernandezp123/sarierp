import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer'

type RoutingOrderPdfProps = {
  routing: any
  quotation?: any
  cliente?: any
  selectedAgent?: any
}

const SARI_LEGAL_NAME = 'SARI EXPRESS S DE R.L. DE C.V.'
const SARI_ADDRESS =
  'BO. LOS ANDES 9 CALLE 12-13 AVE N.E, San Pedro Sula, Cortes, Honduras, CP: 21101'
const SARI_RTN = '08019003239182'

Font.registerHyphenationCallback((word) => [word])

const BRAND_RED = '#B91C1C'
const BRAND_NAVY = '#1e3a5f'

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottom: `2 solid ${BRAND_RED}`,
    paddingBottom: 10,
    marginBottom: 12,
  },
  logo: {
    width: 118,
    objectFit: 'contain',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'right',
    color: BRAND_RED,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 9,
    color: '#4b5563',
    textAlign: 'right',
  },
  section: {
    border: '1 solid #d1d5db',
    marginBottom: 8,
  },
  sectionTitle: {
    backgroundColor: BRAND_NAVY,
    color: '#ffffff',
    padding: 5,
    paddingLeft: 8,
    fontSize: 10,
    fontWeight: 700,
    borderLeft: `3 solid ${BRAND_RED}`,
  },
  row: {
    flexDirection: 'row',
    borderTop: '1 solid #e5e7eb',
  },
  cellLabel: {
    width: '30%',
    padding: 4,
    backgroundColor: '#e8edf5',
    fontWeight: 700,
  },
  cellValue: {
    width: '70%',
    padding: 4,
    lineHeight: 1.35,
  },
  twoCols: {
    flexDirection: 'row',
    gap: 8,
  },
  col: {
    flex: 1,
  },
  paragraph: {
    marginBottom: 8,
    lineHeight: 1.45,
  },
  noteBox: {
    padding: 6,
    lineHeight: 1.4,
    minHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    borderTop: `1 solid ${BRAND_RED}`,
    paddingTop: 5,
    fontSize: 8,
    color: '#6b7280',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#6b7280',
  },
})

const value = (input?: string | number | boolean | null) => {
  if (input === null || input === undefined || input === '') return 'N/A'
  if (typeof input === 'boolean') return input ? 'Yes' : 'No'
  return String(input)
}

const yesNo = (input?: boolean | string | number | null) => {
  if (input === true || input === 'true' || input === 'Si' || input === 'Sí') {
    return 'Yes'
  }

  if (input === false || input === 'false' || input === 0) return 'No'

  return value(input)
}

const dateValue = (input?: string | null) => {
  if (!input) return 'N/A'

  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(input))
}

const containerSummary = (routing: any) => {
  const containerType = routing?.container_type?.trim?.()
  const containerQty = routing?.container_qty

  if (containerType && /^\d+\s*x\s+/i.test(containerType)) return containerType
  if (containerQty && containerType) return `${containerQty} x ${containerType}`
  if (containerType) return containerType

  return 'N/A'
}

function InfoRow({ label, children }: { label: string; children: any }) {
  return (
    <View style={styles.row}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{children}</Text>
    </View>
  )
}

function DualInfoRow({
  label1, val1, label2, val2,
}: { label1: string; val1: string; label2?: string; val2?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.cellLabel, { width: '22%' }]}>{label1}</Text>
      <Text style={[styles.cellValue, { width: '28%', borderRight: '1 solid #e5e7eb' }]}>{val1}</Text>
      {label2 !== undefined ? (
        <>
          <Text style={[styles.cellLabel, { width: '22%' }]}>{label2}</Text>
          <Text style={[styles.cellValue, { width: '28%' }]}>{val2 ?? 'N/A'}</Text>
        </>
      ) : (
        <Text style={[styles.cellValue, { width: '50%' }]} />
      )}
    </View>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: any
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

export default function RoutingOrderPDF({
  routing,
  quotation,
  cliente,
  selectedAgent,
}: RoutingOrderPdfProps) {
  const quote = quotation || routing?.quotation || {}
  const client = quote?.cliente || quote?.clientes || cliente || routing?.cliente || {}
  const freeDays =
    selectedAgent?.free_days_destination ||
    selectedAgent?.free_days ||
    selectedAgent?.dias_libres ||
    routing?.free_days_destination ||
    routing?.free_days
  const carrier = selectedAgent?.carrier || routing?.carrier || quote?.preferred_carrier
  const incoterm = quote?.incoterm || routing?.incoterm
  const negotiation =
    routing?.freight_terms ||
    selectedAgent?.freight_terms ||
    quote?.freight_terms ||
    quote?.negotiation
  const placeOfDelivery =
    quote?.delivery_address ||
    quote?.direccion_entrega ||
    client?.direccion ||
    'N/A'
  const insurance =
    quote?.requires_insurance !== undefined
      ? yesNo(quote.requires_insurance)
      : value(quote?.insurance || quote?.insurance_cost)
  const customsLocalTransport =
    quote?.customs_local_transport ||
    quote?.customs ||
    quote?.aduana ||
    quote?.local_transport ||
    quote?.transporte_local
  const agentReference =
    selectedAgent?.agent_reference ||
    selectedAgent?.reference_number ||
    selectedAgent?.reference ||
    routing?.reference_number
  const commodity = quote?.commodity || quote?.mercancia
  const remarks =
    routing?.sales_observations ||
    routing?.special_instructions ||
    commodity ||
    quote?.client_notes ||
    quote?.pricing_notes

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src="/logo/sari-logo.png" style={styles.logo} />

          <View>
            <Text style={styles.title}>ROUTING ORDER</Text>
            <Text style={styles.subtitle}>Shipping Instructions</Text>
            <Text style={styles.subtitle}>{value(routing?.routing_number)}</Text>
          </View>
        </View>

        <View style={styles.twoCols}>
          <View style={styles.col}>
            <Section title="QUOTE / CUSTOMER">
              <InfoRow label="Quote number">{value(quote?.quotation_number || routing?.quotation_number)}</InfoRow>
              <InfoRow label="Consignee">{value(client?.nombre || routing?.client_name)}</InfoRow>
              <InfoRow label="RTN / Tax ID">{value(client?.rtn || client?.nit)}</InfoRow>
              <InfoRow label="Address">{value(client?.direccion || client?.address)}</InfoRow>
            </Section>
          </View>

          <View style={styles.col}>
            <Section title="ROUTING DETAILS">
              <InfoRow label="Routing # / SI">{value(routing?.routing_number)}</InfoRow>
              <InfoRow label="Agent">{value(routing?.agent_name || selectedAgent?.agente_nombre || selectedAgent?.agent_name)}</InfoRow>
              <InfoRow label="Agent reference">{value(agentReference)}</InfoRow>
              <InfoRow label="Carrier">{value(carrier)}</InfoRow>
              <InfoRow label="Incoterm">{value(incoterm)}</InfoRow>
              <InfoRow label="Negotiation">{value(negotiation)}</InfoRow>
            </Section>
          </View>
        </View>

        <View style={styles.twoCols}>
          <View style={styles.col}>
            <Section title="SHIPPER CONTACT">
              <InfoRow label="Company">{value(routing?.supplier_name)}</InfoRow>
              <InfoRow label="Contact">{value(routing?.supplier_contact)}</InfoRow>
              <InfoRow label="Email">{value(routing?.supplier_email)}</InfoRow>
              <InfoRow label="Phone">{value(routing?.supplier_phone)}</InfoRow>
              <InfoRow label="Address">{value(routing?.supplier_address)}</InfoRow>
            </Section>
          </View>

          <View style={styles.col}>
            <Section title="CARGO / SERVICE">
              <InfoRow label="Container qty">{value(containerSummary(routing))}</InfoRow>
              <InfoRow label="POL">{value(quote?.puerto_origen || routing?.origin_address)}</InfoRow>
              <InfoRow label="POD">{value(quote?.puerto_destino || routing?.destination_address)}</InfoRow>
              <InfoRow label="Free time">{value(freeDays)}</InfoRow>
              <InfoRow label="Place delivery">{value(placeOfDelivery)}</InfoRow>
              <InfoRow label="Commodity">{value(commodity)}</InfoRow>
            </Section>
          </View>
        </View>

        <Section title="ADDITIONAL REFERENCES">
          <DualInfoRow
            label1="Insurance" val1={insurance}
            label2="ETD" val2={dateValue(selectedAgent?.etd || routing?.etd)}
          />
          <DualInfoRow
            label1="Customs / local transport" val1={value(customsLocalTransport)}
            label2="Transit days" val2={value(selectedAgent?.transit_time || selectedAgent?.transit || routing?.transit_time || routing?.transit)}
          />
          <DualInfoRow
            label1="Transshipment" val1={value(selectedAgent?.transshipment || selectedAgent?.transbordo || routing?.transshipment)}
          />
        </Section>

        <Section title="REMARKS">
          <Text style={styles.noteBox}>{value(remarks)}</Text>
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Sari Express ERP · Routing Order {value(routing?.routing_number)}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src="/logo/sari-logo.png" style={styles.logo} />

          <View>
            <Text style={styles.title}>BILL OF LADING INSTRUCTIONS</Text>
            <Text style={styles.subtitle}>Standard instructions for overseas agent</Text>
          </View>
        </View>

        <Text style={styles.paragraph}>Dear Partners,</Text>
        <Text style={styles.paragraph}>
          Please follow these Bill of Lading instructions carefully and send draft documents for validation before release.
        </Text>

        <Section title="1. MASTER BILL OF LADING">
          <Text style={styles.noteBox}>
            MBL consignee must be issued to {SARI_LEGAL_NAME}, {SARI_ADDRESS}. RTN: {SARI_RTN}.
          </Text>
          <InfoRow label="Freight terms">{value(routing?.freight_terms || 'Collect')}</InfoRow>
        </Section>

        <Section title="2. HOUSE BILL OF LADING">
          <InfoRow label="Shipper / Exporter">{value(routing?.shipper || routing?.supplier_name || 'Exporter')}</InfoRow>
          <InfoRow label="Consignee / Importer">{value(routing?.consignee || client?.nombre)}</InfoRow>
          <InfoRow label="Notify party">{SARI_LEGAL_NAME}</InfoRow>
          <InfoRow label="Notify address">{SARI_ADDRESS}</InfoRow>
          <InfoRow label="Notify RTN / Tax ID">{SARI_RTN}</InfoRow>
        </Section>

        <Section title="3. DOCUMENTS">
          <Text style={styles.noteBox}>
            Send all operational updates and document drafts to Sari Express Operations before final release. Request and share commercial invoice, packing list and any relevant origin, customs, insurance, inspection or regulatory documents required for destination clearance.
          </Text>
        </Section>

        <Section title="4. RELEASE / COORDINATION">
          <Text style={styles.noteBox}>
            Confirm carrier, ETD, transit time, transshipment details and free time at destination. Any change in routing, charges, documents or deadlines must be notified to operations immediately.
          </Text>
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Sari Express ERP · Bill of Lading Instructions</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
