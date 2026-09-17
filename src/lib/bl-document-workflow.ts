export type BlDocumentType = 'MBL' | 'HBL'

export type BlDocumentFields = {
  bl_type: BlDocumentType
  parent_bl_id?: string | null
  bl_number: string
  draft_file_url: string
  shipper: string
  shipper_address: string
  consignee: string
  consignee_address: string
  consignee_email: string
  notify_party: string
  notify_party_address: string
  notify_party_tax_id: string
  notify_party_contact: string
  notify_party_email: string
  place_of_receipt: string
  port_of_loading: string
  port_of_discharge: string
  place_of_delivery: string
  carrier: string
  vessel_name: string
  voyage: string
  etd: string
  eta: string
  description_of_goods: string
  marks_and_numbers: string
  number_of_packages: string
  package_type: string
  gross_weight_kg: string
  measurement_cbm: string
}

export type QuotationCargoSource = {
  commodity?: string | null
  package_details?: string | null
  peso_kg?: number | string | null
  gross_weight?: number | string | null
  volumen_cbm?: number | string | null
  cantidad_bultos?: number | string | null
  package_type?: string | null
}

export type QuotationCargoLine = {
  quantity?: number | string | null
  package_type?: string | null
  weight_lbs?: number | string | null
  cbm?: number | string | null
}

export type BlReadinessItem = {
  field: keyof BlDocumentFields
  label: string
}

export type BlConsistencyField =
  | 'shipper'
  | 'shipper_address'
  | 'consignee'
  | 'consignee_address'
  | 'notify_party'
  | 'notify_party_address'
  | 'place_of_receipt'
  | 'port_of_loading'
  | 'port_of_discharge'
  | 'place_of_delivery'
  | 'carrier'
  | 'vessel_name'
  | 'voyage'
  | 'etd'
  | 'eta'
  | 'description_of_goods'
  | 'number_of_packages'
  | 'package_type'
  | 'gross_weight_kg'
  | 'measurement_cbm'
  | 'freight_terms'
  | 'release_type'

export type BlConsistencyDocument = {
  bl_type: BlDocumentType
} & Partial<Record<BlConsistencyField, string | number | null>>

export type BlValidationSources = {
  operational: Partial<Record<BlConsistencyField, string | number | null>>
  commercial: Partial<Record<BlConsistencyField, string | number | null>>
  parentMbl?: Partial<Record<BlConsistencyField, string | number | null>> | null
}

export type BlConsistencyWarning = {
  field: BlConsistencyField
  label: string
  documentValue: string
  sourceValue: string
  sourceLabel: string
  kind: 'source_mismatch' | 'logical'
}

const LBS_PER_KG = 2.20462

const CONSISTENCY_LABELS: Record<BlConsistencyField, string> = {
  shipper: 'Shipper',
  shipper_address: 'Dirección del shipper',
  consignee: 'Consignee',
  consignee_address: 'Dirección del consignee',
  notify_party: 'Notify Party',
  notify_party_address: 'Dirección del Notify Party',
  place_of_receipt: 'Place of Receipt',
  port_of_loading: 'Port of Loading',
  port_of_discharge: 'Port of Discharge',
  place_of_delivery: 'Place of Delivery',
  carrier: 'Carrier',
  vessel_name: 'Buque',
  voyage: 'Viaje',
  etd: 'ETD',
  eta: 'ETA',
  description_of_goods: 'Descripción de mercancía',
  number_of_packages: 'Cantidad de bultos',
  package_type: 'Tipo de bulto',
  gross_weight_kg: 'Peso bruto',
  measurement_cbm: 'Volumen CBM',
  freight_terms: 'Freight Terms',
  release_type: 'Release Type',
}

const SHARED_OPERATIONAL_FIELDS: BlConsistencyField[] = [
  'carrier',
  'vessel_name',
  'voyage',
  'etd',
  'eta',
  'place_of_receipt',
  'port_of_loading',
  'port_of_discharge',
  'place_of_delivery',
  'description_of_goods',
  'number_of_packages',
  'package_type',
  'gross_weight_kg',
  'measurement_cbm',
  'freight_terms',
  'release_type',
]

const COMMERCIAL_PARTY_FIELDS: BlConsistencyField[] = [
  'shipper',
  'shipper_address',
  'consignee',
  'consignee_address',
  'notify_party',
  'notify_party_address',
]

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

function positiveNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function formatCalculatedNumber(value: number, decimals: number) {
  return Number(value.toFixed(decimals)).toString()
}

function displayValue(value: unknown) {
  return String(value ?? '').trim()
}

function comparableValue(field: BlConsistencyField, value: unknown) {
  const displayed = displayValue(value)
  if (!displayed) return ''

  if (['gross_weight_kg', 'measurement_cbm', 'number_of_packages'].includes(field)) {
    const numeric = Number(displayed)
    return Number.isFinite(numeric) ? numeric.toFixed(3) : displayed
  }

  if (['etd', 'eta'].includes(field)) return displayed.slice(0, 10)

  return displayed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function sourceWarning(
  field: BlConsistencyField,
  document: BlConsistencyDocument,
  source: Partial<Record<BlConsistencyField, string | number | null>>,
  sourceLabel: string
): BlConsistencyWarning | null {
  const sourceValue = displayValue(source[field])
  const documentValue = displayValue(document[field])

  if (!sourceValue || !documentValue) return null
  if (comparableValue(field, sourceValue) === comparableValue(field, documentValue)) {
    return null
  }

  return {
    field,
    label: CONSISTENCY_LABELS[field],
    documentValue,
    sourceValue,
    sourceLabel,
    kind: 'source_mismatch',
  }
}

export function getBlConsistencyWarnings(
  document: BlConsistencyDocument,
  sources: BlValidationSources
): BlConsistencyWarning[] {
  const warnings: BlConsistencyWarning[] = []
  const sharedSource =
    document.bl_type === 'HBL' && sources.parentMbl
      ? sources.parentMbl
      : sources.operational
  const sharedSourceLabel =
    document.bl_type === 'HBL' && sources.parentMbl
      ? 'MBL padre'
      : 'Booking / Shipping Instruction'

  for (const field of SHARED_OPERATIONAL_FIELDS) {
    const warning = sourceWarning(field, document, sharedSource, sharedSourceLabel)
    if (warning) warnings.push(warning)
  }

  if (document.bl_type === 'HBL') {
    for (const field of COMMERCIAL_PARTY_FIELDS) {
      const warning = sourceWarning(
        field,
        document,
        sources.commercial,
        'Shipping Instruction / cotización'
      )
      if (warning) warnings.push(warning)
    }
  }

  const etd = displayValue(document.etd).slice(0, 10)
  const eta = displayValue(document.eta).slice(0, 10)
  if (etd && eta && /^\d{4}-\d{2}-\d{2}$/.test(etd) && /^\d{4}-\d{2}-\d{2}$/.test(eta) && eta < etd) {
    warnings.push({
      field: 'eta',
      label: 'Secuencia ETD / ETA',
      documentValue: eta,
      sourceValue: `ETA igual o posterior a ${etd}`,
      sourceLabel: 'Regla documental',
      kind: 'logical',
    })
  }

  const loading = comparableValue('port_of_loading', document.port_of_loading)
  const discharge = comparableValue('port_of_discharge', document.port_of_discharge)
  if (loading && discharge && loading === discharge) {
    warnings.push({
      field: 'port_of_discharge',
      label: 'Ruta documental',
      documentValue: displayValue(document.port_of_discharge),
      sourceValue: 'POL y POD deben revisarse porque son iguales',
      sourceLabel: 'Regla documental',
      kind: 'logical',
    })
  }

  return warnings
}

export function buildQuotationCargoDefaults(
  quotation: QuotationCargoSource | null | undefined,
  cargoLines: QuotationCargoLine[] = []
): Partial<BlDocumentFields> {
  const usableLines = cargoLines.filter((line) => positiveNumber(line.quantity) > 0)
  const linePackages = usableLines.reduce(
    (sum, line) => sum + positiveNumber(line.quantity),
    0
  )
  const lineWeightKg = usableLines.reduce(
    (sum, line) =>
      sum +
      (positiveNumber(line.weight_lbs) * positiveNumber(line.quantity)) / LBS_PER_KG,
    0
  )
  const lineCbm = usableLines.reduce((sum, line) => sum + positiveNumber(line.cbm), 0)
  const packageTypes = Array.from(
    new Set(
      usableLines
        .map((line) => String(clean(line.package_type) || ''))
        .filter(Boolean)
    )
  )

  const quotedWeightKg =
    positiveNumber(quotation?.peso_kg) || positiveNumber(quotation?.gross_weight)
  const quotedCbm = positiveNumber(quotation?.volumen_cbm)
  const quotedPackages = positiveNumber(quotation?.cantidad_bultos)

  return {
    description_of_goods:
      String(clean(quotation?.commodity) || clean(quotation?.package_details) || ''),
    number_of_packages: linePackages
      ? formatCalculatedNumber(linePackages, 2)
      : quotedPackages
        ? formatCalculatedNumber(quotedPackages, 2)
        : '',
    package_type:
      packageTypes.length > 0
        ? packageTypes.join(' / ')
        : String(clean(quotation?.package_type) || ''),
    gross_weight_kg: lineWeightKg
      ? formatCalculatedNumber(lineWeightKg, 2)
      : quotedWeightKg
        ? formatCalculatedNumber(quotedWeightKg, 2)
        : '',
    measurement_cbm: lineCbm
      ? formatCalculatedNumber(lineCbm, 3)
      : quotedCbm
        ? formatCalculatedNumber(quotedCbm, 3)
        : '',
  }
}

const PARENT_INHERITED_FIELDS: (keyof BlDocumentFields)[] = [
  'carrier',
  'vessel_name',
  'voyage',
  'etd',
  'eta',
  'place_of_receipt',
  'port_of_loading',
  'port_of_discharge',
  'place_of_delivery',
  'description_of_goods',
  'marks_and_numbers',
  'number_of_packages',
  'package_type',
  'gross_weight_kg',
  'measurement_cbm',
]

export function inheritParentMblData(
  commercialDefaults: Partial<BlDocumentFields>,
  parentMbl: Partial<BlDocumentFields>
) {
  const result: Partial<BlDocumentFields> = { ...commercialDefaults, bl_number: '' }

  for (const field of PARENT_INHERITED_FIELDS) {
    const parentValue = clean(parentMbl[field])
    if (parentValue !== '' && parentValue !== null && parentValue !== undefined) {
      result[field] = String(parentValue) as never
    }
  }

  return result
}

function normalizedMode(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function getBlReadiness(
  form: BlDocumentFields,
  transportMode: string,
  nextStatus: string
) {
  const required: BlReadinessItem[] = [
    { field: 'bl_number', label: 'Número de documento' },
    { field: 'shipper', label: 'Shipper' },
    { field: 'consignee', label: 'Consignee' },
    { field: 'port_of_loading', label: 'Puerto/lugar de carga' },
    { field: 'port_of_discharge', label: 'Puerto/lugar de descarga' },
    { field: 'carrier', label: 'Carrier' },
    { field: 'description_of_goods', label: 'Descripción de mercancía' },
    { field: 'gross_weight_kg', label: 'Peso bruto' },
  ]
  const warnings: BlReadinessItem[] = [
    { field: 'shipper_address', label: 'Dirección del shipper' },
    { field: 'consignee_address', label: 'Dirección del consignee' },
    { field: 'number_of_packages', label: 'Cantidad de bultos' },
    { field: 'package_type', label: 'Tipo de bulto' },
    { field: 'measurement_cbm', label: 'Volumen CBM' },
  ]
  const mode = normalizedMode(transportMode)

  if (mode.includes('aereo')) {
    required.push({ field: 'voyage', label: 'Número de vuelo' })
  } else if (!mode.includes('terrestre')) {
    required.push(
      { field: 'vessel_name', label: 'Nombre del buque' },
      { field: 'voyage', label: 'Voyage' }
    )
  }

  if (form.bl_type === 'MBL' && nextStatus === 'MBL Validado') {
    required.push({ field: 'draft_file_url', label: 'Draft MBL del agente' })
  }

  if (form.bl_type === 'HBL' && nextStatus === 'Pendiente Aprobación Cliente') {
    required.push({ field: 'parent_bl_id', label: 'MBL padre validado' })
    warnings.push({ field: 'consignee_email', label: 'Email del consignee' })
  }

  const missing = (items: BlReadinessItem[]) =>
    items.filter(({ field }) => {
      const value = clean(form[field])
      if (['gross_weight_kg', 'number_of_packages', 'measurement_cbm'].includes(field)) {
        return positiveNumber(value) === 0
      }
      return !value
    })

  return {
    blocking: missing(required),
    warnings: missing(warnings),
  }
}
