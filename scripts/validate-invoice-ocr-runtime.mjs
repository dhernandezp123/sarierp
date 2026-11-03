import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// Test the traced deployment files, without access to this checkout's node_modules.
const root = process.cwd()
const tracePath = path.join(root, '.next/server/app/api/manual-invoices/ocr/route.js.nft.json')
const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'))
const files = trace.files.map(file => path.resolve(path.dirname(tracePath), file))
  .map(file => ({ file, relative: path.relative(root, file).replaceAll('\\', '/') }))
  .filter(({ relative }) => relative.startsWith('node_modules/pdfjs-dist/') || relative.startsWith('node_modules/@napi-rs/canvas'))
assert(files.some(({ relative }) => relative === 'node_modules/@napi-rs/canvas/index.js'), 'OCR artifact is missing @napi-rs/canvas')
assert(files.some(({ relative }) => relative.endsWith('.node')), 'OCR artifact is missing the native canvas binding')
assert(files.some(({ relative }) => relative === 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'), 'OCR artifact is missing the PDF worker')

const temporaryRoot = path.resolve(os.tmpdir())
const artifact = fs.mkdtempSync(path.join(temporaryRoot, 'sari-ocr-runtime-'))
try {
  for (const { file, relative } of files) {
    const target = path.join(artifact, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(file, target)
  }
  const runner = path.join(artifact, 'check.mjs')
  fs.writeFileSync(runner, `
import assert from 'node:assert/strict'
import { getDocument, GlobalWorkerOptions } from './node_modules/pdfjs-dist/legacy/build/pdf.mjs'
assert.equal(typeof globalThis.DOMMatrix, 'function', 'PDF runtime could not initialize canvas')
GlobalWorkerOptions.workerSrc = new URL('./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href
const bytes = new TextEncoder().encode('%PDF-1.7\\n1 0 obj\\n<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n2 0 obj\\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\\nendobj\\n3 0 obj\\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\\nendobj\\ntrailer\\n<< /Root 1 0 R >>\\n%%EOF')
const task = getDocument({ data: bytes, enableXfa: false, useSystemFonts: false })
try { const document = await task.promise; assert.equal(document.numPages, 1) }
finally { await task.destroy() }
console.log('Invoice OCR packaged PDF runtime OK')
`)
  const result = spawnSync(process.execPath, [runner], { cwd: artifact, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, NODE_PATH: '' } })
  assert.equal(result.status, 0, `OCR artifact could not read a PDF: ${result.stderr || result.error?.message || result.stdout}`)
  console.log(result.stdout.trim())
} finally {
  // Verify the exact generated temporary directory before recursive cleanup on Windows.
  assert.equal(path.dirname(path.resolve(artifact)), temporaryRoot)
  assert(path.basename(artifact).startsWith('sari-ocr-runtime-'))
  fs.rmSync(artifact, { recursive: true, force: true })
}
