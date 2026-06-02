import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const formatNumber = (value: number, decimals = 2) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

const formatDateOnly = (date?: string | null) => {
  if (!date) return 'N/A'

  const [year, month, day] = date.split('T')[0].split('-')

  if (!year || !month || !day) return date

  return `${day}/${month}/${year}`
}

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    color: '#0F172A',
  },
  pageFooter: {
    position: 'absolute',
    bottom: 10,
    left: 24,
    right: 24,
    textAlign: 'center',
    fontSize: 7,
    color: '#64748B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  logo: {
    width: 150,
    objectFit: 'contain',
    marginBottom: 6,
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
  
  companyInfo: {
    marginTop: 2,
  },
  companyDetails: {
    fontSize: 7,
    color: '#475569',
    marginTop: 1,
  },
  badge: {
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 4,
  },
  headerRight: {
    width: 230,
    alignItems: 'flex-end',
  },
  headerQuoteBox: {
    marginTop: 8,
    width: 230,
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 6,
  },
  headerQuoteTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#B52A37',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  headerQuoteText: {
    fontSize: 7,
    color: '#0F172A',
    marginBottom: 2,
  },
  boldValue: {
    fontWeight: 'bold',
  },
  headerDivider: {
    borderBottomWidth: 2,
    borderBottomColor: '#B52A37',
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
  boxTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#B52A37',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  shipmentGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  shipmentColumn: {
    width: '48%',
  },
  box: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    padding: 10,
    borderRadius: 6,
  },
  section: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#B52A37',
    marginBottom: 3,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: 65,
    fontSize: 8,
    color: '#64748B',
  },
  value: {
    flex: 1,
    fontSize: 8,
    fontWeight: 'bold',
  },
  valueStack: {
    flex: 1,
  },
  fullRow: {
    marginTop: 4,
    marginBottom: 4,
  },
  blockLabel: {
    fontSize: 8,
    color: '#64748B',
    marginBottom: 2,
  },
  blockValue: {
    fontSize: 8,
    fontWeight: 'bold',
    lineHeight: 1.35,
  },
  containerList: {
    marginTop: 2,
    paddingLeft: 4,
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
    width: '34%',
  },
  colSmall: {
    width: '10%',
    textAlign: 'right',
  },
  colAmount: {
    width: '18.6%',
    textAlign: 'right',
  },
  cargoTableCell: {
    width: '16.66%',
  },
  cargoQtyCell: {
    width: '8%',
  },
  cargoTypeCell: {
    width: '13%',
  },
  cargoDimensionsCell: {
    width: '25%',
  },
  cargoNumberCell: {
    width: '13.5%',
    textAlign: 'right',
  },
  cargoSummary: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingVertical: 5,
    paddingHorizontal: 7,
    fontSize: 7,
    fontWeight: 'bold',
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
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
    color: '#B52A37',
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
  marginTop: 14,
  paddingTop: 8,
  fontSize: 7,
  color: '#334155',
  borderTopWidth: 1,
  borderTopColor: '#E5E7EB',
},
  termParagraph: {
    marginBottom: 6,
    textAlign: 'justify',
  },
  termHeading: {
    marginTop: 4,
    marginBottom: 5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
})

