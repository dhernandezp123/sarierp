import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

// Public library/model files only. Invoice contents never enter this directory.
const destination = path.resolve('public/ocr-assets/runtime')
fs.mkdirSync(destination, { recursive: true })
fs.copyFileSync('node_modules/tesseract.js/dist/worker.min.js', path.join(destination, 'tesseract-worker.js'))
fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', path.join(destination, 'pdf-worker.mjs'))
for (const [source, name] of [
  ['node_modules/tesseract.js/LICENSE.md', 'LICENSE_TESSERACT_JS'],
  ['node_modules/tesseract.js-core/LICENSE', 'LICENSE_TESSERACT_CORE'],
  ['node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt', 'NOTICE_TESSERACT_WORKER'],
  ['node_modules/pdfjs-dist/LICENSE', 'LICENSE_PDF_JS'],
]) fs.copyFileSync(source, path.join(destination, name))
for (const name of fs.readdirSync('node_modules/tesseract.js-core')) {
  if (/^tesseract-core[\w-]*\.wasm(?:\.js)?$/.test(name)) {
    fs.copyFileSync(path.join('node_modules/tesseract.js-core', name), path.join(destination, name))
  }
}
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  fs.cpSync(path.join('node_modules/pdfjs-dist', directory), path.join(destination, directory), { recursive: true })
}
if (!fs.existsSync('public/ocr-assets/lang/eng.traineddata.gz')) {
  throw new Error('Missing self-hosted English OCR model; see public/ocr-assets/NOTICE.md')
}
const modelHash = createHash('sha256').update(fs.readFileSync('public/ocr-assets/lang/eng.traineddata.gz')).digest('hex')
if (modelHash !== '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91') {
  throw new Error('English OCR model checksum mismatch; restore the versioned model')
}
console.log('Prepared self-hosted invoice OCR assets')
