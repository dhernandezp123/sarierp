import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

const Image = props => React.createElement(renderer.Image, { ...props, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII=' })
const { default: QuotationPDF } = loadTs('src/components/pdf/quotation-pdf.tsx', { '@react-pdf/renderer': { ...renderer, Image } })

for (const quoteType of ['FCL', 'LCL']) {
  test(`PDF comercial ${quoteType} excluye notas de la tarifa y mantiene las comerciales`, async () => {
    let layout
    const document = React.cloneElement(QuotationPDF({
      quotation: {
        quotation_number: 'TEST-NOTAS', quote_type: quoteType, tipo_transporte: 'Marítimo',
        client_notes: 'Condiciones comerciales visibles', pricing_notes: 'VENTAS-SECRETO',
        clientes: { nombre: 'Cliente ficticio' },
      },
      selectedAgent: {
        carrier: 'Carrier de prueba', transit_time: '20', internal_notes: 'TARIFA-SECRETO',
        agente_nombre: 'PROVEEDOR-SECRETO',
      },
      pricingItems: [{ id: 'freight', item_type: 'Flete', description: 'Flete marítimo', quantity: 1, sale_amount: 200, cost_amount: 100, total_amount: 200 }],
    }), { onRender: result => { layout = result._INTERNAL__LAYOUT__DATA_ } })
    const blob = await renderer.pdf(document).toBlob()
    assert.ok(blob.size > 1000)
    const collect = node => [
      ...(node.type === 'TEXT' ? (node.lines || []).map(line => line.string) : []),
      ...(node.children || []).flatMap(collect),
    ]
    const text = collect(layout).join('\n')
    assert.match(text, /Condiciones comerciales visibles/)
    assert.match(text, /200\.00/)
    assert.doesNotMatch(text, /TARIFA-SECRETO|VENTAS-SECRETO|PROVEEDOR-SECRETO/)
  })
}
