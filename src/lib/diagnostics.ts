type DiagnosticEvent = 'activity_log_failed' | 'miami_email_failed' | 'support_email_failed'
type DiagnosticContext = { reference?: string; tenantId?: string | null; entityId?: string | null; code?: string | null }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only identifiers and a machine code; never serialize exceptions or payloads. */
export function reportDiagnostic(event: DiagnosticEvent, context: DiagnosticContext = {}) {
  const reference = context.reference && uuidPattern.test(context.reference)
    ? context.reference : crypto.randomUUID()
  console.error(JSON.stringify({
    event, reference, timestamp: new Date().toISOString(),
    tenant_id: context.tenantId && uuidPattern.test(context.tenantId) ? context.tenantId : null,
    entity_id: context.entityId && uuidPattern.test(context.entityId) ? context.entityId : null,
    code: context.code && /^[A-Z0-9_]{2,32}$/.test(context.code) ? context.code : 'UNEXPECTED',
    result: 'failed',
  }))
  return reference
}
