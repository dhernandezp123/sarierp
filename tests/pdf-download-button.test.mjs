import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

function fixture(props = {}) {
  const previous = { window: globalThis.window, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  const generated = [], downloads = [], revoked = [], errors = [], timers = new Map()
  let next = 0, renderer = async () => new Blob(['synthetic PDF'])
  globalThis.window = { setTimeout(fn) { timers.set(++next, fn); return next }, clearTimeout: id => timers.delete(id) }
  globalThis.document = { body: { appendChild() {} }, createElement: () => {
    const link = { click: () => downloads.push({ href: link.href, name: link.download }), remove() {} }
    return link
  } }
  URL.createObjectURL = () => 'blob:pdf-' + ++next
  URL.revokeObjectURL = url => revoked.push(url)
  const input = { document: { type: 'Document', props: { text: '' } }, fileName: 'test.pdf', children: state => state.loading ? 'Generando...' : 'Descargar PDF', ...props }
  const app = mountPage('src/components/pdf/PdfDownloadButton.tsx', {
    '@react-pdf/renderer': { pdf: document => { generated.push(document); return { toBlob: () => renderer() } } },
    sonner: { toast: { error: (...args) => errors.push(args) } },
  }, { exported: 'PdfDownloadButton', props: input })
  app.render()
  return { app, input, generated, downloads, revoked, errors, timers, renderer: value => { renderer = value },
    click: () => app.find(node => node.type === 'button').props.onClick(),
    cleanup() {
      app.cleanup(); URL.createObjectURL = previous.create; URL.revokeObjectURL = previous.revoke
      for (const key of ['window','document']) { if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key] }
    },
  }
}

test('montar y escribir no genera PDFs; la descarga usa el último documento y nombre', async () => {
  const f = fixture()
  try {
    for (let n = 0; n < 40; n++) {
      f.input.document = { type: 'Document', props: { text: 'Nota actual ' + n } }
      f.input.fileName = 'documento-' + n + '.pdf'; f.app.render()
    }
    assert.deepEqual(f.generated, [])
    await f.click(); f.app.render()
    assert.equal(f.generated[0], f.input.document)
    assert.equal(f.downloads[0].name, 'documento-39.pdf')
    assert.equal(f.app.find(node => node.type === 'button').props.disabled, false)
    for (const timer of [...f.timers.values()]) timer()
    assert.deepEqual(f.revoked, [f.downloads[0].href])
  } finally { f.cleanup() }
})

test('una descarga simultánea se bloquea y conserva documento/nombre del clic inicial', async () => {
  const f = fixture()
  try {
    let resolve
    f.renderer(() => new Promise(done => { resolve = done }))
    const document = f.input.document
    const pending = f.click(); await f.click(); f.app.render()
    assert.equal(f.generated.length, 1)
    assert.equal(f.app.find(node => node.type === 'button').props.disabled, true)
    f.input.document = { type: 'Document', props: { text: 'Edición posterior' } }; f.input.fileName = 'otro.pdf'; f.app.render()
    resolve(new Blob(['PDF'])); await pending
    assert.equal(f.generated[0], document)
    assert.equal(f.downloads[0].name, 'test.pdf')
  } finally { f.cleanup() }
})

test('un error permite reintentar con los datos actuales sin descargas incompletas', async () => {
  const f = fixture()
  try {
    f.renderer(async () => { throw Error('Fallo simulado') })
    await f.click(); f.app.render()
    assert.equal(f.errors.length, 1); assert.equal(f.downloads.length, 0)
    assert.equal(f.app.find(node => node.type === 'button').props.disabled, false)
    f.input.document = { type: 'Document', props: { text: 'Corregido' } }; f.app.render()
    f.renderer(async () => new Blob(['OK'])); await f.click()
    assert.equal(f.generated.at(-1), f.input.document); assert.equal(f.downloads.length, 1)
  } finally { f.cleanup() }
})

test('desmontar cancela la entrega pendiente y libera los recursos de descargas previas', async () => {
  const f = fixture()
  try {
    await f.click()
    let resolve
    f.renderer(() => new Promise(done => { resolve = done }))
    const pending = f.click()
    f.app.cleanup()
    resolve(new Blob(['cancelled'])); await pending
    assert.equal(f.downloads.length, 1)
    assert.deepEqual(f.revoked, [f.downloads[0].href])
    assert.equal(f.timers.size, 0)
  } finally { f.cleanup() }
})

test('respeta el bloqueo del flujo antes de crear cualquier documento', async () => {
  const f = fixture({ disabled: true })
  try { await f.click(); assert.equal(f.generated.length, 0) } finally { f.cleanup() }
})
