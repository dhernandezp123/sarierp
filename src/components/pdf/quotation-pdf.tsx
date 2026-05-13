import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
} from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    color: '#0F172A',
  },
  header: {
    borderBottom: '3px solid #0f172a',
    paddingBottom: 12,
    marginBottom: 18,
  },
  company: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 8,
    marginBottom: 8,
    color: '#4b5563',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    color: 'white',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 10,
    fontSize: 8,
    fontWeight: 'bold',
  },
  headerDivider: {
    marginBottom: 12,
  },
  topGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  infoBox: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 6,
  },
  infoTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  shipmentBox: {
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  shipmentGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shipmentColumn: {
    width: '32%',
  },
  box: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    padding: 10,
    borderRadius: 6,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 5,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: 70,
    fontSize: 7,
    color: '#64748B',
  },
  value: {
    flex: 1,
    fontSize: 7,
    fontWeight: 'bold',
  },
  table: {
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    paddingVertical: 5,
    paddingHorizontal: 7,
    fontSize: 7,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 7,
    fontSize: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  colConcept: {
    width: '40%',
  },
  colSmall: {
    width: '12%',
    textAlign: 'right',
  },
  colAmount: {
    width: '16%',
    textAlign: 'right',
  },
  summaryBox: {
    width: 250,
    marginLeft: 'auto',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#0F172A',
    padding: 8,
  },
  totalDivider: {
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginVertical: 6,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    fontSize: 12,
    fontWeight: 'bold',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1px solid #0f172a',
    paddingTop: 6,
    marginTop: 4,
    fontSize: 12,
    fontWeight: 'bold',
  },
  notes: {
    border: '1px solid #e5e7eb',
    padding: 10,
    borderRadius: 4,
    marginTop: 8,
  },
  terms: {
    marginTop: 18,
    paddingTop: 10,
    borderTop: '1px solid #e5e7eb',
    fontSize: 8,
    color: '#4b5563',
  },
})

function formatMoney(value: any) {
  const number = Number(value || 0)

  return `USD ${number.toFixed(2)}`
}

function filterItems(pricingItems: any[], type: string) {
  return pricingItems.filter((item) => item.item_type === type)
}

function getItemTotals(item: any) {
  const qty = Number(item.quantity || 1)
  const sale = Number(item.sale_amount || 0)
  const subtotal = qty * sale
  const tax = item.taxable ? subtotal * 0.15 : 0
  const total = subtotal + tax

  return { qty, sale, subtotal, tax, total }
}

function getGroupTotal(items: any[]) {
  return items.reduce((sum, item) => {
    const { total } = getItemTotals(item)
    return sum + total
  }, 0)
}

