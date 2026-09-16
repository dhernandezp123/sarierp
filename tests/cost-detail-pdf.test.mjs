import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

// Use an in-memory logo so PDF tests never request production assets.
const Image = props => React.createElement(renderer.Image, { ...props, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII=' })
const { default: CostDetailPDF } = loadTs('src/components/pdf/cost-detail-pdf.tsx', { '@react-pdf/renderer': { ...renderer, Image } })
const props = {
  quotation: { quotation_number: 'TEST-COST', quote_type: 'FCL', status: 'Ganada' },
  quotationContainers: [{ container_type_name: '40HC', quantity: 10 }],
  selectedAgent: { moneda: 'USD', ocean_freight: 85360, profit_per_container: 50, mbl_fee: 50, mbl_quantity: 3 },
  pricingItems: [{ id: 'f', item_type: 'Flete', description: 'Ocean Freight 40HC', currency: 'USD', quantity: 10, cost_amount: 8601, sale_amount: 9365 }],
}
test('internal PDF renders the expanded cost explanation on one page for a normal quote', async () => {
  const buffer = await renderer.renderToBuffer(React.createElement(CostDetailPDF, props))
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF')
  assert.equal((buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1)
})
test('internal PDF paginates a large cost detail instead of forcing it onto one page', async () => {
  const pricingItems = Array.from({ length: 100 }, (_, i) => ({ ...props.pricingItems[0], id: String(i), description: 'Cargo operativo de prueba ' + i }))
  const buffer = await renderer.renderToBuffer(React.createElement(CostDetailPDF, { ...props, pricingItems }))
  assert.ok((buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 1)
})
