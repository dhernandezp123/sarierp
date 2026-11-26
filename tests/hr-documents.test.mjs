import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { hrDocumentMime, HR_DOCUMENT_MAX_BYTES, hrSameOrigin } = loadTs('src/lib/hr-documents.ts')
test('HR: signed upload MIME comes from bytes instead of a misleading file extension', () => {
  assert.equal(hrDocumentMime(new TextEncoder().encode('%PDF-1.7 synthetic')), 'application/pdf')
  assert.equal(hrDocumentMime(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png')
  assert.equal(hrDocumentMime(Uint8Array.from([255, 216, 255, 224])), 'image/jpeg')
  assert.equal(hrDocumentMime(new TextEncoder().encode('<script>not a PDF</script>')), null)
  assert.equal(hrDocumentMime(new Uint8Array()), null)
  assert.equal(HR_DOCUMENT_MAX_BYTES, 10485760)
})
test('HR: upload origin follows validated public Host, including its port, rather than internal Next URL', () => {
  assert.equal(hrSameOrigin('http://127.0.0.1:3151', '127.0.0.1:3151'), true)
  assert.equal(hrSameOrigin('https://sari.forwarders.app', 'sari.forwarders.app'), true)
  assert.equal(hrSameOrigin('https://outside.example', 'sari.forwarders.app'), false)
  assert.equal(hrSameOrigin('http://127.0.0.1:9999', '127.0.0.1:3151'), false)
  assert.equal(hrSameOrigin(null, 'sari.forwarders.app'), false)
  assert.equal(hrSameOrigin('not a URL', 'sari.forwarders.app'), false)
})
