import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
import ts from 'typescript'

// Ejecuta el código TypeScript real sin añadir un runner o un transpiler nuevo.
export default function loadTs(entry, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', entry)
  if (cache.has(filename)) return cache.get(filename).exports
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText
  const mod = { exports: {} }
  cache.set(filename, mod)
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
    const target = name.startsWith('@/')
      ? path.resolve(__dirname, '..', name.slice(2))
      : path.resolve(path.dirname(filename), name)
    const resolved = ['.ts', '.tsx', ''].map((ext) => target + ext).find((file) => fs.existsSync(file))
    if (!resolved) throw new Error(`Import no encontrado: ${name}`)
    return loadTs(resolved, mocks, cache)
  }
  new Function('require', 'module', 'exports', compiled)(localRequire, mod, mod.exports)
  return mod.exports
}
