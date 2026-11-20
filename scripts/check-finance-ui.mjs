import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const roots = ['src/app/(protected)/accounting', 'src/app/(protected)/invoicing', 'src/app/(protected)/accounts-payable', 'src/app/(protected)/cost-validation', 'src/app/(protected)/financial-dashboard', 'src/app/(protected)/suppliers', 'src/app/(protected)/settings/cai', 'src/components/accounting', 'src/components/invoicing', 'src/components/suppliers', 'src/components/hr/HrPayrollPage.tsx']

/** No baseline exemptions: every financial numeric field uses the shared geometry. */
export function auditFinanceSource(source, filename = 'fixture.tsx') {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const errors = [], controls = new Map()
  const report = (node, message) => errors.push(`${filename}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${message}`)
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const modulePath = node.moduleSpecifier.text
      if (/\/NumberInput(?:\.[tj]sx?)?$/.test(modulePath)) report(node, 'Use FinanceNumberInput, not the generic numeric control.')
      if (/\/FinanceNumberInput(?:\.[tj]sx?)?$/.test(modulePath)) {
        const bindings = node.importClause?.namedBindings
        if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) controls.set(item.name.text, (item.propertyName ?? item.name).text)
      }
    }
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const name = node.tagName.getText(file)
      const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(file), a]))
      const value = key => {
        const initial = attrs.get(key)?.initializer
        const literal = initial && ts.isJsxExpression(initial) ? initial.expression : initial
        return literal && (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)) ? literal.text : undefined
      }
      const rawNumericType = /['"`]number['"`]/.test(attrs.get('type')?.initializer?.getText(file) ?? '')
      const rawNumericMode = /['"`](numeric|decimal)['"`]/.test(attrs.get('inputMode')?.initializer?.getText(file) ?? '')
      if (name === 'input' && (rawNumericType || rawNumericMode)) report(node, 'Raw numeric input bypasses the financial standard.')
      if (controls.has(name)) {
        for (const key of ['className', 'style', 'size']) if (attrs.has(key)) report(node, `Numeric geometry cannot override ${key}.`)
        if (node.attributes.properties.some(ts.isJsxSpreadAttribute)) report(node, 'Pass explicit numeric props; spreads can override the standard.')
        if (controls.get(name) === 'FinanceNumberInput' && !attrs.has('numericKind')) report(node, 'numericKind is required.')
        if (attrs.has('presentation') && value('presentation') !== 'standard' && !(attrs.get('presentationReason')?.initializer && ts.isStringLiteral(attrs.get('presentationReason').initializer) && value('presentationReason')?.trim())) report(node, 'A featured field requires a literal presentationReason.')
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return errors
}

export function checkFinanceTree(base = process.cwd()) {
  const errors = []
  function scan(dir) {
    if (!fs.existsSync(dir)) return
    if (fs.statSync(dir).isFile()) { errors.push(...auditFinanceSource(fs.readFileSync(dir, 'utf8'), path.relative(base, dir))); return }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filename = path.join(dir, entry.name)
      if (entry.isDirectory()) scan(filename)
      else if (/\.tsx$/.test(filename)) errors.push(...auditFinanceSource(fs.readFileSync(filename, 'utf8'), path.relative(base, filename)))
    }
  }
  for (const root of roots) scan(path.join(base, root))
  return errors
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkFinanceTree()
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
  else console.log('Financial numeric field standard: all scoped files passed.')
}