const quotationTerms = [
  { type: 'paragraph', text: 'Las tarifas cotizadas están sujetas a disponibilidad de espacio, equipo, itinerarios y confirmación final por parte de la naviera, aerolínea, transportista o proveedor involucrado. Esta cotización no incluye cargos, impuestos, tasas, almacenajes, demoras, detenciones, inspecciones, multas, gastos extraordinarios o cualquier otro concepto no expresamente indicado en la presente propuesta.' },
  { type: 'paragraph', text: 'Los tiempos de tránsito son estimados y se proporcionan únicamente como referencia. Estos pueden variar debido a factores operativos, condiciones climáticas, congestión portuaria o aeroportuaria, cambios de itinerario, transbordos, restricciones gubernamentales, huelgas, eventos de fuerza mayor u otras circunstancias fuera del control de Sari Express.' },
  { type: 'paragraph', text: 'El cliente es responsable de proporcionar información completa, exacta y veraz sobre la mercancía, incluyendo peso, dimensiones, volumen, cantidad de bultos, clasificación, valor comercial, naturaleza de la carga y cualquier requisito especial de manejo o transporte. Cualquier diferencia detectada posteriormente podrá generar ajustes tarifarios, recotizaciones o cargos adicionales.' },
  { type: 'heading', text: 'CONDICIONES ESPECÍFICAS' },
  { type: 'paragraph', text: 'Las tarifas presentadas han sido calculadas con base en la información suministrada por el cliente al momento de la solicitud. Cualquier modificación en las características de la carga, origen, destino, Incoterm, cantidades, pesos, dimensiones o requerimientos especiales podrá generar ajustes en la presente cotización.' },
  { type: 'paragraph', text: 'La disponibilidad de equipos, espacios, itinerarios, días libres, tiempos de tránsito y fechas estimadas de salida o llegada estarán sujetas a confirmación final por parte de los proveedores de transporte involucrados.' },
  { type: 'heading', text: 'CONSIDERACIONES ADICIONALES' },
  { type: 'paragraph', text: 'Los cargos por almacenaje, demurrage, detention, ocupación de equipo, abandono, movimientos extraordinarios, inspecciones, servicios especiales, verificaciones documentales, revisiones físicas o cualquier gasto generado por causas atribuibles al consignatario, importador, exportador o propietario de la carga no están incluidos en esta cotización y serán facturados adicionalmente cuando correspondan.' },
  { type: 'paragraph', text: 'Los costos derivados de inspecciones realizadas por autoridades aduaneras, sanitarias, fitosanitarias, portuarias, aeroportuarias o cualquier entidad regulatoria en origen, tránsito o destino serán responsabilidad del cliente cuando dichos costos no se encuentren expresamente incluidos en la presente propuesta.' },
  { type: 'heading', text: 'CLÁUSULAS ESPECIALES' },
  { type: 'paragraph', text: 'Salvo indicación expresa en esta cotización, el seguro de carga no está incluido. Sari Express recomienda asegurar toda mercancía transportada nacional o internacionalmente.' },
  { type: 'paragraph', text: 'En caso de que el cliente decida no contratar seguro de carga, acepta asumir los riesgos asociados a pérdida, robo, daño parcial o total, mojadura, contaminación, avería, incendio, eventos climáticos, avería gruesa, actos de terceros u otras contingencias inherentes al transporte y manejo de mercancías.' },
  { type: 'paragraph', text: 'En caso de contar con una póliza propia de seguro de carga, será responsabilidad del cliente verificar que dicha cobertura sea suficiente para cubrir los riesgos asociados al transporte contratado.' },
  { type: 'heading', text: 'FACTURACIÓN Y PAGOS' },
  { type: 'paragraph', text: 'La presente cotización es válida únicamente durante el período indicado. La aceptación posterior a la fecha de vencimiento requerirá una nueva validación de tarifas, recargos y disponibilidad.' },
  { type: 'paragraph', text: 'El pago deberá realizarse conforme a las condiciones de crédito o pago previamente acordadas entre las partes. La prestación del servicio podrá quedar condicionada a la recepción de pagos, anticipos, garantías o documentación requerida por Sari Express.' },
  { type: 'paragraph', text: 'Cualquier gasto adicional generado durante la ejecución del servicio que no se encuentre contemplado en la presente cotización podrá ser facturado posteriormente al cliente, previa justificación y respaldo correspondiente.' },
  { type: 'heading', text: 'ACEPTACIÓN DE TÉRMINOS Y CONDICIONES' },
  { type: 'paragraph', text: 'La aceptación de esta cotización, ya sea de forma escrita, electrónica, mediante orden de servicio, confirmación por correo electrónico o instrucción de embarque, constituirá aceptación expresa de los presentes términos y condiciones.' },
  { type: 'paragraph', text: 'Al aceptar esta propuesta, el cliente declara haber leído, comprendido y aceptado íntegramente las condiciones aquí descritas.' },
  { type: 'heading', text: 'EXONERACIÓN DE RESPONSABILIDAD' },
  { type: 'paragraph', text: 'Sari Express no será responsable por retrasos, pérdidas económicas indirectas, lucro cesante, interrupciones comerciales, incumplimientos de terceros, cambios regulatorios, cierres de puertos, congestión logística, cancelaciones de itinerarios, eventos climáticos, conflictos laborales, actos gubernamentales o cualquier otra situación fuera de su control razonable.' },
  { type: 'paragraph', text: 'Asimismo, Sari Express no será responsable por daños derivados de información incorrecta, incompleta o tardía proporcionada por el cliente o por terceros relacionados con la operación.' },
  { type: 'heading', text: 'ACTUALIZACIONES Y CAMBIOS' },
  { type: 'paragraph', text: 'Las tarifas, condiciones operativas y requisitos documentales podrán ser modificados por navieras, aerolíneas, autoridades gubernamentales, terminales, proveedores de transporte o cualquier tercero involucrado en la cadena logística.' },
  { type: 'paragraph', text: 'Sari Express se reserva el derecho de actualizar o modificar las condiciones comerciales de futuras cotizaciones cuando las circunstancias operativas, regulatorias o de mercado así lo requieran, sin que ello afecte los servicios previamente confirmados bajo aceptación expresa.' },
]

