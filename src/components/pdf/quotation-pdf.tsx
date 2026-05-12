import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
} from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 24,
  },
  company: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 14,
    marginTop: 8,
  },
  section: {
    marginBottom: 16,
    padding: 12,
    border: '1px solid #ddd',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  row: {
    marginBottom: 4,
  },
  label: {
    fontWeight: 'bold',
  },
})

export default function QuotationPDF({
  quotation,
  selectedAgent,
}: {
  quotation: any
  selectedAgent: any
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.company}>SARI EXPRESS HONDURAS</Text>
          <Text style={styles.title}>
            Cotización: {quotation.quotation_number || 'Sin número'}
          </Text>
          <Text>
            Fecha: {new Date().toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>

          <Text style={styles.row}>
            <Text style={styles.label}>Nombre: </Text>
            {quotation.clientes?.nombre || 'N/A'}
          </Text>

          <Text style={styles.row}>
            <Text style={styles.label}>RTN/NIT: </Text>
            {quotation.clientes?.nit || 'N/A'}
          </Text>

          <Text style={styles.row}>
            <Text style={styles.label}>Teléfono: </Text>
            {quotation.clientes?.telefono || 'N/A'}
          </Text>

          <Text style={styles.row}>
            <Text style={styles.label}>Email: </Text>
            {quotation.clientes?.email_1 || 'N/A'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información Logística</Text>

          <Text style={styles.row}>
            <Text style={styles.label}>Origen: </Text>
            {quotation.origen || 'N/A'}
          </Text>

          <Text style={styles.row}>
            <Text style={styles.label}>Destino: </Text>
            {quotation.destino || 'N/A'}
          </Text>

          <Text style={styles.row}>
            <Text style={styles.label}>Incoterm: </Text>
            {quotation.incoterm || 'N/A'}
          </Text>

          <Text style={styles.row}>
            <Text style={styles.label}>Transporte: </Text>
            {quotation.tipo_transporte || 'N/A'}
          </Text>

          <Text style={styles.row}>
            <Text style={styles.label}>Peso: </Text>
            {quotation.peso_kg || 'N/A'} KG
          </Text>

          <Text style={styles.row}>
            <Text style={styles.label}>CBM: </Text>
            {quotation.volumen_cbm || 'N/A'}
          </Text>

          <Text style={styles.row}>
            <Text style={styles.label}>Bultos: </Text>
            {quotation.cantidad_bultos || 'N/A'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tarifa Seleccionada</Text>

          {selectedAgent ? (
            <>
              <Text style={styles.row}>
                <Text style={styles.label}>Agente: </Text>
                {selectedAgent.agente_nombre}
              </Text>

              <Text style={styles.row}>
                <Text style={styles.label}>Costo: </Text>
                {selectedAgent.moneda} {selectedAgent.costo}
              </Text>

              <Text style={styles.row}>
                <Text style={styles.label}>Tránsito: </Text>
                {selectedAgent.transit_time || 'N/A'}
              </Text>
            </>
          ) : (
            <Text>No hay tarifa seleccionada.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observaciones</Text>
          <Text>{quotation.observaciones || 'Sin observaciones'}</Text>
        </View>
      </Page>
    </Document>
  )
}