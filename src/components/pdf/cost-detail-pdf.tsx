import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const formatDateOnly = (date?: string | null) => {
  if (!date) return 'N/A'

  const [year, month, day] = date.split('T')[0].split('-')

  if (!year || !month || !day) return date

  return `${day}/${month}/${year}`
}

const formatDateTime = (date?: string | null) => {
  if (!date) return 'N/A'

  const parsedDate = new Date(date)
  const datePart = new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate)
  const timePart = new Intl.DateTimeFormat('es-HN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(parsedDate)

  return `${datePart} a las ${timePart}`
}

const firstValue = (...values: Array<string | number | null | undefined>) =>
  values.find((value) => value !== null && value !== undefined && String(value).trim() !== '')

const styles = StyleSheet.create({
  page: {
    padding: 18,
    paddingBottom: 28,
    fontSize: 7,
    color: '#0F172A',
  },
  pageFooter: {
    position: 'absolute',
    bottom: 7,
    left: 18,
    right: 18,
    textAlign: 'center',
    fontSize: 6,
    color: '#64748B',
  },
  pageFooterMeta: {
    position: 'absolute',
    bottom: 15,
    left: 18,
    right: 18,
    textAlign: 'center',
    fontSize: 6,
    color: '#64748B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  logo: {
    width: 105,
    objectFit: 'contain',
    marginBottom: 2,
  },
  badge: {
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: 'bold',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  headerRight: {
    width: 205,
    alignItems: 'flex-end',
  },
  headerQuoteBox: {
    marginTop: 5,
    width: 205,
    backgroundColor: '#F3F4F6',
    padding: 6,
    borderRadius: 6,
  },
  headerQuoteTitle: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#B52A37',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  headerQuoteText: {
    fontSize: 6.5,
    color: '#0F172A',
    marginBottom: 1,
  },
  boldValue: {
    fontWeight: 'bold',
  },
  headerDivider: {
    borderBottomWidth: 2,
    borderBottomColor: '#B52A37',
    marginBottom: 6,
  },
  internalBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#B52A37',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  internalBannerText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#B52A37',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  infoBox: {
    backgroundColor: '#F3F4F6',
    padding: 6,
    borderRadius: 6,
    marginBottom: 6,
  },
  boxTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#B52A37',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoGridRow: {
    flexDirection: 'row',
    gap: 6,
  },
  infoColumn: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  label: {
    width: 58,
    fontSize: 6,
    color: '#64748B',
  },
  value: {
    flex: 1,
    fontSize: 6,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#B52A37',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  table: {
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 5,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 5.4,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 4,
    fontSize: 5.4,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  groupRow: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    backgroundColor: '#F1F3F5',
    borderTop: '1 solid #D5D9E0',
    borderBottomWidth: 1,
    borderBottomColor: '#D5D9E0',
  },
  groupText: {
    width: '100%',
    color: '#B3282D',
    fontSize: 5.6,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  groupSubtotalRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 4,
    fontSize: 5.4,
    fontWeight: 'bold',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  colConcept: {
    width: '22%',
  },
  colQty: {
    width: '5%',
    textAlign: 'right',
  },
  colAmount: {
    width: '10%',
    textAlign: 'right',
  },
  colProfit: {
    width: '10%',
    textAlign: 'right',
    color: '#15803D',
  },
  colMargin: {
    width: '13%',
    textAlign: 'right',
  },
  summaryBox: {
    width: 185,
    marginLeft: 'auto',
    marginTop: 3,
    borderWidth: 1,
    borderColor: '#0F172A',
    padding: 5,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    flexWrap: 'wrap',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  totalDivider: {
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginVertical: 3,
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#15803D',
    marginBottom: 2,
    fontSize: 7.5,
    fontWeight: 'bold',
  },
  gpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#B52A37',
    marginTop: 1,
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  notes: {
    border: '1px solid #e5e7eb',
    padding: 10,
    borderRadius: 4,
    marginTop: 8,
  },
})

type CostLine = {
  qty: number
  currency: string
  costUnit: number
  costTotal: number
  saleUnit: number
  saleTotal: number
  tax: number
  profit: number
  margin: number
}

// Mismos cálculos que las tarjetas de resumen en quotations/[id]:
// ISV 15% sobre venta cuando el item es taxable; GP% sobre venta sin ISV.
type CostTotals = {
  currency: string
  costTotal: number
  saleTotal: number
  tax: number
  profit: number
}

const getItemCurrency = (item: any) => item.currency || 'USD'

const almostEqual = (a: number, b: number) => Math.abs(a - b) < 0.02

