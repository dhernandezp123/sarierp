import { mountPage } from './page-harness.mjs'

export const activeIdentity = (id = 'operator', tenant = 'tenant-A', rol = 'Operaciones') => ({
  user: { id }, profile: { id, tenant_id: tenant, rol, status: 'Aprobado', is_active: true, is_platform_admin: false }, loading: false,
})
export function miamiFixture() {
  let identity = activeIdentity(), handler
  const calls = []
  const client = { from(table) {
    const call = { table, filters: [], comparisons: [], head: false }
    const q = {
      select(_fields, options) { call.head = options?.head === true; return q },
      eq(field, value) { call.filters.push([field, value]); return q },
      gte(field, value) { call.filters.push([field, value]); call.comparisons.push(['gte', field, value]); return q },
      lt(field, value) { call.filters.push([field, value]); call.comparisons.push(['lt', field, value]); return q },
      order() { return q }, limit() { return q },
      then(resolve, reject) { const index = calls.length % 6; calls.push(call); return Promise.resolve(handler?.(index, call) ?? { data: [], count: 0, error: null }).then(resolve, reject) },
    }
    return q
  } }
  const mocks = { '@/src/hooks/useUser': { useUser: () => identity }, '@/src/lib/supabase/client': { supabase: client } }
  return { client, calls, mocks, identity: value => { identity = value }, respond: fn => { handler = fn } }
}

export function topbarFixture() {
  const previous = { document: globalThis.document, localStorage: globalThis.localStorage }
  const storage = new Map(), calls = []
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value) } }
  let identity = activeIdentity(), path = '/miami', reader = async () => []
  const mocks = {
    '@/src/hooks/useUser': { useUser: () => identity },
    'next/navigation': { usePathname: () => path },
    'next-themes': { useTheme: () => ({ theme: 'light', setTheme() {} }) },
    '@/src/lib/supabase/client': { supabase: {} },
    '@/src/lib/alerts': { getSystemAlerts: (...args) => { calls.push(args); return reader(...args) } },
    ...Object.fromEntries([
      '@/src/components/agents/NewAgentDialog', '@/src/components/clientes/NewClientDialog',
      '@/src/components/clientes/ClientProfileDialog', '@/src/components/email/EmailTemplatesDialog',
      '@/src/components/quotations/ReferenceInsuranceCalculatorDialog',
    ].map(name => [name, { default: 'dialog' }])),
  }
  return {
    mocks, calls, storage, identity: value => { identity = value }, path: value => { path = value }, read: fn => { reader = fn },
    mount: () => mountPage('src/components/layout/topbar.tsx', mocks),
    cleanup: () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value } },
  }
}
