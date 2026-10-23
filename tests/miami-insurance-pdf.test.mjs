import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

const Image = props => React.createElement(renderer.Image, { ...props, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII=' })
const { default: QuotationPDF } = loadTs('src/components/pdf/quotation-pdf.tsx', { '@react-pdf/renderer': { ...renderer, Image } })
const { withMiamiInsurance } = loadTs('src/lib/miami-insurance.ts')

test('PDF comercial Miami respeta la decisión de asegurar por cotización y protege datos internos', async () => {
  for (const requested of [true, false]) {
    const pricing = withMiamiInsurance({
      quotationId: 'pdf-test', required: requested, commercialValue: 1000, saleRatePercent: 1,
      settings: { default_tax_rate: 15, insurance_cost_rate_percent: 0.28 },
      items: [{ rate_code: 'miami_lcl_freight', description: 'Flete Miami LCL', item_type: 'freight', quantity: 1, cost_amount: 0, sale_amount: 500, total_amount: 500 }],
    })
    assert.equal(pricing.error, null)
    let layout
    const document = React.cloneElement(QuotationPDF({
      quotation: { quotation_number: 'TEST-MIAMI', service_product: 'miami_lcl', quote_type: 'LCL', status: 'Pricing Aprobado', requires_insurance: requested, commercial_value: 1000, pricing_notes: 'INTERNAL-SECRET', cliente: { nombre: 'Cliente de prueba', asegura_carga: true, seguro_porcentaje: 1 } },
      pricingItems: pricing.items.map((item, index) => ({ ...item, id: String(index) })), selectedAgent: null,
    }), { onRender: result => { layout = result._INTERNAL__LAYOUT__DATA_ } })
    const blob = await renderer.pdf(document).toBlob()
    assert.ok(blob.size > 1000)
    const printed = []
    const collect = node => {
      if (node.type === 'TEXT') printed.push(...(node.lines ?? []).map(line => line.string))
      for (const child of node.children ?? []) collect(child)
    }
    collect(layout)
    const text = printed.join('\n')
    if (requested) {
      assert.match(text, /Seguro de Carga/)
      assert.match(text, /75\.00/)
      assert.match(text, /11\.25/)
      assert.match(text, /586\.25/)
    } else {
      assert.doesNotMatch(text, /Seguro de Carga|75\.00|11\.25|586\.25/)
      assert.match(text, /500\.00/)
    }
    assert.doesNotMatch(text, /INTERNAL-SECRET|Valor asegurado costo|0\.28%|JAH Insurance/)
  }
})
