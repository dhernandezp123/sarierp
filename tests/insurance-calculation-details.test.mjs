import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import loadTs from './load-ts.mjs'

const { InsuranceCalculationDetails } = loadTs(
  'src/components/pricing/InsuranceCalculationDetails.tsx'
)

test('insurance calculation renders an in-flow, structured disclosure', () => {
  const html = renderToStaticMarkup(
    React.createElement(InsuranceCalculationDetails, {
      notes: [
        'Valor factura / FOB: USD 1,000.00',
        'Seguro venta: USD 1,210.00 × 1% = USD 12.10',
      ].join('\n'),
    })
  )

  assert.match(html, /<details/)
  assert.match(html, /Ver desglose del cálculo \(2 pasos\)/)
  assert.match(html, /Valor factura \/ FOB:/)
  assert.match(html, /Seguro venta:/)
  assert.doesNotMatch(html, /role="tooltip"|position:absolute/)
})

test('insurance calculation explains when a historical breakdown is unavailable', () => {
  const html = renderToStaticMarkup(
    React.createElement(InsuranceCalculationDetails, { notes: null })
  )

  assert.match(html, /Ver desglose del cálculo/)
  assert.match(html, /Esta línea no tiene el detalle histórico del cálculo/)
})
