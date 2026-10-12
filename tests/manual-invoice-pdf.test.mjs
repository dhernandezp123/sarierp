import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

const { ManualInvoicePdf } = loadTs('src/components/pdf/manual-invoice-pdf.tsx', { '@react-pdf/renderer': renderer })
const { blankManualInvoice, manualInvoicePrintPages, manualInvoiceFields } = loadTs('src/lib/manual-invoice.ts')
const data = { ...blankManualInvoice(), invoice_number: '131326', issue_date: '2026-09-28', due_date: '2026-09-28',
  bill_to_name: 'M&D IMPORT S DE RL', bill_to_address: 'COMPLEJO IND. COSTA DEL ESTE', bill_to_city: 'SAN PEDRO SULA, HONDURAS',
  consignee: 'M&D IMPORT S DE RL', carrier: 'SERVIPORT MARINE SOLUTIONS, LLC', goods_description: '40NOR CONTAINER NO. HLJU0032531',
  hbl: 'HBL-87574', mbl: 'MBL-31706', pieces: '1', weight_lb: '44,984', consol_number: 'HDR7948',
  items: [{ description: 'OCEAN FREIGHT FROM BILL OF LADING HBL-87574', amount: '3,300.00' },
    { description: 'LOADING/UNLOADING FROM BILL OF LADING HBL-87574', amount: '470.00' },
    { description: 'DOCUMENTATION FEE FROM BILL OF LADING HBL-87574', amount: '75.00' }],
  warehouse_receipts: ['456308', '456800', '457319', '458029', '458428', '459221'] }
const logo = `data:image/jpeg;base64,${fs.readFileSync('public/logo/sari-usa-invoice.jpeg').toString('base64')}`

test('actual SARI USA renderer produces one Letter page for the supplied example', async () => {
  let layout
  const doc = React.cloneElement(ManualInvoicePdf({ data, logo }), { onRender: (result) => { layout = result._INTERNAL__LAYOUT__DATA_ } })
  const blob = await renderer.pdf(doc).toBlob()
  assert.ok(blob.size > 10000)
  assert.equal(layout.children.length, 1)
  assert.equal(layout.children[0].box.width, 612)
  assert.equal(layout.children[0].box.height, 792)
  // The charge body ends above the total box, even with explicit pagination.
  const table = layout.children[0].children.find((node) => node.box?.top === 325)
  assert.ok(table)
  assert.ok(table.children.every((node) => node.box.top + node.box.height <= table.box.height))
})

test('actual renderer paginates large invoices and repeats the layout without losing print rows', async () => {
  const large = { ...data, items: Array.from({ length: 40 }, (_, i) => ({ description: `${i}-` + 'W'.repeat(170), amount: '12.00' })),
    warehouse_receipts: Array.from({ length: 200 }, (_, i) => `TEST-${i}`) }
  let layout
  const doc = React.cloneElement(ManualInvoicePdf({ data: large, logo }), { onRender: (result) => { layout = result._INTERNAL__LAYOUT__DATA_ } })
  await renderer.pdf(doc).toBlob()
  const pages = manualInvoicePrintPages(large)
  assert.equal(layout.children.length, pages.length)
  layout.children.forEach((page, index) => {
    const table = page.children.find((node) => node.box?.top === 325)
    assert.equal(table.children.length - 1, pages[index].length)
    assert.ok(table.children.every((node) => node.box.top + node.box.height <= table.box.height))
    for (const row of table.children.slice(1)) {
      assert.ok(row.children.every((node) => !node.lines || node.lines.length <= 1), 'Print row must fit on one line')
    }
  })
})

test('maximum field lengths fit inside their template boxes', async () => {
  const lengthy = { ...data, ...Object.fromEntries(manualInvoiceFields.filter(([key]) => !key.endsWith('_date')).map(([key, , max]) => [key, 'W'.repeat(max)])) }
  let layout
  await renderer.pdf(React.cloneElement(ManualInvoicePdf({ data: lengthy, logo }), { onRender: (result) => { layout = result._INTERNAL__LAYOUT__DATA_ } })).toBlob()
  const overflow = []
  let checkedTextNodes = 0
  const inspect = (node) => {
    if (node.type === 'TEXT' && node.lines) {
      checkedTextNodes++
      const source = (node.children ?? []).filter((child) => child.type === 'TEXT_INSTANCE').map((child) => child.value).join('').replace(/\s/g, '')
      const printed = node.lines.map((line) => line.string ?? '').join('').replace(/[\s\u00ad]/g, '')
      if (source.includes('WWWW') && printed !== source) overflow.push({ truncated: true, sourceLength: source.length, printedLength: printed.length, source, printed })
    }
    for (const line of node.lines ?? []) {
      if (line.box && line.box.y + line.box.height > node.box.height + 1) overflow.push({ textLines: node.lines.length, text: line.string, box: node.box, lineBox: line.box })
    }
    for (const child of node.children ?? []) {
      if (node.type !== 'DOCUMENT' && child.box && node.box && child.box.top + child.box.height > node.box.height + 1) {
        overflow.push({ parent: node.box, child: child.box, text: child.children?.filter((entry) => entry.type === 'TEXT_INSTANCE').map((entry) => entry.value).join('') })
      }
      inspect(child)
    }
  }
  inspect(layout)
  assert.ok(checkedTextNodes > 20, 'Inspect actual text layout, not just outer boxes')
  assert.deepEqual(overflow, [])
})
