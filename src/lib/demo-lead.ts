export type DemoLead = { nombre: string; empresa: string; email: string; telefono: string }
export type LeadField = keyof DemoLead

export function validateDemoLead(payload: unknown) {
  const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const lead: DemoLead = {
    nombre: typeof data.nombre === 'string' ? data.nombre.trim() : '',
    empresa: typeof data.empresa === 'string' ? data.empresa.trim() : '',
    email: typeof data.email === 'string' ? data.email.trim() : '',
    telefono: typeof data.telefono === 'string' ? data.telefono.trim() : '',
  }
  const errors: Partial<Record<LeadField, string>> = {}
  if (!lead.nombre || lead.nombre.length > 120) errors.nombre = 'Ingresa tu nombre (máximo 120 caracteres).'
  if (!lead.empresa || lead.empresa.length > 160) errors.empresa = 'Ingresa tu empresa (máximo 160 caracteres).'
  if (lead.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    errors.email = 'Ingresa un correo válido.'
  }
  if (lead.telefono.length > 40 || (data.telefono !== undefined && typeof data.telefono !== 'string')) {
    errors.telefono = 'Ingresa un teléfono de hasta 40 caracteres.'
  }
  return { lead, errors, valid: Object.keys(errors).length === 0 }
}
