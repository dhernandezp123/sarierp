import {
  type CargoDimensionLine,
  type CargoLineIssue,
  calculateLineCbm,
  calculateLineFt3,
  getLineTotalWeightKg,
  getLineTotalWeightLbs,
  isBlankCargoLine,
  validateCargoLines,
} from '@/src/lib/quotation-cargo'
import type { ContainerLine } from '@/src/lib/quotation-form'
import {
  type ProductTransportRule,
  getCargoStructure,
  getProductTransportRule,
  resolveProductQuoteType,
} from '@/src/lib/quotation-products'

// Huella de la carga editable: modalidad, contenedores y líneas tal como se cargaron.
export function getCargoSignature(
  quoteType: string,
  containers: ContainerLine[],
  cargoLines: CargoDimensionLine[]
) {
  return JSON.stringify({
    quoteType: quoteType || '',
    containers: containers.map((line) => [
      line.container_type_id,
      line.container_type_name,
      Number(line.quantity || 0),
      line.notes || null,
    ]),
    cargo: cargoLines.map((line) => [
      line.id,
      line.quantity,
      line.packageType,
      line.length,
      line.width,
      line.height,
      line.dimensionUnit,
      line.weight,
      line.weightUnit || 'lbs',
      line.volumeMode || 'dimensions',
      String(line.manualCbm ?? ''),
    ]),
  })
}

export type EditCargoPlan =
  | {
      ok: false
      field: string
      message: string
      issuesByLine: Record<string, CargoLineIssue[]>
    }
  | {
      ok: true
      /** Reemplaza contenedores y líneas y recalcula los totales de carga. */
      replace: boolean
      cargoLinesToSave: CargoDimensionLine[]
      /** Aviso al conservar una carga histórica incompleta sin bloquear el guardado. */
      warning: string | null
      issuesByLine: Record<string, CargoLineIssue[]>
    }

/**
 * Decide cómo guarda la edición la carga según la acción y lo modificado:
 * - Enviar a Pricing: carga completa, sin líneas parciales.
 * - Guardar Borrador: descarta filas vacías, admite falta de peso y bloquea filas
 *   capturadas sin cantidad o volumen.
 * - Guardar fuera de Borrador con la carga modificada: carga completa.
 * - Guardar fuera de Borrador sin tocar la carga: se conserva tal cual (líneas y
 *   totales) y solo se avisa si está incompleta.
 * - Modalidad vacía: se conserva si ya venía vacía; dejarla vacía con una
 *   modificación fuera de Borrador, o enviar sin ella, se bloquea.
 * - Producto incompatible con transporte/modalidad: se puede guardar el registro
 *   histórico, pero no enviar a Pricing hasta ajustarlo.
 * Miami conserva su validación por calculadora y siempre reemplaza sus líneas.
 */
export function planQuotationEditCargo({
  status,
  sendToPricing,
  isMiamiFlow,
  quoteType,
  cargoIntact,
  containerLines,
  cargoLines,
  productMismatch = false,
}: {
  status: string
  sendToPricing: boolean
  isMiamiFlow: boolean
  quoteType: string
  cargoIntact: boolean
  containerLines: ContainerLine[]
  cargoLines: CargoDimensionLine[]
  /** Transporte/modalidad no corresponden al producto (getProductRuleMismatch). */
  productMismatch?: boolean
}): EditCargoPlan {
  const ok = (replace: boolean, cargoLinesToSave: CargoDimensionLine[] = [], warning: string | null = null,
    issuesByLine: Record<string, CargoLineIssue[]> = {}): EditCargoPlan =>
    ({ ok: true, replace, cargoLinesToSave, warning, issuesByLine })
  const block = (field: string, message: string, issuesByLine: Record<string, CargoLineIssue[]> = {}): EditCargoPlan =>
    ({ ok: false, field, message, issuesByLine })

  if (sendToPricing && productMismatch) {
    return block('quote_type', 'Ajusta transporte y modalidad al producto antes de enviar a Pricing')
  }

  if (isMiamiFlow) {
    return cargoLines.length === 0
      ? block('cargo', 'Debes agregar al menos una línea de carga')
      : ok(true, cargoLines)
  }

  const structure = getCargoStructure(quoteType)
  if (structure === 'none') {
    // cargoIntact incluye la modalidad: si cambió, el vacío viene de una modificación.
    if (!quoteType && (sendToPricing || (!cargoIntact && status !== 'Borrador'))) {
      return block('quote_type', 'Selecciona la modalidad antes de guardar')
    }
    return ok(false)
  }

  const replace = sendToPricing || !cargoIntact
  const keepsHistoricalCargo = !replace && status !== 'Borrador'

  if (structure === 'containers') {
    if (containerLines.length > 0) return ok(replace)
    if (!replace) {
      return ok(false, [], keepsHistoricalCargo
        ? 'Se conservó la carga registrada: no tiene contenedores. Agrégalos antes de enviar a Pricing.'
        : null)
    }
    return block('containers', 'Agrega al menos un contenedor / unidad')
  }

  if (keepsHistoricalCargo) {
    const { issuesByLine, message } = validateCargoLines(cargoLines, 'pricing')
    return ok(false, [], message
      ? `Se conservó la carga registrada sin cambios. ${message} antes de enviar a Pricing.`
      : null, issuesByLine)
  }

  const mode = sendToPricing || status !== 'Borrador' ? 'pricing' : 'draft'
  const { issuesByLine, message } = validateCargoLines(cargoLines, mode)
  if (message) {
    const firstInvalidLine = cargoLines.find((line) => issuesByLine[line.id])
    return block(firstInvalidLine ? `cargo-line-${firstInvalidLine.id}` : 'cargo', message, issuesByLine)
  }

  const cargoLinesToSave = cargoLines.filter((line) => !isBlankCargoLine(line))
  if (!replace) return ok(false)
  // save_quotation_edit rechaza reemplazar la carga suelta por una lista vacía.
  if (cargoLinesToSave.length === 0) {
    return block('cargo', 'Agrega al menos una línea de carga con cantidad y volumen')
  }
  return ok(true, cargoLinesToSave)
}

