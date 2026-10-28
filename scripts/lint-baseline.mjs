import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ESLint } from 'eslint'

export function diagnostics(results, root = process.cwd()) {
  const counts = {}
  for (const result of results) {
    const file = path.relative(root, result.filePath).replaceAll('\\', '/')
    for (const item of result.messages) {
      // Compiler messages include absolute paths, excerpts and line numbers.
      // Keep the diagnostic title so Windows/Linux and harmless line moves agree.
      const key = JSON.stringify([file, item.ruleId, item.severity, item.message.split(/\r?\n/, 1)[0]])
      counts[key] = (counts[key] || 0) + 1
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'en')))
}

export function compareDiagnostics(current, baseline) {
  return Object.entries(current).filter(([key, count]) => count > (baseline[key] || 0))
    .map(([key, count]) => ({ diagnostic: JSON.parse(key), added: count - (baseline[key] || 0) }))
}

async function main() {
  const results = await new ESLint().lintFiles(['src', 'tests', 'scripts'])
  if (results.some(row => row.fatalErrorCount)) throw new Error('ESLint parsing/configuration failure')
  const current = diagnostics(results)
  const file = new URL('../docs/quality/lint-baseline.json', import.meta.url)
  if (process.argv.includes('--write')) {
    if (process.env.CI) throw new Error('Baseline updates are forbidden in CI')
    await fs.mkdir(new URL('../docs/quality/', import.meta.url), { recursive: true })
    await fs.writeFile(file, JSON.stringify({ version: 1, diagnostics: current }, null, 2) + '\n')
    console.log('Baseline written. Review every addition before committing.')
    return
  }
  const baseline = JSON.parse(await fs.readFile(file, 'utf8'))
  if (baseline.version !== 1) throw new Error('Unsupported lint baseline')
  const added = compareDiagnostics(current, baseline.diagnostics)
  if (added.length) {
    for (const row of added) console.error(JSON.stringify(row))
    process.exitCode = 1
  }
  const total = Object.values(current).reduce((sum, count) => sum + count, 0)
  console.log(`ESLint: ${results.length} files, ${total} existing diagnostics, ${added.length} regressions.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
