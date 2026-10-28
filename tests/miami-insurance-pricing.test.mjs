import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'
import loadTs from './load-ts.mjs'

const catalogs = loadTs('src/lib/pricing-catalogs.ts')
const products = loadTs('src/lib/quotation-products.ts')
const quote = (id, product) => ({ id, quotation_number: id, service_product: product,
  quote_type: product === 'miami_lcl' ? 'LCL' : 'Consolidado', status: 'Pricing Aprobado',
  requires_insurance: true, commercial_value: 1000,
  clientes: { nombre: 'Cliente de prueba', asegura_carga: true, seguro_porcentaje: 1 } })
const freight = { id: 'freight', rate_code: 'miami_lcl_freight', description: 'Ocean Freight',
  item_type: 'freight', sale_amount: 500, cost_amount: 100, quantity: 1, taxable: false }

async function pricing({ quotes = [quote('lcl', 'miami_lcl'), quote('air', 'miami_air')], saved = {} } = {}) {
  const errors = [], writes = []
  const client = { from(table) {
    const filters = {}; let payload
    const query = new Proxy({}, { get(_target, key) {
      if (key === 'then') return (resolve, reject) => {
        if (payload && table === 'pricing_items') {
          const item = Array.isArray(payload) ? payload[0] : payload
          writes.push(item)
          saved[item.quotation_id] = [{ ...item, id: 'insurance' }]
        }
        const data = payload ? null : table === 'quotations' ? quotes : table === 'pricing_items'
          ? [freight, ...(saved[filters.quotation_id] || [])] : []
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      }
      return (...args) => {
        if (key === 'eq') filters[args[0]] = args[1]
        if (key === 'update' || key === 'insert') payload = args[0]
        return query
      }
    } })
    return query
  } }
  const page = mountPage('src/app/(protected)/pricing-comparison/page.tsx', {
    '../../../hooks/useUser': { useUser: () => ({ profile: { id: 'pricing', rol: 'Pricing' } }) },
    '../../../lib/supabase/client': { supabase: client },
    '@/src/lib/supabase/client': { supabase: client },
    '../../../components/pdf/quotation-pdf': { default: 'QuotationPDF' },
    '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: { default_tax_rate: 15 }, error: null }) },
    '@/src/lib/quotation-products': { ...products, fetchActiveServiceProducts: async () => products.serviceProducts },
    '@/src/lib/pricing-catalogs': { ...catalogs, fetchActiveClientRateCatalog: async () => [] },
    '@/src/components/ui/CotizacionCombobox': { CotizacionCombobox: 'CotizacionCombobox' },
    sonner: { toast: { error: message => errors.push(message), success() {} } },
  }, { unwrap: root => root.props.children.type })
  await page.ready()
  const select = async id => {
    page.find(node => node.type === 'CotizacionCombobox').props.onChange(id)
    page.render(); await page.tick(); page.render()
  }
  const checkbox = () => page.find(node => node.props?.name === 'insurance_taxable')
  const change = checked => { checkbox().props.onChange({ target: { checked } }); page.render() }
  return { page, select, checkbox, change, writes, errors }
}

test('Pricing Miami aplica ISV únicamente al marcarlo y no arrastra la elección entre cotizaciones', async () => {
  const f = await pricing()
  try {
    for (const [id, taxable] of [['lcl', true], ['air', false]]) {
      await f.select(id)
      assert.equal(f.checkbox().props.checked, false)
      if (taxable) f.change(true)
      f.page.button('Aplicar seguro de carga').props.onClick(); f.page.render()
      await f.page.button('Calcular y guardar seguro').props.onClick(); f.page.render()
      const saved = f.writes.at(-1)
      assert.equal(saved.taxable, taxable)
      assert.equal(saved.tax_rate, taxable ? 15 : 0)
      assert.equal(saved.tax_amount, taxable ? 11.25 : 0)
      assert.equal(saved.total_amount, taxable ? 86.25 : 75)
    }
    await f.select('lcl')
    assert.equal(f.checkbox().props.checked, true)
    await f.select('air')
    assert.equal(f.checkbox().props.checked, false)
    assert.deepEqual(f.errors, [])
  } finally { f.page.cleanup() }
})

test('Pricing conserva el impuesto explícito de seguros existentes al cargar, sin reescribirlos', async () => {
  const f = await pricing({ saved: {
    lcl: [{ ...freight, id: 'lcl-insurance', item_type: 'Seguro', cost_amount: 75, sale_amount: 75, total_amount: 75, taxable: false, tax_amount: 0 }],
    air: [{ ...freight, id: 'air-insurance', item_type: 'Seguro', cost_amount: 75, sale_amount: 75, total_amount: 86.25, taxable: true, tax_rate: 15, tax_amount: 11.25 }],
  } })
  try {
    await f.select('lcl'); assert.equal(f.checkbox().props.checked, false)
    await f.select('air'); assert.equal(f.checkbox().props.checked, true)
    await f.select('lcl'); assert.equal(f.checkbox().props.checked, false)
    assert.deepEqual(f.writes, [])
  } finally { f.page.cleanup() }
})
