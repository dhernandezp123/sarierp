import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  operationsDashboardHref,
  operationsReturnHref,
} = loadTs('src/lib/operations-navigation.ts')

test('serializa el filtro de la torre sin perder la búsqueda', () => {
  assert.equal(
    operationsDashboardHref('documentation', 'BK 100'),
    '/operations/dashboard?queue=documentation&q=BK+100'
  )
})

test('acepta solo retornos internos al dashboard operativo', () => {
  assert.equal(
    operationsReturnHref('/operations/dashboard?queue=attention&q=ACME&bad=1'),
    '/operations/dashboard?queue=attention&q=ACME'
  )
  assert.equal(
    operationsReturnHref('https://evil.example/path'),
    '/operations/shipping-instructions'
  )
  assert.equal(
    operationsReturnHref('/invoicing?view=work&bad=1'),
    '/invoicing?view=work'
  )
})
