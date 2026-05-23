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

  Ganada: [],

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