export type EditCargoTotals = {
  peso_kg?: number | null
  peso_lbs?: number | null
  volumen_cbm?: number | null
  volumen_ft3?: number | null
  cantidad_bultos?: number | null
}

/**
 * Totales de carga para el payload de save_quotation_edit. Sin reemplazo se omiten
 * las claves y la RPC conserva los guardados (incluida la modalidad vacía histórica).
 * Al reemplazar: carga suelta recalcula desde las líneas; contenedores reenvían los
 * totales cargados del formulario, como antes.
 */
export function getEditCargoTotals({
  structure,
  replace,
  savedCargoLines,
  formTotals,
}: {
  structure: 'containers' | 'loose' | 'none'
  replace: boolean
  savedCargoLines: CargoDimensionLine[]
  formTotals: { peso_kg: string; volumen_cbm: string; cantidad_bultos: string }
}): EditCargoTotals {
  if (!replace) return {}
  if (structure === 'loose') {
    const total = (lineTotal: (line: CargoDimensionLine) => number) =>
      savedCargoLines.reduce((sum, line) => sum + lineTotal(line), 0)
    return {
      peso_kg: total(getLineTotalWeightKg) || null,
      peso_lbs: total(getLineTotalWeightLbs) || null,
      volumen_cbm: total(calculateLineCbm) || null,
      volumen_ft3: total(calculateLineFt3) || null,
      cantidad_bultos: total((line) => Number(line.quantity || 0)),
    }
  }
  return {
    peso_kg: Number(formTotals.peso_kg || 0),
    peso_lbs: null,
    volumen_cbm: Number(formTotals.volumen_cbm || 0),
    volumen_ft3: null,
    cantidad_bultos: Number(formTotals.cantidad_bultos || 0),
  }
}

export type ProductRuleMismatch = {
  rule: ProductTransportRule
  /** Transporte y modalidad al ajustar; modalidad vacía si el producto admite varias. */
  target: { tipo_transporte: string; quote_type: string }
}

// Al cambiar el producto, aplica la misma regla de transporte/modalidad que en
// creacion. Los productos personalizados conservan la seleccion libre actual.
export function getEditProductSelection(product: string, transport: string, quoteType: string) {
  if (product === 'miami_lcl') return { tipo_transporte: 'Marítima', quote_type: 'LCL' }
  if (product === 'miami_air') return { tipo_transporte: 'Aéreo', quote_type: 'Consolidado' }
  const rule = getProductTransportRule(product)
  return rule
    ? { tipo_transporte: rule.transport, quote_type: resolveProductQuoteType(rule, transport === rule.transport ? quoteType : '') }
    : { tipo_transporte: transport, quote_type: quoteType }
}

// Cotización guardada antes de que el producto definiera transporte y modalidad.
// No se corrige al abrir: el usuario la ajusta con una acción explícita.
export function getProductRuleMismatch(
  product: string,
  transport: string,
  quoteType: string
): ProductRuleMismatch | null {
  const rule = getProductTransportRule(product)
  if (!rule) return null
  if (transport === rule.transport && rule.modalities.includes(quoteType)) return null
  return {
    rule,
    target: {
      tipo_transporte: rule.transport,
      quote_type: resolveProductQuoteType(rule, transport === rule.transport ? quoteType : ''),
    },
  }
}
