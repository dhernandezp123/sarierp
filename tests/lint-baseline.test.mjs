import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { diagnostics, compareDiagnostics } from '../scripts/lint-baseline.mjs'

test('lint baseline rejects new files, rules, severities and duplicate occurrences', () => {
  const row = (file, messages) => ({ filePath: path.resolve(file), messages })
  const error = { ruleId: 'rule', severity: 2, message: 'existing' }
  const original = diagnostics([row('src/old.ts', [error])])
  assert.deepEqual(compareDiagnostics(original, original), [])
  assert.deepEqual(compareDiagnostics({}, original), [])
  assert.deepEqual(diagnostics([row('src/old.ts', [{ ...error, message: 'existing\n/path:42 code excerpt' }])]), original)
  for (const changed of [
    [row('src/new.ts', [error])],
    [row('src/old.ts', [{ ...error, ruleId: 'other' }])],
    [row('src/old.ts', [{ ...error, severity: 1 }])],
    [row('src/old.ts', [error, error])],
  ]) assert.equal(compareDiagnostics(diagnostics(changed), original).length, 1)
})