function formatMoney(value: any) {
  const number = Number(value || 0)

  return `USD ${number.toFixed(2)}`
}

function getQuoteTitle(quoteType?: string) {
  switch (quoteType) {
    case 'FCL':
      return 'Cotización FCL'
    case 'LCL':
      return 'Cotización LCL'
    case 'FTL':
      return 'Cotización FTL'
    case 'LTL':
      return 'Cotización LTL'
    case 'Courier':
      return 'Cotización Courier'
    case 'Consolidado':
      return 'Cotización Aérea Consolidada'
    default:
      return 'Cotización Logística'
  }
}

function getQuoteTitleByProduct(quotation: any) {
  if (quotation.service_product === 'miami_lcl') {
    return 'Cotización Miami Consolidado LCL'
  }

  if (quotation.service_product === 'miami_air') {
    return 'Cotización Miami Consolidado Aéreo'
  }

  return `Cotización ${quotation.tipo_transporte || 'Logística'}`
}

function filterItems(pricingItems: any[], types: string[]) {
  return pricingItems.filter((item) => types.includes(item.item_type))
}

function getPdfChargeDescription(item: any) {
  if (item.description === 'Desconsolidar') {
    return 'Desconsolidación'
  }

  return item.description
}

const getPdfChargeValues = (item: any) => {
  const qty = Number(item.quantity || item.qty || 1)
  const safeQty = qty > 0 ? qty : 1

  const saleAmount = Number(item.sale_amount || 0)
  const tax = Number(item.tax_amount || 0)
  const storedTotal = Number(item.total_amount || 0)

  const expectedFromUnit = saleAmount * safeQty + tax
  const expectedFromLineSubtotal = saleAmount + tax

  const almostEqual = (a: number, b: number) => Math.abs(a - b) < 0.02

  const unitValue =
    storedTotal > 0 && almostEqual(storedTotal, expectedFromUnit)
      ? saleAmount
      : storedTotal > 0 && almostEqual(storedTotal, expectedFromLineSubtotal)
        ? saleAmount / safeQty
        : storedTotal > 0
          ? saleAmount / safeQty
          : saleAmount

  const total =
    storedTotal > 0
      ? storedTotal
      : unitValue * safeQty + tax

  return {
    qty: safeQty,
    unitValue,
    tax,
    total,
  }
}

function getItemTotals(item: any) {
  const values = getPdfChargeValues(item)
  const subtotal = Number(item.sale_amount || 0)

  return { ...values, subtotal }
}

