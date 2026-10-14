type Operation = 'demo_submit' | 'quotation_create' | 'manual_invoice_pdf'
type Measurement = {
  name: Operation | 'demo_form'
  stage: 'started' | 'succeeded' | 'failed'
  duration_ms?: number
}

/** Local event only. No storage, provider, IDs, URL, field values or error bodies. */
export function emitMeasurement(measurement: Measurement) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  if (!['demo_submit', 'quotation_create', 'manual_invoice_pdf', 'demo_form'].includes(measurement.name)
    || !['started', 'succeeded', 'failed'].includes(measurement.stage)) return
  const detail: Measurement = { name: measurement.name, stage: measurement.stage }
  if (typeof measurement.duration_ms === 'number' && Number.isFinite(measurement.duration_ms)) {
    detail.duration_ms = Math.max(0, Math.round(measurement.duration_ms))
  }
  try { window.dispatchEvent(new CustomEvent('sari:measurement', { detail })) } catch { /* Auxiliary only. */ }
}

export async function measureOperation<T>(name: Operation, action: () => Promise<T>): Promise<T> {
  const started = performance.now()
  emitMeasurement({ name, stage: 'started' })
  try {
    const result = await action()
    emitMeasurement({ name, stage: 'succeeded', duration_ms: Math.max(0, Math.round(performance.now() - started)) })
    return result
  } catch (error) {
    emitMeasurement({ name, stage: 'failed', duration_ms: Math.max(0, Math.round(performance.now() - started)) })
    throw error
  }
}
