import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

const Image = props => React.createElement(renderer.Image, { ...props, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII=' })
const { default: QuotationPDF } = loadTs('src/components/pdf/quotation-pdf.tsx', { '@react-pdf/renderer': { ...renderer, Image } })
const { buildCustomsPricingItems, newCustomsCharges } = loadTs('src/lib/customs-quotation.ts')

test('PDF de Aduanas imprime alcance, entrega, honorarios e ISV sin datos ficticios de transporte ni notas internas', async () => {
  const items = buildCustomsPricingItems('test', [
    { ...newCustomsCharges()[0], sale: '200' },
    { code: 'customs_delivery', description: 'Entrega final', cost: '17.89', sale: '100', taxable: true },
  ], 15, 'PROVEEDOR-INTERNO')
  let layout
  const document = React.cloneElement(QuotationPDF({
    quotation: { quotation_number: 'DEMO-ADUANAS', service_product: 'customs_only', quote_type: 'Aduanas', tipo_transporte: 'Aduanas', commodity: 'Repuestos', puerto_destino: 'Puerto Cortés', delivery_address: 'San Pedro Sula', trade_direction: 'import', valid_until: '2026-11-01', pricing_notes: 'INTERNAL-SECRET', client_notes: 'Impuestos aduaneros según liquidación.', clientes: { nombre: 'Cliente ficticio' } },
    pricingItems: items.map((item, index) => ({ ...item, id: String(index) })), selectedAgent: null,
  }), { onRender: result => { layout = result._INTERNAL__LAYOUT__DATA_ } })
  const blob = await renderer.pdf(document).toBlob()
  assert.ok(blob.size > 1000)
  const collect = node => [ ...(node.type === 'TEXT' ? (node.lines || []).map(line => line.string) : []), ...(node.children || []).flatMap(collect) ]
  const firstPage = collect(layout.children[0]).join('\n')
  const all = collect(layout).join('\n')
  assert.match(firstPage, /Servicio de Aduanas/)
  assert.match(firstPage, /Tipo de operación:\s*Importación/)
  assert.match(firstPage, /Dirección de entrega:\s*San Pedro Sula/)
  assert.doesNotMatch(firstPage, /(?:^|\n)Dirección:\s*Importación/)
  assert.match(firstPage, /Puerto Cortés/)
  assert.match(firstPage, /San Pedro Sula/)
  assert.match(firstPage, /345\.00/)
  assert.match(firstPage, /45\.00/)
  assert.match(firstPage, /Impuestos aduaneros según liquidación/)
  assert.doesNotMatch(firstPage, /Contenedores|Carrier:|Incoterm:|Transbordo:|Miami/)
  assert.doesNotMatch(all, /INTERNAL-SECRET|PROVEEDOR-INTERNO|17\.89/)
})
