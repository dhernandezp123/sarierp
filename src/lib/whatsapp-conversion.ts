import { canAccessPath } from './permissions'

/**
 * Conversión de una solicitud de WhatsApp en cotización (WA-04).
 * Lógica pura: la usan la bandeja, el formulario de cotización y las pruebas.
 */

export type WhatsappQuoteRequestForConversion = {
  id: string
  solicitado_por_id: string
  codigo: string
  cliente: string
  modalidad: string
  origen: string
  destino: string
  mercancia: string
  peso: string | null
  volumen: string | null
  bultos: string | null
  incoterm: string | null
  notas: string | null
}

export type ModalityMapping = { service_product: string; tipo_transporte: string; quote_type: string }

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Modalidad escrita en WhatsApp -> producto, transporte y modalidad del sistema.
 * Sin coincidencia clara devuelve null: Pricing la elige en el formulario.
 */
export function mapWhatsappModality(value: string | null | undefined): ModalityMapping | null {
  const words = new Set(normalize(value).split(' ').filter(Boolean))
  const has = (...options: string[]) => options.some(option => words.has(option))
  const matches = [
    has('fcl', 'contenedor', 'contenedores') && { service_product: 'other_origin_fcl', tipo_transporte: 'Marítima', quote_type: 'FCL' },
    // "lcl" explícito siempre cuenta; "consolidado" solo si no es aéreo ("aéreo consolidado").
    (has('lcl') || (has('consolidada', 'consolidado') && !has('aereo', 'aerea', 'air', 'aire'))) && { service_product: 'other_origin_lcl', tipo_transporte: 'Marítima', quote_type: 'LCL' },
    has('aereo', 'aerea', 'air', 'aire') && !has('courier') && { service_product: 'other_origin_air', tipo_transporte: 'Aéreo', quote_type: 'Consolidado' },
    has('courier', 'paqueteria', 'express') && { service_product: 'courier', tipo_transporte: 'Aéreo', quote_type: 'Courier' },
    has('ftl') && { service_product: 'usa_ltl_ftl', tipo_transporte: 'Terrestre', quote_type: 'FTL' },
    has('ltl') && { service_product: 'usa_ltl_ftl', tipo_transporte: 'Terrestre', quote_type: 'LTL' },
    has('terrestre', 'camion', 'truck') && !has('ftl', 'ltl') && { service_product: 'usa_ltl_ftl', tipo_transporte: 'Terrestre', quote_type: '' },
  ].filter(Boolean) as ModalityMapping[]
  // Ambiguo (p. ej. "LCL o aéreo"): mejor vacío que adivinar.
  return matches.length === 1 ? matches[0] : null
}

/**
 * Número de un campo libre solo si es inequívoco y está en la unidad esperada.
 * "1200 kg" -> 1200, "4.5 cbm" -> 4.5, "3 pallets" -> 3. "1.2 toneladas" o "2 x 40" -> null.
 */
export function parseWhatsappQuantity(value: string | null | undefined, unit: 'kg' | 'cbm' | 'count'): number | null {
  const text = String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').trim()
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2') // 1,200 -> 1200
    .replace(/(\d),(\d)/g, '$1.$2') // 4,5 -> 4.5
  const match = /^(\d+(?:\.\d+)?)\s*([a-z0-9 ]*)$/.exec(text)
  if (!match) return null
  const amount = Number(match[1])
  const suffix = match[2].replace(/\s+/g, ' ').trim()
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (unit === 'kg' && !['', 'kg', 'kgs', 'kilo', 'kilos', 'kilogramos'].includes(suffix)) return null
  if (unit === 'cbm' && !['', 'cbm', 'm3', 'metros cubicos', 'mts3'].includes(suffix)) return null
  if (unit === 'count' && (!Number.isInteger(amount) || /\d/.test(suffix))) return null
  return amount
}

