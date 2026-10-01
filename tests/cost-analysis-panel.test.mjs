import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import loadTs from './load-ts.mjs'
const { CostAnalysisPanel } = loadTs('src/components/pricing/CostAnalysisPanel.tsx')
const pricing = [{ id: 'p', description: 'DTHC', supplier: 'Naviera', item_type: 'Destino', currency: 'USD', quantity: 10, cost_amount: 380, sale_amount: 350 }]
test('rendered detail labels missing invoices, loss and container averages without real profit', () => {
  const html = renderToStaticMarkup(React.createElement(CostAnalysisPanel, { pricing, containers: [{ container_type_name: '40HC', quantity: 10 }] }))
  assert.match(html, /Costos pendientes de registrar/)
  assert.match(html, /Pérdida cotizada/)
  assert.match(html, /USD 380.00/)
  assert.match(html, /Pendiente de cierre/)
  assert.doesNotMatch(html, /Profit Real|Dentro de margen/)
})
test('quotation-only panel does not imply actual invoice coverage', () => {
  const html = renderToStaticMarkup(React.createElement(CostAnalysisPanel, { pricing, showRegistered: false }))
  assert.doesNotMatch(html, /Costos pendientes de registrar|Conciliación|registrado sin impuesto/)
  assert.match(html, /Costo cotizado/)
})
