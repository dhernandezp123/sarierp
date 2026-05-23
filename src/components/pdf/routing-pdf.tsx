import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'

type RoutingPdfProps = {
  routing: any
  quotation?: any
  cliente?: any
}

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
    borderBottom: '1 solid #111827',
    paddingBottom: 10,
    marginBottom: 14,
  },
  logo: {
    width: 120,
    objectFit: 'contain',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'right',
    marginTop: 3,
  },
  section: {
    border: '1 solid #d1d5db',
    marginBottom: 10,
  },
  sectionTitle: {
    backgroundColor: '#111827',
    color: '#ffffff',
    padding: 6,
    fontSize: 10,
    fontWeight: 700,
  },
  row: {
    flexDirection: 'row',
    borderTop: '1 solid #e5e7eb',
  },
  cellLabel: {
    width: '28%',
    padding: 5,
    backgroundColor: '#f3f4f6',
    fontWeight: 700,
  },
  cellValue: {
    width: '72%',
    padding: 5,
  },
  twoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  col: {
    flex: 1,
  },
  paragraph: {
    marginBottom: 8,
    lineHeight: 1.45,
  },
})

const value = (input?: string | number | null) =>
  input === null || input === undefined || input === '' ? 'N/A' : String(input)

function InfoRow({ label, children }: { label: string; children: any }) {
  return (
    <View style={styles.row}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{children}</Text>
    </View>
  )
}

export default function RoutingInstructionsPdf({
  routing,
  quotation,
  cliente,
}: RoutingPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src="/logo/sari-logo.png" style={styles.logo} />

          <View>
            <Text style={styles.title}>ROUTING ORDER</Text>
            <Text style={styles.subtitle}>
              Shipping Instructions / Routing
            </Text>
            <Text style={styles.subtitle}>
              {value(routing.routing_number)}
            </Text>
          </View>
        </View>

        <View style={styles.twoCols}>
          <View style={styles.col}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>CLIENT INFORMATION</Text>
              <InfoRow label="Quote #">
                {value(quotation?.quotation_number)}
              </InfoRow>
              <InfoRow label="Company">
                {value(cliente?.nombre)}
              </InfoRow>
              <InfoRow label="RTN">
                {value(cliente?.rtn || cliente?.nit)}
              </InfoRow>
              <InfoRow label="Contact">
                {value(cliente?.contacto)}
              </InfoRow>
              <InfoRow label="Email">
                {value(cliente?.email_1)}
              </InfoRow>
            </View>
          </View>

          <View style={styles.col}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ROUTING DETAILS</Text>
              <InfoRow label="POL">
                {value(quotation?.puerto_origen)}
              </InfoRow>
              <InfoRow label="POD">
                {value(quotation?.puerto_destino)}
              </InfoRow>
              <InfoRow label="Incoterm">
                {value(quotation?.incoterm)}
              </InfoRow>
              <InfoRow label="Carrier">
                {value(routing.agent_name)}
              </InfoRow>
              <InfoRow label="Containers">
                {value(routing.container_qty)} x {value(routing.container_type)}
              </InfoRow>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SHIPPER / SUPPLIER</Text>
          <InfoRow label="Company">{value(routing.supplier_name)}</InfoRow>
          <InfoRow label="Contact">{value(routing.supplier_contact)}</InfoRow>
          <InfoRow label="Phone">{value(routing.supplier_phone)}</InfoRow>
          <InfoRow label="Email">{value(routing.supplier_email)}</InfoRow>
          <InfoRow label="Address">{value(routing.supplier_address)}</InfoRow>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AGENT INFORMATION</Text>
          <InfoRow label="Agent">{value(routing.agent_name)}</InfoRow>
          <InfoRow label="Contact">{value(routing.agent_contact)}</InfoRow>
          <InfoRow label="Email">{value(routing.agent_email)}</InfoRow>
          <InfoRow label="Freight Terms">{value(routing.freight_terms)}</InfoRow>
          <InfoRow label="Release Type">{value(routing.release_type)}</InfoRow>
          <InfoRow label="HBL Freight">
            {value(routing.hbl_freight_visibility)}
          </InfoRow>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SPECIAL INSTRUCTIONS</Text>
          <Text style={{ padding: 8, lineHeight: 1.4 }}>
            {value(routing.special_instructions)}
          </Text>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>BILL OF LADING INSTRUCTIONS</Text>

        <Text style={styles.paragraph}>To: Overseas Agents</Text>
        <Text style={styles.paragraph}>
          Attention: Export Seafreight Department
        </Text>

        <Text style={styles.paragraph}>
          Dear Partners, please carefully follow these instructions to ensure smooth handling operations in Honduras and avoid unnecessary delays or costs.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Ocean / Master Bill of Lading</Text>
          <Text style={{ padding: 8, lineHeight: 1.45 }}>
            Consignee must be issued exactly as SARI EXPRESS S DE R.L. DE C.V.,
            BO. LOS ANDES 9 CALLE 12-13 AVE N.E, San Pedro Sula, Cortes,
            Honduras, CP: 21101. RTN: 08019003239182.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Freight Terms</Text>
          <Text style={{ padding: 8 }}>
            Master Bill of Lading must show {value(routing.freight_terms)} charges.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. House Bill of Lading</Text>
          <Text style={{ padding: 8, lineHeight: 1.45 }}>
            No freight charges should be stated on the House Bill of Lading.
            Shipper: The Exporter. Consignee: The Importer. Notify Party:
            SARI EXPRESS S DE R.L. DE C.V.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Operational Information</Text>
          <Text style={{ padding: 8, lineHeight: 1.45 }}>
            Send operational updates and documents to ventas2sap@sarihn.com and
            operacionessap@sarihn.com.
          </Text>
        </View>
      </Page>
    </Document>
  )
}