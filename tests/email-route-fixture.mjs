import loadTs from './load-ts.mjs'

export async function exerciseRoute(kind, {
  demo = false,
  providerBody = '<html>Bad gateway</html>',
  providerStatus = 502,
  callerTenant = 'tenant-sari',
  resourceTenant = 'tenant-sari',
  environmentResult,
  environmentThrows = false,
  appEnv = demo ? 'demo' : 'test',
  publicAppEnv = 'test',
  outbound = 'true',
  callerRole = 'Admin',
  callerStatus = 'Aprobado',
  callerActive = true,
  authenticated = true,
  outboundMissing = false,
  routeEntry,
  existingDelivery,
  provider,
  lookupError = false,
  claimError,
  loseClaim = false,
  finalError = false,
  finalNoRow = false,
  finalThrows = false,
  beforeFinish,
  afterClaim,
  requests = 1,
  betweenRequests,
  rowOverrides = {},
} = {}) {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock',
    SUPABASE_SERVICE_ROLE_KEY: 'mock', RESEND_API_KEY: 'mock', OUTBOUND_EMAIL_ENABLED: outboundMissing ? undefined : outbound,
    APP_ENV: appEnv, NEXT_PUBLIC_APP_ENV: publicAppEnv,
  }
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  const originalFetch = globalThis.fetch
  const updates = [], inserts = [], reads = [], providerCalls = []
  let deliveryState = existingDelivery ? structuredClone(existingDelivery) : null
  globalThis.fetch = async (_url, options) => {
    providerCalls.push(options)
    if (provider) return provider(options, providerCalls.length)
    return new Response(providerBody, { status: providerStatus })
  }
  const profile = { id: 'user', tenant_id: callerTenant, rol: callerRole, status: callerStatus, is_active: callerActive, is_platform_admin: false, nombre: 'Test', apellido: '', email: 'test@example.invalid' }
  const rows = {
    profiles: profile,
    platform_environment: { environment: demo ? 'demo' : 'production' },
    tenant_domains: { tenant_id: resourceTenant, hostname: 'sari.forwarders.app', is_primary: true, is_active: true },
    company_settings: { tenant_id: resourceTenant, trade_name: 'Sari Express', legal_name: 'Sari Express', email: 'contacto@sari.invalid' },
    support_tickets: { id: 'ticket', tenant_id: resourceTenant, ticket_number: 'TEST-1', subject: 'Local', category: 'Bug', priority: 'Media', status: 'Abierto', created_by: 'user', creator: profile },
    support_settings: { enabled: true, support_email: 'support@example.invalid' },
    miami_packages: { id: 'package', tenant_id: resourceTenant, tracking_number: 'LOCAL', status: 'Asignado', cliente_id: 'client', warehouse_number: 'WH-1', received_at: '2026-09-07T18:00:00Z', clientes: { nombre: 'Test', contacto: 'Test', email_1: 'client@example.invalid' } },
    ...rowOverrides,
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null }, error: authenticated ? null : { message: 'invalid token' } }) },
    from(table) {
      let insertion, mutation
      const conditions = []
      const result = () => {
        reads.push(table)
        if (table === 'platform_environment') {
          if (environmentThrows) throw new Error('fixture connection failed')
          if (environmentResult !== undefined) return environmentResult
        }
        const deliveryTable = ['client_email_deliveries', 'support_notification_outbox'].includes(table)
        if (deliveryTable) {
          if (!mutation && !insertion && lookupError) return { data: null, error: { message: 'read failed' } }
          if (insertion) {
            inserts.push({ table, ...insertion })
            if (claimError) return { data: null, error: claimError }
            if (deliveryState) return { data: null, error: { code: '23505' } }
            deliveryState = { id: 'delivery', ...insertion }
            if (afterClaim) afterClaim(deliveryState)
          } else if (mutation) {
            updates.push({ table, ...mutation, conditions: [...conditions] })
            const finishing = conditions.some(([field]) => field === 'lease_token')
            if (finishing && beforeFinish) beforeFinish(deliveryState)
            if (finishing && finalThrows) throw new Error('final update connection failed')
            if (finishing && finalError) return { data: null, error: { message: 'final audit failed' } }
            if (finishing && finalNoRow) return { data: null, error: null }
            if (!finishing && claimError) return { data: null, error: claimError }
            const matches = deliveryState && conditions.every(([field, value]) => deliveryState[field] === undefined || deliveryState[field] === value)
            if (!matches || (!finishing && loseClaim)) return { data: null, error: null }
            deliveryState = { ...deliveryState, ...mutation }
            if (!finishing && mutation.status === 'processing' && afterClaim) afterClaim(deliveryState)
          }
          return { data: deliveryState ? structuredClone(deliveryState) : null, error: null }
        }
        const row = rows[table] ?? null
        const matches = !row || conditions.every(([column, value]) => row[column] === undefined || row[column] === value)
        return { data: matches ? row : null, error: null }
      }
      const query = {
        select() { return query }, eq(column, value) { conditions.push([column, value]); return query },
        insert(value) { insertion = value; return query },
        update(value) { mutation = value; return query },
        single: async () => result(), maybeSingle: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      }
      return query
    },
  }
  try {
    const route = routeEntry || (kind === 'miami' ? 'src/app/api/miami/package-assignment-email/route.ts' : 'src/app/api/support/notify/route.ts')
    const { POST } = loadTs(route, { 'server-only': {}, '@supabase/supabase-js': { createClient: () => client } })
    const responses = []
    for (let i = 0; i < requests; i++) {
      if (i && betweenRequests) betweenRequests(deliveryState, rows)
      const response = await POST(new Request('http://localhost/api/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock' },
      body: JSON.stringify(kind === 'miami' ? { packageId: 'package' } : { ticketId: 'ticket', eventType: 'ticket_created' }),
      }))
      responses.push({ response, body: await response.json() })
    }
    return { ...responses.at(-1), responses, updates, inserts, reads, providerCalls, deliveryState }
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
