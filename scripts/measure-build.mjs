import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'

const root = path.resolve('.next/static/chunks')
if (!fs.existsSync(root)) throw new Error('Run npm run build first')
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? files(target) : /\.(js|css)$/.test(entry.name) ? [target] : []
  })
}
const chunks = files(root).map(file => {
  const bytes = fs.readFileSync(file)
  return { file: path.relative(root, file).replaceAll('\\', '/'), bytes: bytes.length, gzip_bytes: gzipSync(bytes).length }
}).sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file))
const report = {
  measured_at: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  uncommitted: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  scope: 'All generated client JS/CSS chunks; not route transfer size or browser latency',
  chunk_count: chunks.length,
  total_bytes: chunks.reduce((sum, row) => sum + row.bytes, 0),
  total_gzip_bytes: chunks.reduce((sum, row) => sum + row.gzip_bytes, 0),
  largest_chunks: chunks.slice(0, 15),
}
fs.mkdirSync('docs/performance', { recursive: true })
fs.writeFileSync('docs/performance/build-baseline.json', JSON.stringify(report, null, 2) + '\n')
console.log(`Measured ${chunks.length} client chunks; report: docs/performance/build-baseline.json`)
