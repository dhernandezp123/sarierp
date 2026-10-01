/** Display transport separately from assignment and incident state. */
export function portalPackageStatus(pkg: { status: string; cargo_status?: string | null }) {
  if (pkg.status === 'Entregado') return 'Entregado'
  return pkg.cargo_status || (pkg.status === 'Asignado' ? 'Asignado a envío' : pkg.status)
}

export function portalTrackingFilter(value: string) {
  const literal = value.trim().replace(/\\/g, '\\\\').replace(/[%_]/g, char => '\\' + char)
  // Quote for PostgREST after escaping SQL LIKE characters; both parsers consume escapes.
  const pattern = JSON.stringify(`%${literal}%`)
  return ['tracking_number', 'warehouse_number'].map(field => `${field}.ilike.${pattern}`).join(',')
}

export function portalDeadline(value: string | null, zone?: string | null) {
  if (!value) return 'Por confirmar'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Fecha por confirmar'
  try {
    return new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone || 'America/Tegucigalpa' }).format(date) + ` · ${zone || 'America/Tegucigalpa'}`
  } catch {
    return new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(date) + ' · UTC (zona por confirmar)'
  }
}

export function convertPortalDimension(value: string, from: 'in' | 'cm', to: 'in' | 'cm') {
  if (!value.trim() || from === to) return value
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return value
  return String(Number((to === 'cm' ? number * 2.54 : number / 2.54).toFixed(8)))
}

export function positivePortalNumber(value: string) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}
