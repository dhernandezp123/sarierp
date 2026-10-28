import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { pdf } from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

const walk = node => [node, ...(node.children || []).flatMap(walk)]
const notice = 'DOCUMENTO SIN VALIDEZ COMERCIAL, OPERATIVA O FISCAL'

test('fiscal PDF in Demo prints the real sandbox watermark on every page', async () => {
  const { FiscalDocumentLayout } = loadTs('src/components/pdf/FiscalDocumentLayout.tsx', {
    '@/src/lib/demo-environment': { IS_DEMO_ENVIRONMENT: true, DEMO_DOCUMENT_NOTICE: notice },
  })
  const data = { title:'FACTURA',number:'001-001-01-00000001',status:'Aprobada',issuer:{legal_name:'Atlas Forwarding Demo'},party:{name:'Cliente ficticio'},party_label:'CLIENTE',currency:'HNL',total:80,total_currency:'HNL',totals:[],lines:Array.from({length:60},(_,i)=>({description:`Servicio ficticio ${i}`,quantity:1,unit_price:1,tax:'Exento',amount:1})) }
  let layout
  await pdf(React.cloneElement(FiscalDocumentLayout({data}), { onRender:r=>{layout=r._INTERNAL__LAYOUT__DATA_} })).toBlob()
  assert.ok(layout.children.length > 1)
  for (const page of layout.children) {
    const text = walk(page).filter(n=>n.type==='TEXT').flatMap(n=>(n.lines||[]).map(l=>l.string)).join(' ')
    assert.match(text,/AMBIENTE DEMO/)
    assert.ok(text.includes(notice))
  }
})

test('expired Demo profiles and missing expiry remain blocked by the shared Demo helper', () => {
  const { isDemoAccessExpired } = loadTs('src/lib/demo-environment.ts')
  assert.equal(isDemoAccessExpired({is_demo_user:true,demo_expires_at:null}),true)
  assert.equal(isDemoAccessExpired({is_demo_user:true,demo_expires_at:'2020-01-01'}),true)
  assert.equal(isDemoAccessExpired({is_demo_user:true,demo_expires_at:'2099-01-01'}),false)
})
