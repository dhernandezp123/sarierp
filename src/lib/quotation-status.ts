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
  next: string
) {
  const transitions = allowedTransitions[
    current as keyof typeof allowedTransitions
  ] as readonly string[] | undefined

  return transitions?.includes(next) ?? false
}

export function canTransitionForRole(current: string, next: string, role?: string | null) {
  if (!canTransition(current, next)) return false
  if (next === 'Pricing Aprobado') return ['Admin', 'Pricing'].includes(role || '')
  if (next === 'Ganada' || next === 'Perdida') return ['Admin', 'Ventas'].includes(role || '')
  return ['Admin', 'Pricing', 'Ventas'].includes(role || '')
}

export function isWonRepricing(status: string, returnStatus?: string | null) {
  return ['Pendiente de Fijar Precios', 'Pricing Aprobado'].includes(status) && returnStatus === 'Ganada'
}
