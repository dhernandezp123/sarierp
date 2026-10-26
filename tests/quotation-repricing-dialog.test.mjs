import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

const tags = names => Object.fromEntries(names.map(name => [name, name]))
const dialogs = tags(['Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle'])
const entry = 'src/components/quotations/QuotationRepricingDialog.tsx'
const impact = { hasShippingInstruction: false, bookingsCount: 0, loading: false }
const button = (app, label) => app.find(node => node.type === 'button' && app.text(node).trim() === label)
const textarea = app => app.find(node => node.type === 'textarea')
const mountDialog = props => mountPage(entry, {
  '@/src/components/ui/dialog': dialogs,
}, { exported: 'QuotationRepricingDialog', props })

test('escribir mantiene el borrador en el modal y confirma el último texto completo', async () => {
  const reasons = [], props = { busy: false, impact, onCancel() {}, onConfirm: reason => reasons.push(reason) }
  const app = mountDialog(props)
  try {
    app.render()
    const text = '  Actualización de tarifa\nCambio de naviera.  '
    for (let n = 1; n <= text.length; n++) {
      textarea(app).props.onChange({ target: { value: text.slice(0, n) } }); app.render()
    }
    assert.deepEqual(reasons, [])
    assert.equal(textarea(app).props.value, text)
    props.impact = { ...impact, hasShippingInstruction: true, bookingsCount: 2 }; app.render()
    assert.equal(textarea(app).props.value, text)
    await button(app, 'Confirmar reapertura').props.onClick()
    assert.deepEqual(reasons, [text])
  } finally { app.cleanup() }
})

test('conserva el texto tras un fallo y lo limpia cuando se abre una nueva instancia', async () => {
  const props = { busy: false, impact, onCancel() {}, onConfirm: async () => false }
  const app = mountDialog(props)
  try {
    app.render(); textarea(app).props.onChange({ target: { value: 'Motivo que debe conservarse' } }); app.render()
    props.busy = true; app.render()
    assert.equal(textarea(app).props.disabled, true)
    props.busy = false; app.render()
    await button(app, 'Confirmar reapertura').props.onClick(); app.render()
    assert.equal(textarea(app).props.value, 'Motivo que debe conservarse')
  } finally { app.cleanup() }
  const fresh = mountDialog(props)
  try { fresh.render(); assert.equal(textarea(fresh).props.value, '') } finally { fresh.cleanup() }
})

test('el modal bloquea cierre y edición durante la reapertura y respeta la revisión de impacto', () => {
  let cancelled = 0
  const props = { busy: false, impact: { ...impact, loading: true }, onCancel: () => { cancelled++ }, onConfirm() {} }
  const app = mountDialog(props)
  try {
    app.render(); assert.equal(button(app, 'Confirmar reapertura').props.disabled, true)
    assert.match(app.text(), /Revisando impacto operativo/)
    props.busy = true; app.render()
    app.find(node => node.type === 'Dialog').props.onOpenChange(false)
    assert.equal(cancelled, 0)
    assert.equal(button(app, 'Cancelar').props.disabled, true)
    assert.equal(app.find(node => node.type === 'DialogContent').props.showCloseButton, false)
    props.busy = false; props.impact = impact; app.render()
    app.find(node => node.type === 'Dialog').props.onOpenChange(false)
    assert.equal(cancelled, 1)
  } finally { app.cleanup() }
})

async function quotationFixture() {
  const previousDocument = globalThis.document
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
  const quote = { id: 'quote', quotation_number: 'TEST-REPRICING', status: 'Ganada', service_product: 'other_origin_fcl',
    quote_type: 'FCL', tipo_transporte: 'Marítimo', cliente: { nombre: 'Cliente ficticio' } }
  const transitions = [], errors = []
  let fail = false
  const client = { from(table) {
    let single = false
    const q = new Proxy({}, { get(_target, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve({ data: single ? quote : [], error: null }).then(resolve, reject)
      return () => { if (['single', 'maybeSingle'].includes(key)) single = true; return q }
    } })
    assert.ok(['quotations','agent_quotes','pricing_items','cost_validations','quotation_options','quotation_containers',
      'quotation_cargo_lines','activity_logs','quotation_status_history','quotation_change_logs','shipping_instructions'].includes(table))
    return q
  } }
  const app = mountPage('src/app/(protected)/quotations/[id]/page.tsx', {
    '../../../../hooks/useUser': { useUser: () => ({ profile: { id: 'pricing', rol: 'Pricing' } }) },
    '../../../../lib/supabase/client': { supabase: client },
    '@/src/lib/supabase/client': { supabase: client },
    './supabase/client': { supabase: client },
    '@/src/lib/notifications': { createNotification: async () => {} },
    'next/navigation': { useParams: () => ({ id: 'quote' }), useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {} }) },
    '../../../../components/pdf/quotation-pdf': { default: 'QuotationPDF' },
    '../../../../components/pdf/cost-detail-pdf': { default: 'CostDetailPDF' },
    '../../../../components/ui/dialog': dialogs,
    '@/src/components/ui/dialog': dialogs,
    '../../../../components/ui/tabs': tags(['Tabs','TabsContent','TabsList','TabsTrigger']),
    '../../../../components/ui/card': tags(['Card','CardContent','CardHeader','CardTitle']),
    '../../../../components/ui/badge': { Badge: 'Badge' },
    '@/src/components/tasks/CreateContextTaskDialog': { CreateContextTaskDialog: 'CreateContextTaskDialog' },
    '@/src/components/quotations/InsuranceCalculationDialog': { InsuranceCalculationDialog: 'InsuranceCalculationDialog' },
    '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: null, error: null }) },
    '@/src/lib/quotation-transition': {
      quotationRevision: () => 1,
      transitionQuotation: async (...args) => {
        transitions.push(args)
        if (fail) throw Error('Error simulado de reapertura')
        return { ...quote, status: args[2] }
      },
    },
    sonner: { toast: { error: message => errors.push(message), success() {}, info() {} } },
  }, { unwrap: element => element.type })
  await app.ready()
  app.find(node => node.type === 'button' && node.props.title === 'Más acciones').props.onClick(); app.render()
  button(app, 'Reabrir para Repricing').props.onClick(); await app.tick(); app.render()
  const dialog = () => app.find(node => node.props?.impact && node.props?.onConfirm)
  return { app, client, transitions, errors, dialog, fail: value => { fail = value }, cleanup() {
    app.cleanup(); if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument
  } }
}

test('detalle real valida el motivo y conserva la transición atómica con su auditoría', async () => {
  const f = await quotationFixture()
  try {
    await f.dialog().props.onConfirm('   '); f.app.render()
    assert.equal(f.transitions.length, 0)
    assert.match(f.errors[0], /Debes ingresar el motivo/)
    f.fail(true)
    await f.dialog().props.onConfirm('  Actualización de tarifa\nCambio de naviera.  '); f.app.render()
    assert.ok(f.dialog(), 'La reapertura fallida no desmonta el borrador')
    assert.equal(f.transitions[0][2], 'Pendiente de Fijar Precios')
    assert.deepEqual(f.transitions[0][3], { reason: 'Actualización de tarifa\nCambio de naviera.' })
    f.fail(false)
    await f.dialog().props.onConfirm('  Actualización de tarifa\nCambio de naviera.  '); f.app.render()
    assert.equal(f.dialog(), undefined)
    assert.equal(f.transitions.length, 2)
    assert.equal(f.transitions[1][0], f.client)
  } finally { f.cleanup() }
})
