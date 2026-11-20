export const HR_DOCUMENT_BUCKET = 'hr-signed-documents'
export const HR_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const isHrUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export function hrSameOrigin(origin: string | null, host: string | null) {
  if (!origin || !host) return false
  try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && url.host.toLowerCase() === host.toLowerCase() } catch { return false }
}
export type HrCertificate = {
  id: string; employee_id: string; request_id: string | null; kind: 'Concesión' | 'Acumulación' | 'Suspensión'; certificate_number: string; created_at: string
  snapshot: { company: { legal_name: string; trade_name: string; rtn: string | null; address: string | null }; employee: { employee_code: string; name: string; national_id: string; hire_date: string; department: string; job_title: string; work_schedule: string }; act: Record<string, string | number | boolean | string[] | null> }
}
export type HrSignedDocument = { id: string; certificate_id: string; version: number; file_name: string; mime_type: string; size_bytes: number; signed_on: string; sha256: string; created_at: string }

/** Inspect bytes on the server instead of trusting the multipart MIME label or extension. */
export function hrDocumentMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf'
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  return null
}
