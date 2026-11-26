import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'
import loadTs from './load-ts.mjs'

const products = loadTs('src/lib/quotation-products.ts')

// Cliente creado desde la nueva cotización: se selecciona sin salir y carga su contacto.
async function mountNewQuotation(rol) {
  const previous = globalThis.window
  globalThis.window = { location: { search: '' }, open() {} }
  const existing = { id: 'client', nombre: 'Cliente existente', contacto: 'Ana', email_1: 'ana@cliente.test' }
  const created = { id: 'new-client', codigo_cliente: 'CLI-0900', nombre: 'Importadora Nueva', contacto: 'Luis Pérez', email_1: 'luis@nueva.test', telefono: '+504 9999-0000', pais: 'Honduras' }
  const client = {
    from(table) {
      let single = false
      const q = new Proxy({}, {
        get(_target, key) {
          if (key === 'then') {
            const data = table === 'clientes' ? (single ? created : [existing]) : []
            return (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject)
          }
          if (key === 'maybeSingle' || key === 'single') return () => { single = true; return q }
          return () => q
        },
      })
      return q
    },
  }
  const page = mountPage('src/app/(protected)/quotations/new/page.tsx', {
    '../../../../hooks/useUser': { useUser: () => ({ profile: { id: 'seller', rol } }) },
    '../../../../lib/supabase/client': { supabase: client },
    '@/src/lib/activity-logger': { createActivityLog: async () => ({ ok: true }) },
    '@/src/lib/notifications': { createNotification: async () => ({ ok: true }) },
    '../../../../components/pdf/quotation-pdf': { default: 'QuotationPDF' },
    '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: {}, error: null }) },
    '@/src/lib/quotation-products': { ...products, fetchActiveServiceProducts: async () => products.serviceProducts },
    '@/src/lib/quotation-create': { createQuotation: async () => ({ id: 'q', quotation_number: 'TEST' }) },
    '@/src/components/quotations/MiamiQuotationSection': { MiamiQuotationSection: 'MiamiQuotationSection' },
    '@/src/components/ui/ClienteCombobox': { ClienteCombobox: 'ClienteCombobox' },
    '@/src/components/clientes/NewClientDialog': { __esModule: true, default: 'NewClientDialog' },
    '@/src/components/ui/UnsavedChangesGuard': { UnsavedChangesGuard: 'Guard', markFormSaved() {} },
    '@/src/hooks/useMiamiQuotation': { useMiamiQuotation: () => ({ miamiRateDestination: '', isMiamiFlow: false, lclEstimated: 0, airEstimated: 0, canUseMiamiCalculator: false, buildMiamiPricingItems: () => [], buildMiamiPreviewItems: () => [] }) },
    '@react-pdf/renderer': { pdf: () => ({ toBlob: async () => new Blob(['demo']) }) },
    sonner: { toast: { error() {}, success() {}, info() {} } },
  }, { expand: (type) => typeof type === 'function' })
  await page.ready()
  return { page, cleanup: () => { page.cleanup(); globalThis.window = previous } }
}

test('crear cliente desde la cotización lo selecciona y carga su contacto sin salir', async () => {
  const { page, cleanup } = await mountNewQuotation('Ventas')
  try {
    const combo = () => page.find((node) => node.type === 'ClienteCombobox')
    const dialog = () => page.find((node) => node.type === 'NewClientDialog')
    assert.equal(typeof combo().props.onCreateRequest, 'function', 'Ventas puede crear clientes')
    assert.equal(dialog().props.open, false)

    combo().props.onCreateRequest('Importadora Nueva')
    page.render()
    assert.equal(dialog().props.open, true)
    assert.equal(dialog().props.initialName, 'Importadora Nueva')

    await dialog().props.onCreated({ id: 'new-client', codigo_cliente: 'CLI-0900', nombre: 'Importadora Nueva' })
    page.render()
    assert.equal(combo().props.value, 'new-client', 'el cliente creado queda seleccionado')
    assert.ok(combo().props.clientes.some((cliente) => cliente.id === 'new-client'), 'se agrega a la lista')
    const contactName = page.find((node) => node.props?.name === 'contact_name')
    assert.equal(contactName?.props.value, 'Luis Pérez', 'se carga el contacto del cliente creado')
  } finally {
    cleanup()
  }
})

test('Contabilidad no ve la opción de crear cliente en la cotización', async () => {
  const { page, cleanup } = await mountNewQuotation('Contabilidad')
  try {
    assert.equal(page.find((node) => node.type === 'ClienteCombobox').props.onCreateRequest, undefined)
  } finally {
    cleanup()
  }
})
