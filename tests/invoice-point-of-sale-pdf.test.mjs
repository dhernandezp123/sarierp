import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

const { InvoicePdf } = loadTs('src/components/pdf/invoice-pdf.tsx')
const base = {
  invoice_number: '002-001-01-00000001', invoice_type: 'Factura', status: 'Borrador', issue_date: '2026-10-26',
  currency: 'USD', exchange_rate: 25, cliente_nombre: 'Cliente ficticio', company_legal_name: 'Empresa ficticia',
  items: [{ description: 'Servicio de prueba', quantity: 1, unit_price: 100, amount: 100, isv_rate: 15 }],
  subtotal: 100, tax_amount: 15, total: 115, total_lps: 2875, importe_exento: 0, importe_exonerado: 0,
  isv_15_amount: 15, isv_18_amount: 0, gravado_15: 100, gravado_18: 0,
  cai: 'CAI-DE-PRUEBA', rango_desde: '002-001-01-00000001', rango_hasta: '002-001-01-00000100',
  fecha_limite_emision: '2026-12-31', lugar_emision: 'Oficina de prueba',
}

for (const point of ['San Pedro Sula', 'Tegucigalpa', null]) {
  test(`PDF fiscal real conserva CAI, importe y oficina ${point || 'legacy'}`, async () => {
    let layout
    const document = React.cloneElement(InvoicePdf({ data: { ...base, point_of_sale: point } }), {
      onRender: result => { layout = result._INTERNAL__LAYOUT__DATA_ },
    })
    const blob = await renderer.pdf(document).toBlob()
    assert.ok(blob.size > 1000)
    const collect = node => [
      ...(node.type === 'TEXT' ? (node.lines || []).map(line => line.string) : []),
      ...(node.children || []).flatMap(collect),
    ]
    const text = collect(layout).join('\n')
    assert.match(text, /CAI-DE-PRUEBA/)
    assert.match(text, /115\.00/)
    if (point) assert.ok(text.includes(point))
    else assert.doesNotMatch(text, /Punto de venta:/)
  })
}
