export type CargoDimensionLine = {
  id: string
  quantity: string
  packageType: 'Caja' | 'Pallet' | 'Pieza'
  length: string
  width: string
  height: string
  dimensionUnit: 'in' | 'cm' | 'mm' | 'm'
  weight: string
  weightUnit?: 'lbs' | 'kg'
  volumeMode?: 'dimensions' | 'manual'
  manualCbm?: string | number
}

export const createEmptyCargoLine = (): CargoDimensionLine => ({
  id: crypto.randomUUID(),
  quantity: '1',
  packageType: 'Caja',
  length: '',
  width: '',
  height: '',
  dimensionUnit: 'm',
  weight: '',
  weightUnit: 'lbs',
  volumeMode: 'dimensions',
  manualCbm: '',
})

export const getCbmPerUnit = (line: CargoDimensionLine) => {
  const length = Number(line.length || 0)
  const width = Number(line.width || 0)
  const height = Number(line.height || 0)

  if (!length || !width || !height) return 0

  if (line.dimensionUnit === 'in') {
    return (length * width * height) / 61023.7441
  }

  if (line.dimensionUnit === 'cm') {
    return (length * width * height) / 1_000_000
  }

  if (line.dimensionUnit === 'mm') {
    return (length * width * height) / 1_000_000_000
  }

  if (line.dimensionUnit === 'm') {
    return length * width * height
  }

  return 0
}

export const getCargoVolumeMode = (line: CargoDimensionLine) =>
  line.volumeMode || 'dimensions'

export const hasLineVolume = (line: CargoDimensionLine) => {
  if (getCargoVolumeMode(line) === 'manual') {
    return Number(line.manualCbm || 0) > 0
  }

  return (
    Number(line.length || 0) > 0 &&
    Number(line.width || 0) > 0 &&
    Number(line.height || 0) > 0
  )
}

export const calculateLineCbm = (line: CargoDimensionLine) => {
  if (getCargoVolumeMode(line) === 'manual') {
    return Number(line.manualCbm || 0)
  }

  const quantity = Number(line.quantity || 0)
  if (!quantity) return 0

  return getCbmPerUnit(line) * quantity
}

export const calculateLineFt3 = (line: CargoDimensionLine) => {
  return calculateLineCbm(line) * 35.3147
}

export const getCargoWeightUnit = (line: CargoDimensionLine) =>
  line.weightUnit || 'lbs'

export const getLineUnitWeightLbs = (line: CargoDimensionLine) => {
  const weight = Number(line.weight || 0)
  return getCargoWeightUnit(line) === 'kg' ? weight * 2.20462 : weight
}

export const getLineUnitWeightKg = (line: CargoDimensionLine) => {
  const weight = Number(line.weight || 0)
  return getCargoWeightUnit(line) === 'kg' ? weight : weight / 2.20462
}

export const getLineTotalWeightLbs = (line: CargoDimensionLine) =>
  getLineUnitWeightLbs(line) * Number(line.quantity || 0)

export const getLineTotalWeightKg = (line: CargoDimensionLine) =>
  getLineUnitWeightKg(line) * Number(line.quantity || 0)

// Divisor IATA para carga aérea: 1 CBM equivale a 166.67 kg volumétricos.
export const AIR_VOLUMETRIC_DIVISOR_CM3 = 6000
export const AIR_VOLUMETRIC_KG_PER_CBM = 1_000_000 / AIR_VOLUMETRIC_DIVISOR_CM3

export const getAirChargeableWeights = (actualKg: number, cbm: number) => {
  const volumetricKg = cbm * AIR_VOLUMETRIC_KG_PER_CBM
  return {
    actualWeightKg: actualKg,
    volumetricWeightKg: volumetricKg,
    chargeableWeightKg: Math.max(actualKg, volumetricKg, 0),
  }
}

export type CargoLineIssue = 'quantity' | 'volume' | 'weight'

export const cargoLineIssueLabels: Record<CargoLineIssue, string> = {
  quantity: 'cantidad',
  volume: 'volumen (dimensiones o CBM)',
  weight: 'peso',
}

// Línea sin datos capturados; la cantidad inicial por defecto no cuenta como dato.
export const isBlankCargoLine = (line: CargoDimensionLine) =>
  !Number(line.length || 0) &&
  !Number(line.width || 0) &&
  !Number(line.height || 0) &&
  !Number(line.weight || 0) &&
  !Number(line.manualCbm || 0)

// Una línea sin cantidad o volumen no se persiste; Pricing además necesita el peso.
export const getCargoLineIssues = (
  line: CargoDimensionLine,
  requireWeight: boolean
): CargoLineIssue[] => {
  const issues: CargoLineIssue[] = []
  if (!(Number(line.quantity || 0) > 0)) issues.push('quantity')
  if (!hasLineVolume(line)) issues.push('volume')
  if (requireWeight && !(Number(line.weight || 0) > 0)) issues.push('weight')
  return issues
}

export type CargoValidationMode = 'draft' | 'pricing'