const getCostLine = (item: any): CostLine => {
  const qty = Number(item.quantity || 1)
  const safeQty = qty > 0 ? qty : 1
  const saleUnit = Number(item.sale_amount || 0)
  const costUnit = Number(item.cost_amount || 0)
  const storedTax = Number(item.tax_amount || 0)
  const storedTotal = Number(item.total_amount || 0)

  const computedSaleTotal = safeQty * saleUnit
  const costTotal = safeQty * costUnit
  const computedTax = item.taxable ? computedSaleTotal * 0.15 : 0
  const tax = storedTax > 0 ? storedTax : computedTax
  const saleTotal =
    storedTotal > 0 && almostEqual(storedTotal, computedSaleTotal + tax)
      ? computedSaleTotal
      : storedTotal > 0 && storedTotal > tax
        ? storedTotal - tax
        : computedSaleTotal
  const profit = saleTotal - costTotal
  const margin = saleTotal > 0 ? (profit / saleTotal) * 100 : 0

  return {
    qty: safeQty,
    currency: getItemCurrency(item),
    costUnit,
    costTotal,
    saleUnit,
    saleTotal,
    tax,
    profit,
    margin,
  }
}

const sumLinesByCurrency = (items: any[]) =>
  Array.from(
    items.reduce((acc: Map<string, CostTotals>, item) => {
      const line = getCostLine(item)
      const current =
        acc.get(line.currency) ||
        {
          currency: line.currency,
          costTotal: 0,
          saleTotal: 0,
          tax: 0,
          profit: 0,
        }

      current.costTotal += line.costTotal
      current.saleTotal += line.saleTotal
      current.tax += line.tax
      current.profit += line.profit
      acc.set(line.currency, current)

      return acc
    }, new Map<string, CostTotals>())
  ).map(([, totals]) => totals)