function ChargesTable({
  title,
  items,
}: {
  title: string
  items: any[]
}) {
  if (items.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.colConcept}>Concepto</Text>
          <Text style={styles.colSmall}>QTY</Text>
          <Text style={styles.colAmount}>Valor</Text>
          <Text style={styles.colAmount}>ISV</Text>
          <Text style={styles.colAmount}>Total</Text>
        </View>

        {items.map((item) => {
          const { qty, subtotal, tax, total } = getItemTotals(item)
          const currency = item.currency || 'USD'

          return (
            <View key={item.id} style={styles.tableRow}>
              <Text style={styles.colConcept}>
                {item.description}
              </Text>

              <Text style={styles.colSmall}>
                {qty}
              </Text>

              <Text style={styles.colAmount}>
                {currency} {subtotal.toFixed(2)}
              </Text>

              <Text style={styles.colAmount}>
                {currency} {tax.toFixed(2)}
              </Text>

              <Text style={styles.colAmount}>
                {currency} {total.toFixed(2)}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export default function QuotationPDF({
  quotation,
  selectedAgent,
  pricingItems = [],
}: {
  quotation: any
  selectedAgent: any
  pricingItems?: any[]
}) {
  const freightItems = filterItems(pricingItems, 'Flete')
  const originItems = pricingItems.filter((item) =>
    ['Origen', 'Documentación', 'Aduana'].includes(item.item_type)
  )
  const destinationItems = pricingItems.filter((item) =>
    ['Destino', 'Inland'].includes(item.item_type)
  )
  const additionalItems = pricingItems.filter((item) =>
    ['Seguro', 'Profit', 'Otro'].includes(item.item_type)
  )

  const freightTotal = getGroupTotal(freightItems)
  const originTotal = getGroupTotal(originItems)
  const destinationTotal = getGroupTotal(destinationItems)
  const additionalTotal = getGroupTotal(additionalItems)

  const subtotalGeneral = pricingItems.reduce((sum, item) => {
    const qty = Number(item.quantity || 1)
    const sale = Number(item.sale_amount || 0)
    return sum + qty * sale
  }, 0)

  const taxGeneral = pricingItems.reduce((sum, item) => {
    const qty = Number(item.quantity || 1)
    const sale = Number(item.sale_amount || 0)
    const subtotal = qty * sale
    return sum + (item.taxable ? subtotal * 0.15 : 0)
  }, 0)

  const totalGeneral = subtotalGeneral + taxGeneral

  const finalTotal =
    Number(quotation.total_sale || 0) ||
    freightTotal + originTotal + destinationTotal + additionalTotal

  const sellerName = quotation.profiles
    ? `${quotation.profiles.nombre} ${quotation.profiles.apellido}`
    : 'N/A'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, styles.headerDivider]}>
          <Text style={styles.title}>SARI EXPRESS HONDURAS</Text>

          <Text style={styles.subtitle}>
            Soluciones logísticas internacionales | Transporte marítimo, aéreo y terrestre
          </Text>

          <Text style={styles.badge}>
            {quotation.quote_type || 'Cotización Logística'}
          </Text>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>
              INFORMACIÓN DE COTIZACIÓN
            </Text>

            <View style={styles.infoRow}>
              <Text style={styles.label}>No. Cotización:</Text>
              <Text style={styles.value}>
                {quotation.quotation_number || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Fecha:</Text>
              <Text style={styles.value}>
                {quotation.created_at
                  ? new Date(quotation.created_at).toLocaleDateString()
                  : new Date().toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Válida hasta:</Text>
              <Text style={styles.value}>
                {quotation.valid_until || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Vendedor:</Text>
              <Text style={styles.value}>
                {sellerName}
              </Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>
              INFORMACIÓN DEL CLIENTE
            </Text>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Empresa:</Text>
              <Text style={styles.value}>
                {quotation.clientes?.nombre || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Contacto:</Text>
              <Text style={styles.value}>
                {quotation.contact_name || quotation.clientes?.nombre || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>
                {quotation.contact_email || quotation.clientes?.email_1 || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Teléfono:</Text>
              <Text style={styles.value}>
                {quotation.contact_phone || quotation.clientes?.telefono || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>País:</Text>
              <Text style={styles.value}>
                {quotation.clientes?.pais || 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.shipmentBox}>
  <Text style={styles.sectionTitle}>
    Detalles del Embarque
  </Text>

  <View style={styles.shipmentGrid}>
    <View style={styles.shipmentColumn}>
      <View style={styles.row}>
        <Text style={styles.label}>Origen:</Text>
        <Text style={styles.value}>{quotation.origen || 'N/A'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Destino:</Text>
        <Text style={styles.value}>{quotation.destino || 'N/A'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Contenedor:</Text>
        <Text style={styles.value}>{quotation.container_type || 'N/A'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Peso:</Text>
        <Text style={styles.value}>{quotation.peso_kg || 'N/A'} KG</Text>
      </View>
    </View>

    <View style={styles.shipmentColumn}>
      <View style={styles.row}>
        <Text style={styles.label}>Volumen:</Text>
        <Text style={styles.value}>{quotation.volumen_cbm || 'N/A'} CBM</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Incoterm:</Text>
        <Text style={styles.value}>{quotation.incoterm || 'N/A'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Tránsito:</Text>
        <Text style={styles.value}>{quotation.transit_time || 'N/A'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Frecuencia:</Text>
        <Text style={styles.value}>{quotation.service_frequency || 'N/A'}</Text>
      </View>
    </View>

    <View style={styles.shipmentColumn}>
      <View style={styles.row}>
        <Text style={styles.label}>Carrier:</Text>
        <Text style={styles.value}>{quotation.preferred_carrier || 'N/A'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Commodity:</Text>
        <Text style={styles.value}>{quotation.commodity || 'N/A'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Transbordo:</Text>
        <Text style={styles.value}>{quotation.transshipment || 'Directo'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Valor FOB:</Text>
        <Text style={styles.value}>
          {quotation.commercial_value
            ? `USD ${Number(quotation.commercial_value).toFixed(2)}`
            : 'N/A'}
        </Text>
      </View>
    </View>
  </View>
</View>

        <ChargesTable
          title="Flete"
          items={freightItems}
        />

        <ChargesTable
          title="Gastos de Origen"
          items={originItems}
        />

        <ChargesTable
          title="Gastos en Destino"
          items={destinationItems}
        />

        <ChargesTable
          title="Servicios Adicionales"
          items={additionalItems}
        />

        {pricingItems.length === 0 && (
          <View style={styles.notes}>
            <Text>
              No hay cargos comerciales aprobados para esta cotización.
            </Text>
          </View>
        )}

        <View style={styles.summaryBox} wrap={false}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>USD {subtotalGeneral.toFixed(2)}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text>ISV</Text>
            <Text>USD {taxGeneral.toFixed(2)}</Text>
          </View>

          <View style={styles.totalDivider} />

          <View style={styles.grandTotalRow}>
            <Text>Total</Text>
            <Text>USD {totalGeneral.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.notes}>
          <Text style={styles.sectionTitle}>Observaciones</Text>
          <Text>
            {quotation.observaciones || 'Sin observaciones'}
          </Text>
        </View>

        <View style={styles.terms}>
          <Text>
            Términos: Tarifa sujeta a disponibilidad de espacio, equipo y confirmación final del proveedor.
            No incluye cargos no especificados, impuestos, almacenajes, demoras, inspecciones, multas o gastos extraordinarios.
            Los tiempos de tránsito son estimados y pueden variar por condiciones operativas.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