export type CargoLinesValidation = {
  issuesByLine: Record<string, CargoLineIssue[]>
  message: string | null
}

// Valida exactamente las líneas que se enviarán: Pricing exige al menos una línea
// completa; ningún modo permite descartar en silencio una línea con datos.
export function validateCargoLines(
  lines: CargoDimensionLine[],
  mode: CargoValidationMode
): CargoLinesValidation {
  const requireWeight = mode === 'pricing'
  const issuesByLine: Record<string, CargoLineIssue[]> = {}
  const capturedLines = lines.filter((line) => !isBlankCargoLine(line))

  if (mode === 'pricing' && capturedLines.length === 0) {
    for (const line of lines) issuesByLine[line.id] = getCargoLineIssues(line, true)
    return {
      issuesByLine,
      message: 'Completa al menos una línea de carga con cantidad, volumen y peso',
    }
  }

  const invalidNumbers: number[] = []
  const missing = new Set<CargoLineIssue>()
  lines.forEach((line, index) => {
    if (isBlankCargoLine(line)) return
    const issues = getCargoLineIssues(line, requireWeight)
    if (issues.length === 0) return
    issuesByLine[line.id] = issues
    invalidNumbers.push(index + 1)
    issues.forEach((issue) => missing.add(issue))
  })

  if (invalidNumbers.length === 0) return { issuesByLine, message: null }

  const lineLabel = invalidNumbers.length === 1 ? 'la línea de carga' : 'las líneas de carga'
  const missingLabel = [...missing].map((issue) => cargoLineIssueLabels[issue]).join(', ')
  return {
    issuesByLine,
    message: `Completa ${lineLabel} ${invalidNumbers.map((n) => `#${n}`).join(', ')}: falta ${missingLabel}`,
  }
}

type SourceCargo = {
  containers: { quantity?: number | string | null; container_type_name?: string | null; container_type?: string | null }[]
  cargoLines: { quantity?: number | string | null; cbm?: number | string | null; weight_lbs?: number | string | null }[]
  quote: {
    container_type?: string | null
    container_qty?: number | string | null
    peso_kg?: number | string | null
    gross_weight?: number | string | null
    volumen_cbm?: number | string | null
    cantidad_bultos?: number | string | null
    package_type?: string | null
  }
}

const formatCargoNumber = (value: number, decimals: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

// Carga de la cotización origen que la copia no conserva en la estructura destino
// ('containers' = FCL/FTL, 'loose' = carga suelta, 'none' = modalidad por definir).
// Vacío cuando todo lo capturado sigue disponible en el formulario.
export function summarizeUncarriedCargo(
  { containers, cargoLines, quote }: SourceCargo,
  targetStructure: 'containers' | 'loose' | 'none'
) {
  const summary: string[] = []

  if (targetStructure !== 'containers' && containers.length > 0) {
    summary.push(`Contenedores: ${containers
      .map((line) => `${Number(line.quantity || 1)} × ${line.container_type_name || line.container_type || 'Sin tipo'}`)
      .join(', ')}`)
  }

  // Datos legacy de contenedor sin líneas en quotation_containers.
  if (containers.length === 0 && quote.container_type) {
    summary.push(`Contenedor (dato anterior): ${Number(quote.container_qty || 1)} × ${quote.container_type}`)
  }

  if (targetStructure !== 'loose' && cargoLines.length > 0) {
    const pieces = cargoLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
    const cbm = cargoLines.reduce((sum, line) => sum + Number(line.cbm || 0), 0)
    const lbs = cargoLines.reduce(
      (sum, line) => sum + Number(line.weight_lbs || 0) * Number(line.quantity || 0),
      0
    )
    summary.push(
      `Líneas de carga: ${cargoLines.length} (${formatCargoNumber(pieces, 0)} bultos, ${formatCargoNumber(cbm, 3)} CBM, ${formatCargoNumber(lbs, 0)} lbs)`
    )
  }

  // FCL/FTL muestran estos totales en el formulario; la carga suelta los recalcula
  // desde sus líneas, así que solo se pierden si la origen no tenía líneas.
  if (targetStructure !== 'containers' && cargoLines.length === 0) {
    const pesoKg = Number(quote.peso_kg || 0)
    const grossWeight = Number(quote.gross_weight || 0)
    const cbm = Number(quote.volumen_cbm || 0)
    const pieces = Number(quote.cantidad_bultos || 0)
    if (pesoKg > 0) summary.push(`Peso: ${formatCargoNumber(pesoKg, 2)} kg`)
    if (grossWeight > 0) summary.push(`Peso bruto: ${formatCargoNumber(grossWeight, 2)}`)
    if (cbm > 0) summary.push(`Volumen: ${formatCargoNumber(cbm, 3)} CBM`)
    if (pieces > 0) summary.push(`Bultos: ${formatCargoNumber(pieces, 0)}`)
    if (quote.package_type) summary.push(`Empaque: ${quote.package_type}`)
  }

  return summary
}