export default function CostDetailPDF({
  quotation,
  selectedAgent,
  pricingItems = [],
  wonAt,
  generatedByName,
  generatedAt,
}: {
  quotation: any
  selectedAgent: any
  pricingItems?: any[]
  wonAt?: string | null
  generatedByName?: string | null
  generatedAt?: string | null
}) {
  const knownGroupedTypes = [
    'freight',
    'origin_charge',
    'destination_charge',
    'other_charge',
    'Flete',
    'Origen',
    'Documentación',
    'Aduana',
    'Destino',
    'Inland',
    'Seguro',
    'Profit',
    'Otro',
    'Otros Cargos',
  ]

  const freightItems = pricingItems.filter((item) =>
    ['freight', 'Flete'].includes(item.item_type)
  )
  const originCharges = pricingItems.filter((item) =>
    ['Origen', 'Documentación', 'Aduana', 'origin_charge'].includes(item.item_type)
  )
  const destinationCharges = pricingItems.filter((item) =>
    ['Destino', 'Inland', 'destination_charge'].includes(item.item_type)
  )
  const otherCharges = pricingItems.filter(
    (item) =>
      ['Seguro', 'Profit', 'Otro', 'Otros Cargos', 'other_charge'].includes(
        item.item_type
      ) || !knownGroupedTypes.includes(item.item_type)
  )

  const groups = [
    { title: 'FLETE', items: freightItems },
    { title: 'GASTOS DE ORIGEN', items: originCharges },
    { title: 'GASTOS EN DESTINO', items: destinationCharges },
    { title: 'OTROS CARGOS', items: otherCharges },
  ].filter((group) => group.items.length > 0)

  const totalsByCurrency = sumLinesByCurrency(pricingItems)

  const customer = quotation.cliente || quotation.clientes
  const quoteDate = quotation.quoted_at || quotation.created_at
  const validUntil =
    selectedAgent?.valid_until ||
    selectedAgent?.validity_date ||
    quotation.valid_until ||
    quotation.validity_date
  const agentName =
    firstValue(
      selectedAgent?.agent_name,
      selectedAgent?.agente_nombre,
      selectedAgent?.agent,
      selectedAgent?.supplier,
      selectedAgent?.supplier_name,
      quotation.agent_name,
      quotation.agente_nombre,
      quotation.agent,
      quotation.supplier_name
    ) || 'N/A'
  const etd = firstValue(selectedAgent?.etd, quotation.etd)
  const originPort =
    firstValue(
      selectedAgent?.pol,
      selectedAgent?.port_of_loading,
      selectedAgent?.puerto_origen,
      quotation.origin_port,
      quotation.puerto_origen,
      quotation.pol,
      quotation.port_of_loading
    ) || 'N/A'
  const destinationPort =
    firstValue(
      selectedAgent?.pod,
      selectedAgent?.port_of_discharge,
      selectedAgent?.puerto_destino,
      quotation.destination_port,
      quotation.puerto_destino,
      quotation.pod,
      quotation.port_of_discharge
    ) || 'N/A'
  const originLabel = firstValue(quotation.origen, quotation.origin) || 'N/A'
  const destinationLabel = firstValue(quotation.destino, quotation.destination) || 'N/A'
  const generatedFooter =
    generatedByName && generatedAt
      ? `Generado por ${generatedByName} en fecha ${formatDateTime(generatedAt)}`
      : 'Generado por N/A'

  return (
    <Document>
      <Page size="LETTER" orientation="portrait" style={styles.page} wrap={false}>
        <View style={styles.header}>
          <View>
            <Image src="/logo/sari-logo.png" style={styles.logo} />
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.badge}>Detalle de Costos</Text>

            <View style={styles.headerQuoteBox}>
              <Text style={styles.headerQuoteTitle}>
                INFORMACIÓN DE COTIZACIÓN
              </Text>

              <Text style={styles.headerQuoteText}>
                No.:{' '}
                <Text style={styles.boldValue}>
                  {quotation.quotation_number || 'N/A'}
                </Text>
              </Text>

              <Text style={styles.headerQuoteText}>
                Fecha cotizacion:{' '}
                <Text style={styles.boldValue}>
                  {formatDateOnly(String(quoteDate || ''))}
                </Text>
              </Text>

              <Text style={styles.headerQuoteText}>
                Validez:{' '}
                <Text style={styles.boldValue}>
                  {formatDateOnly(String(validUntil || ''))}
                </Text>
              </Text>

              <Text style={styles.headerQuoteText}>
                Fecha Ganada:{' '}
                <Text style={styles.boldValue}>
                  {formatDateOnly(wonAt)}
                </Text>
              </Text>

              <Text style={styles.headerQuoteText}>
                Estado:{' '}
                <Text style={styles.boldValue}>
                  {quotation.status || 'N/A'}
                </Text>
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerDivider} />

        <View style={styles.internalBanner}>
          <Text style={styles.internalBannerText}>
            Documento de uso interno — No enviar al cliente
          </Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.boxTitle}>INFORMACIÓN DEL EMBARQUE</Text>

          <View style={styles.infoGridRow}>
            <View style={styles.infoColumn}>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Cliente:</Text>
                <Text style={styles.value}>{customer?.nombre || 'N/A'}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Origen:</Text>
                <Text style={styles.value}>{originLabel}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Destino:</Text>
                <Text style={styles.value}>{destinationLabel}</Text>
              </View>
            </View>

            <View style={styles.infoColumn}>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Tipo:</Text>
                <Text style={styles.value}>
                  {quotation.quote_type || quotation.tipo_transporte || 'N/A'}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Incoterm:</Text>
                <Text style={styles.value}>{quotation.incoterm || 'N/A'}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Carrier:</Text>
                <Text style={styles.value}>
                  {selectedAgent?.carrier ||
                    quotation.preferred_carrier ||
                    'N/A'}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Commodity:</Text>
                <Text style={styles.value}>{quotation.commodity || 'N/A'}</Text>
              </View>
            </View>

            <View style={styles.infoColumn}>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Agente:</Text>
                <Text style={styles.value}>{agentName}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>ETD:</Text>
                <Text style={styles.value}>{formatDateOnly(String(etd || ''))}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Puerto Origen:</Text>
                <Text style={styles.value}>{originPort}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Puerto Destino:</Text>
                <Text style={styles.value}>{destinationPort}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DETALLE DE COSTOS Y VENTA</Text>

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.colConcept}>Concepto</Text>
              <Text style={styles.colQty}>QTY</Text>
              <Text style={styles.colAmount}>Costo U.</Text>
              <Text style={styles.colAmount}>Costo T.</Text>
              <Text style={styles.colAmount}>Venta U.</Text>
              <Text style={styles.colAmount}>Venta T.</Text>
              <Text style={styles.colAmount}>ISV</Text>
              <Text style={styles.colAmount}>Profit</Text>
              <Text style={styles.colMargin}>Margen %</Text>
            </View>

            {groups.map((group) => {
              const groupTotalsByCurrency = sumLinesByCurrency(group.items)

              return (
                <View key={group.title}>
                  <View style={styles.groupRow}>
                    <Text style={styles.groupText}>{group.title}</Text>
                  </View>

                  {group.items.map((item) => {
                    const line = getCostLine(item)

                    return (
                      <View key={item.id} style={styles.tableRow}>
                        <Text style={styles.colConcept}>
                          {item.description || 'N/A'}
                        </Text>
                        <Text style={styles.colQty}>{line.qty}</Text>
                        <Text style={styles.colAmount}>
                          {line.currency} {formatCurrency(line.costUnit)}
                        </Text>
                        <Text style={styles.colAmount}>
                          {line.currency} {formatCurrency(line.costTotal)}
                        </Text>
                        <Text style={styles.colAmount}>
                          {line.currency} {formatCurrency(line.saleUnit)}
                        </Text>
                        <Text style={styles.colAmount}>
                          {line.currency} {formatCurrency(line.saleTotal)}
                        </Text>
                        <Text style={styles.colAmount}>
                          {line.currency} {formatCurrency(line.tax)}
                        </Text>
                        <Text style={styles.colProfit}>
                          {line.currency} {formatCurrency(line.profit)}
                        </Text>
                        <Text style={styles.colMargin}>
                          {line.margin.toFixed(2)}%
                        </Text>
                      </View>
                    )
                  })}

                  {groupTotalsByCurrency.map((groupTotals) => (
                    <View
                      key={`${group.title}-${groupTotals.currency}`}
                      style={styles.groupSubtotalRow}
                    >
                      <Text style={styles.colConcept}>
                        Subtotal {group.title} ({groupTotals.currency})
                      </Text>
                      <Text style={styles.colQty} />
                      <Text style={styles.colAmount} />
                      <Text style={styles.colAmount}>
                        {groupTotals.currency} {formatCurrency(groupTotals.costTotal)}
                      </Text>
                      <Text style={styles.colAmount} />
                      <Text style={styles.colAmount}>
                        {groupTotals.currency} {formatCurrency(groupTotals.saleTotal)}
                      </Text>
                      <Text style={styles.colAmount}>
                        {groupTotals.currency} {formatCurrency(groupTotals.tax)}
                      </Text>
                      <Text style={styles.colProfit}>
                        {groupTotals.currency} {formatCurrency(groupTotals.profit)}
                      </Text>
                      <Text style={styles.colMargin}>
                        {groupTotals.saleTotal > 0
                          ? `${((groupTotals.profit / groupTotals.saleTotal) * 100).toFixed(2)}%`
                          : 'N/A'}
                      </Text>
                    </View>
                  ))}
                </View>
              )
            })}
          </View>
        </View>

        {pricingItems.length === 0 && (
          <View style={styles.notes}>
            <Text>Esta cotización no tiene items de pricing registrados.</Text>
          </View>
        )}

        <View style={styles.summaryGrid} wrap={false}>
          {totalsByCurrency.map((totals) => {
            const gpPercent =
              totals.saleTotal > 0 ? (totals.profit / totals.saleTotal) * 100 : 0

            return (
              <View key={totals.currency} style={styles.summaryBox} wrap={false}>
              <View style={styles.totalRow}>
                <Text>Moneda</Text>
                <Text>{totals.currency}</Text>
              </View>

              <View style={styles.totalRow}>
                <Text>Venta (sin ISV)</Text>
                <Text>{totals.currency} {formatCurrency(totals.saleTotal)}</Text>
              </View>

              <View style={styles.totalRow}>
                <Text>ISV</Text>
                <Text>{totals.currency} {formatCurrency(totals.tax)}</Text>
              </View>

              <View style={styles.totalRow}>
                <Text>Venta Total (con ISV)</Text>
                <Text>{totals.currency} {formatCurrency(totals.saleTotal + totals.tax)}</Text>
              </View>

              <View style={styles.totalRow}>
                <Text>Costo Total</Text>
                <Text>{totals.currency} {formatCurrency(totals.costTotal)}</Text>
              </View>

              <View style={styles.totalDivider} />

              <View style={styles.profitRow}>
                <Text>Profit</Text>
                <Text>{totals.currency} {formatCurrency(totals.profit)}</Text>
              </View>

              <View style={styles.gpRow}>
                <Text>GP%</Text>
                <Text>{gpPercent.toFixed(2)}%</Text>
              </View>
              </View>
            )
          })}
        </View>

        <Text style={styles.pageFooterMeta} fixed>
          {generatedFooter}
        </Text>

        <Text
          style={styles.pageFooter}
          render={({ pageNumber, totalPages }) =>
            `Sari Express S. de R.L. de C.V. | Documento interno | Página ${pageNumber} de ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}