function getGroupTotal(items: any[]) {
  return items.reduce((sum, item) => {
    const { total } = getItemTotals(item)
    return sum + total
  }, 0)
}

const getChargesSummary = (items: any[]) => {
  return items.reduce(
    (acc, item) => {
      const values = getPdfChargeValues(item)
      const lineSubtotal = values.total - values.tax

      return {
        subtotal: acc.subtotal + lineSubtotal,
        tax: acc.tax + values.tax,
        total: acc.total + values.total,
      }
    },
    {
      subtotal: 0,
      tax: 0,
      total: 0,
    }
  )
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
          <Text style={styles.colAmount}>Valor Unit.</Text>
          <Text style={styles.colAmount}>ISV</Text>
          <Text style={styles.colAmount}>Total</Text>
        </View>

        {items.map((item) => {
          const values = getPdfChargeValues(item)
          const currency = item.currency || 'USD'

          return (
            <View key={item.id} style={styles.tableRow}>
              <Text style={styles.colConcept}>
                {getPdfChargeDescription(item)}
              </Text>

              <Text style={styles.colSmall}>
                {values.qty}
              </Text>

              <Text style={styles.colAmount}>
                {currency} {formatCurrency(values.unitValue)}
              </Text>

              <Text style={styles.colAmount}>
                {currency} {formatCurrency(values.tax)}
              </Text>

              <Text style={styles.colAmount}>
                {currency} {formatCurrency(values.total)}
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
  quotationContainers = [],
  cargoLines = [],
}: {
  quotation: any
  selectedAgent: any
  pricingItems?: any[]
  quotationContainers?: any[]
  cargoLines?: Array<{
    quantity: number
    package_type: string
    length: number | null
    width: number | null
    height: number | null
    dimension_unit: string
    weight_lbs: number | null
    ft3: number | null
    cbm: number | null
  }>
}) {
  const quoteTitle = getQuoteTitleByProduct(quotation)
  const freightItems = filterItems(pricingItems, ['freight', 'Flete'])
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
  const originItems = pricingItems.filter((item) =>
    ['Origen', 'Documentación', 'Aduana'].includes(item.item_type)
  )
  const destinationItems = pricingItems.filter((item) =>
    ['Destino', 'Inland'].includes(item.item_type)
  )
  const additionalItems = pricingItems.filter((item) =>
    ['Seguro', 'Profit', 'Otro'].includes(item.item_type)
  )
  const otherChargeItems = pricingItems.filter(
    (item) =>
      item.item_type === 'Otros Cargos' ||
      !knownGroupedTypes.includes(item.item_type)
  )
  const originCharges = [
    ...originItems,
    ...pricingItems.filter((item) => item.item_type === 'origin_charge'),
  ]
  const destinationCharges = [
    ...destinationItems,
    ...pricingItems.filter((item) => item.item_type === 'destination_charge'),
  ]
  const otherCharges = [
    ...additionalItems,
    ...otherChargeItems,
    ...pricingItems.filter((item) => item.item_type === 'other_charge'),
  ]

  const freightTotal = getGroupTotal(freightItems)
  const originTotal = getGroupTotal(originCharges)
  const destinationTotal = getGroupTotal(destinationCharges)
  const otherChargeTotal = getGroupTotal(otherCharges)

  const freightSummary = getChargesSummary(freightItems)
  const originSummary = getChargesSummary(originCharges)
  const destinationSummary = getChargesSummary(destinationCharges)
  const otherChargeSummary = getChargesSummary(otherCharges)

  const subtotalGeneral =
    freightSummary.subtotal +
    originSummary.subtotal +
    destinationSummary.subtotal +
    otherChargeSummary.subtotal

  const taxGeneral =
    freightSummary.tax +
    originSummary.tax +
    destinationSummary.tax +
    otherChargeSummary.tax

  const totalGeneral =
    freightSummary.total +
    originSummary.total +
    destinationSummary.total +
    otherChargeSummary.total

  const finalTotal =
    Number(quotation.total_sale || 0) ||
    freightTotal +
      originTotal +
      destinationTotal +
      otherChargeTotal

  const formatPersonName = (person?: any) => {
    const name = [person?.nombre, person?.apellido]
      .filter(Boolean)
      .join(' ')
      .trim()

    return name || null
  }

  const customer = quotation.cliente || quotation.clientes
  const activeAgentQuote = selectedAgent
  const freeDays =
    activeAgentQuote?.free_days_destination ||
    activeAgentQuote?.free_days ||
    activeAgentQuote?.dias_libres
  const freeDaysLabel = freeDays ? `${freeDays} días` : 'N/A'
  const vendedorNombre =
    formatPersonName(customer?.vendedor) ||
    formatPersonName(quotation.created_by_profile) ||
    'N/A'

  const quoteType = quotation.quote_type || quotation.tipo_transporte || ''
  const serviceProduct = quotation.service_product || ''

  const isMiamiLcl = serviceProduct === 'miami_lcl'
  const isMiamiAir = serviceProduct === 'miami_air'
  const isFcl = quoteType === 'FCL'
  const isFtl = quoteType === 'FTL'
  const shouldShowCarrierScheduleFields = isFcl || isFtl
  const isLcl =
    quoteType === 'LCL' ||
    serviceProduct === 'other_origin_lcl' ||
    isMiamiLcl
  const isLooseCargo = ['LCL', 'LTL', 'Consolidado', 'Courier'].includes(
    quoteType
  ) || isMiamiLcl || isMiamiAir
  const totalCargoLbs = cargoLines.reduce(
    (sum, line) =>
      sum + Number(line.weight_lbs || 0) * Number(line.quantity || 0),
    0
  )
  const totalCargoFt3 = cargoLines.reduce(
    (sum, line) => sum + Number(line.ft3 || 0),
    0
  )
  const totalCargoCbm = cargoLines.reduce(
    (sum, line) => sum + Number(line.cbm || 0),
    0
  )

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Image src="/logo/sari-logo.png" style={styles.logo} />

            <Text style={styles.companyDetails}>
              SARI EXPRESS S. DE R.L DE C.V
            </Text>

            <Text style={styles.companyDetails}>
              Bo. Los Andes 9 Calle "A" 12-13 Ave. Casa #1225
            </Text>

            <Text style={styles.companyDetails}>
              San Pedro Sula, Cortés, Honduras | RTN: 08019003239182
            </Text>
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.badge}>
              {quoteTitle}
            </Text>

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
                Fecha:{' '}
                <Text style={styles.boldValue}>
                  {formatDateOnly(quotation.created_at)}
                </Text>
              </Text>

              <Text style={styles.headerQuoteText}>
                Válida hasta:{' '}
                <Text style={styles.boldValue}>
                  {formatDateOnly(quotation.valid_until)}
                </Text>
              </Text>

              <Text style={styles.headerQuoteText}>
                Vendedor: <Text style={styles.boldValue}>{vendedorNombre}</Text>
              </Text>
            </View>

          </View>
        </View>
        <View style={styles.headerDivider} />

        <View style={styles.infoGrid}>

          <View style={styles.infoBox}>
            <Text style={styles.boxTitle}>
              INFORMACIÓN DEL CLIENTE
            </Text>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Empresa:</Text>
              <Text style={styles.value}>
                {customer?.nombre || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Contacto:</Text>
              <Text style={styles.value}>
                {customer?.contacto || quotation.contact_name || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>
                {quotation.contact_email || customer?.email_1 || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Teléfono:</Text>
              <Text style={styles.value}>
                {quotation.contact_phone || customer?.telefono || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>País:</Text>
              <Text style={styles.value}>
                {customer?.pais || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>RTN / NIT:</Text>
              <Text style={styles.value}>
                {customer?.rtn ||
                  customer?.nit ||
                  customer?.ruc ||
                  'N/A'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Condición:</Text>
              <Text style={styles.value}>
                {customer?.condicion_pago ||
                  customer?.payment_terms ||
                  'Contado'}
              </Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.boxTitle}>
              DETALLES DEL EMBARQUE
            </Text>

            <View>
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
                    <Text style={styles.label}>Incoterm:</Text>
                    <Text style={styles.value}>{quotation.incoterm || 'N/A'}</Text>
                  </View>

                  {shouldShowCarrierScheduleFields && (
                    <>
                      <View style={styles.row}>
                        <Text style={styles.label}>Carrier:</Text>
                        <Text style={styles.value}>
                          {activeAgentQuote?.carrier ||
                            quotation.preferred_carrier ||
                            'N/A'}
                        </Text>
                      </View>

                      <View style={styles.row}>
                        <Text style={styles.label}>ETD:</Text>
                        <Text style={styles.value}>
                          {formatDateOnly(activeAgentQuote?.etd || quotation.etd)}
                        </Text>
                      </View>
                    </>
                  )}


                  {!isLcl && (
                  <View style={styles.fullRow}>
                    <Text style={styles.blockLabel}>Contenedores / Unidades:</Text>

                    <View style={styles.containerList}>
                      {quotationContainers && quotationContainers.length > 0 ? (
                        quotationContainers.map((container, index) => (
                          <Text key={index} style={styles.blockValue}>
                            • {container.quantity} x {container.container_type_name}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.blockValue}>
                          {quotation.container_qty} x {quotation.container_type}
                        </Text>
                      )}
                    </View>
                  </View>
                  )}

                  <View style={styles.fullRow}>
                    <Text style={styles.blockLabel}>Commodity / Descripción de la carga:</Text>
                    <Text style={styles.blockValue}>{quotation.commodity || 'N/A'}</Text>
                  </View>
                </View>

                <View style={styles.shipmentColumn}>
                  {isLooseCargo && (
                    <>
                      <View style={styles.row}>
                        <Text style={styles.label}>Peso:</Text>
                        <Text style={styles.value}>
                          {isMiamiLcl
                            ? `${formatNumber(
                                Number(quotation.peso_lbs || totalCargoLbs),
                                0
                              )} LBS`
                            : `${formatNumber(
                                Number(quotation.peso_kg || 0),
                                2
                              )} KG`}
                        </Text>
                      </View>

                      <View style={styles.row}>
                        <Text style={styles.label}>Volumen:</Text>
                        <Text style={styles.value}>
                          {isMiamiLcl
                            ? `${formatNumber(
                                Number(quotation.volumen_ft3 || totalCargoFt3),
                                2
                              )} FT3`
                            : `${formatNumber(
                                Number(quotation.volumen_cbm || 0),
                                3
                              )} CBM`}
                        </Text>
                      </View>
                    </>
                  )}

                  <View style={styles.row}>
                    <Text style={styles.label}>Puerto origen:</Text>
                    <Text style={styles.value}>
                      {quotation.origin_port || quotation.puerto_origen || 'N/A'}
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text style={styles.label}>Puerto destino:</Text>
                    <Text style={styles.value}>
                      {quotation.destination_port || quotation.puerto_destino || 'N/A'}
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text style={styles.label}>Días Tránsito:</Text>
                    <Text style={styles.value}>
                      {activeAgentQuote?.transit_time ||
                        quotation.transit_time ||
                        'N/A'}
                    </Text>
                  </View>

                  {shouldShowCarrierScheduleFields && (
                    <View style={styles.row}>
                      <Text style={styles.label}>Días libres:</Text>
                      <Text style={styles.value}>{freeDaysLabel}</Text>
                    </View>
                  )}

                  <View style={styles.row}>
                    <Text style={styles.label}>Transbordo:</Text>
                    <Text style={styles.value}>
                      {activeAgentQuote?.transshipment ||
                        quotation.transshipment ||
                        'Directo'}
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text style={styles.label}>Valor FOB:</Text>
                    <Text style={styles.value}>
                      {quotation.commercial_value
                        ? `USD ${formatCurrency(Number(quotation.commercial_value))}`
                        : 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>

            </View>
          </View>
        </View>

        {cargoLines.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DETALLE DE CARGA</Text>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.cargoQtyCell}>Cant.</Text>
                <Text style={styles.cargoTypeCell}>Tipo</Text>
                <Text style={styles.cargoDimensionsCell}>Dimensiones</Text>
                <Text style={styles.cargoNumberCell}>Peso unit.</Text>
                <Text style={styles.cargoNumberCell}>Total lbs</Text>
                <Text style={styles.cargoNumberCell}>FT3</Text>
                <Text style={styles.cargoNumberCell}>CBM</Text>
              </View>

              {cargoLines.map((line, index) => {
                const lineTotalLbs =
                  Number(line.weight_lbs || 0) * Number(line.quantity || 0)

                return (
                  <View key={index} style={styles.tableRow}>
                    <Text style={styles.cargoQtyCell}>
                      {String(line.quantity)}
                    </Text>
                    <Text style={styles.cargoTypeCell}>
                      {line.package_type}
                    </Text>
                    <Text style={styles.cargoDimensionsCell}>
                      {line.length ?? 'N/A'} x {line.width ?? 'N/A'} x{' '}
                      {line.height ?? 'N/A'} {line.dimension_unit}
                    </Text>
                    <Text style={styles.cargoNumberCell}>
                      {formatNumber(Number(line.weight_lbs || 0), 2)}
                    </Text>
                    <Text style={styles.cargoNumberCell}>
                      {formatNumber(lineTotalLbs, 2)}
                    </Text>
                    <Text style={styles.cargoNumberCell}>
                      {formatNumber(Number(line.ft3 || 0), 2)}
                    </Text>
                    <Text style={styles.cargoNumberCell}>
                      {formatNumber(Number(line.cbm || 0), 3)}
                    </Text>
                  </View>
                )
              })}

              <View style={styles.cargoSummary}>
                <Text>Total lbs: {formatNumber(totalCargoLbs, 0)}</Text>
                <Text>Total FT3: {formatNumber(totalCargoFt3, 2)}</Text>
                <Text>Total CBM: {formatNumber(totalCargoCbm, 3)}</Text>
              </View>
            </View>
          </View>
        )}

        <ChargesTable
          title="Flete"
          items={freightItems}
        />

        <ChargesTable
          title="Gastos de Origen"
          items={originCharges}
        />

        <ChargesTable
          title="Gastos en Destino"
          items={destinationCharges}
        />

        <ChargesTable
          title="Otros Cargos"
          items={otherCharges}
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
            <Text>USD {formatCurrency(subtotalGeneral)}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text>ISV</Text>
            <Text>USD {formatCurrency(taxGeneral)}</Text>
          </View>

          <View style={styles.totalDivider} />

          <View style={styles.grandTotalRow}>
            <Text>Total</Text>
            <Text>USD {formatCurrency(totalGeneral)}</Text>
          </View>
        </View>

        <View style={styles.notes}>
          <Text style={styles.sectionTitle}>Observaciones</Text>
          <Text>
            {quotation.client_notes || 'Sin observaciones'}
          </Text>
        </View>

        <Text
          style={styles.pageFooter}
          render={({ pageNumber, totalPages }) =>
            `Sari Express S. de R.L. de C.V. | Página ${pageNumber} de ${totalPages}`
          }
          fixed
        />

      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.terms}>
          <Text style={styles.sectionTitle}>TÉRMINOS Y CONDICIONES GENERALES</Text>
          {quotationTerms.map((term, index) => (
            <Text
              key={index}
              style={
                term.type === 'heading'
                  ? styles.termHeading
                  : styles.termParagraph
              }
            >
              {term.text}
            </Text>
          ))}
        </View>

        <Text
          style={styles.pageFooter}
          render={({ pageNumber, totalPages }) =>
            `Sari Express S. de R.L. de C.V. | Página ${pageNumber} de ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
