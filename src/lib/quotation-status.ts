export const allowedTransitions = {
  Borrador: [
    'Pendiente de Fijar Precios',
  ],

  'Pendiente de Fijar Precios': [
    'Pricing Aprobado',
    'Perdida',
  ],

  'Pricing Aprobado': [
    'Enviada al Cliente',
    'Pendiente de Fijar Precios',
  ],

  'Enviada al Cliente': [
    'Ganada',
    'Perdida',
    'Pendiente de Fijar Precios',
  ],

  Ganada: [
    'Pendiente de Fijar Precios',
  ],

  Perdida: [],
} as const

export function canTransition(
  current: string,
  next: string,
  product?: string | null
) {
  if (product === 'customs_only' && current === 'Borrador') return next === 'Pricing Aprobado'
  const transitions = allowedTransitions[
    current as keyof typeof allowedTransitions
  ] as readonly string[] | undefined

  return transitions?.includes(next) ?? false
}

export function canTransitionForRole(current: string, next: string, role?: string | null, product?: string | null) {
  if (!canTransition(current, next, product)) return false
  if (product === 'customs_only' && next === 'Pricing Aprobado') return ['Admin', 'Ventas', 'Pricing'].includes(role || '')
  if (next === 'Pricing Aprobado') return ['Admin', 'Pricing'].includes(role || '')
  if (next === 'Ganada' || next === 'Perdida') return ['Admin', 'Ventas'].includes(role || '')
  return ['Admin', 'Pricing', 'Ventas'].includes(role || '')
}

export function isWonRepricing(status: string, returnStatus?: string | null) {
  return ['Pendiente de Fijar Precios', 'Pricing Aprobado'].includes(status) && returnStatus === 'Ganada'
}