function bigrams(text: string) {
  const compact = ` ${text} `
  const grams = new Map<string, number>()
  for (let i = 0; i < compact.length - 1; i++) {
    const gram = compact.slice(i, i + 2)
    grams.set(gram, (grams.get(gram) || 0) + 1)
  }
  return grams
}

const NAME_NOISE = new Set(['s', 'a', 'de', 'r', 'l', 'sa', 'cv', 'srl', 'inc', 'llc', 'corp', 'cia', 'ltda', 'la', 'el', 'y'])

function significant(name: string) {
  return normalize(name).split(' ').filter(word => word && !NAME_NOISE.has(word)).join(' ')
}

/** Similitud 0..1 entre nombres de cliente (Dice sobre bigramas, sin sufijos societarios). */
export function clientNameSimilarity(a: string, b: string) {
  const left = significant(a), right = significant(b)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.9
  const x = bigrams(left), y = bigrams(right)
  let overlap = 0, total = 0
  for (const [gram, count] of x) { overlap += Math.min(count, y.get(gram) || 0); total += count }
  for (const count of y.values()) total += count
  return total ? (2 * overlap) / total : 0
}

/** Clientes cuyo nombre se parece al escrito en WhatsApp, del más parecido al menos. */
export function suggestClients<T extends { id: string; nombre?: string | null }>(clients: T[], name: string, limit = 5, threshold = 0.45) {
  return clients
    .map(client => ({ client, score: clientNameSimilarity(name, client.nombre || '') }))
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score || String(a.client.nombre).localeCompare(String(b.client.nombre), 'es'))
    .slice(0, limit)
}

/** Valores del formulario de cotización a partir de la solicitud. */
export function buildWhatsappPrefill(request: WhatsappQuoteRequestForConversion, sellerName: string) {
  const modality = mapWhatsappModality(request.modalidad)
  const peso = parseWhatsappQuantity(request.peso, 'kg')
  const volumen = parseWhatsappQuantity(request.volumen, 'cbm')
  const bultos = parseWhatsappQuantity(request.bultos, 'count')
  const notes = [
    `Solicitud WhatsApp ${request.codigo} de ${sellerName}.`,
    `Cliente indicado: ${request.cliente}. Modalidad indicada: ${request.modalidad}.`,
    request.peso && `Peso indicado: ${request.peso}.`,
    request.volumen && `Volumen indicado: ${request.volumen}.`,
    request.bultos && `Bultos indicados: ${request.bultos}.`,
    request.notas && `Notas: ${request.notas}`,
  ].filter(Boolean).join('\n')
  return {
    modality,
    fields: {
      service_product: modality?.service_product ?? '',
      tipo_transporte: modality?.tipo_transporte ?? '',
      quote_type: modality?.quote_type ?? '',
      origen: request.origen,
      destino: request.destino,
      commodity: request.mercancia,
      incoterm: (request.incoterm || '').trim().toUpperCase(),
      peso_kg: peso === null ? '' : String(peso),
      volumen_cbm: volumen === null ? '' : String(volumen),
      cantidad_bultos: bultos === null ? '' : String(bultos),
      pricing_notes: notes,
    },
  }
}

/** Parámetros de /quotations/new para convertir una solicitud. */
export function whatsappConversionHref(requestId: string, client: { id: string } | 'new') {
  const params = new URLSearchParams({ fromWhatsapp: requestId })
  if (client === 'new') params.set('nuevoCliente', '1')
  else params.set('cliente', client.id)
  return `/quotations/new?${params.toString()}`
}

/** Dónde abrir una cotización según el rol: Pricing la trabaja en el comparativo de tarifas. */
export function quotationHrefForRole(role: string | null | undefined, quotationId: string) {
  if (canAccessPath(role, `/quotations/${quotationId}`)) return `/quotations/${quotationId}`
  if (canAccessPath(role, '/pricing-comparison')) return `/pricing-comparison?quotation=${encodeURIComponent(quotationId)}`
  return '/historico'
}
