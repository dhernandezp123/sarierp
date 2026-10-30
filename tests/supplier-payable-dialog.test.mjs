import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

test('modal impide cierre durante una transaccion y vuelve a permitirlo al finalizar', async () => {
 let closed=0
 const app=mountPage('src/components/accounting/SupplierPayableDialog.tsx',{
  './SupplierPayableDetail':{SupplierPayableDetail:'SupplierPayableDetail'},
  '@/src/components/ui/dialog':Object.fromEntries(['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription'].map(n=>[n,n])),
 },{exported:'SupplierPayableDialog',props:{id:'account-A',onClose:()=>closed++}})
 try{
  await app.ready();const detail=()=>app.find(n=>n.type==='SupplierPayableDetail'),dialog=()=>app.find(n=>n.type==='Dialog'),content=()=>app.find(n=>n.type==='DialogContent')
  assert.equal(detail().props.id,'account-A');assert.equal(detail().props.embedded,true)
  detail().props.onBusyChange(true);app.render();assert.equal(content().props.showCloseButton,false)
  let prevented=0;content().props.onEscapeKeyDown({preventDefault:()=>prevented++});content().props.onInteractOutside({preventDefault:()=>prevented++})
  dialog().props.onOpenChange(false);assert.equal(closed,0);assert.equal(prevented,2)
  detail().props.onBusyChange(false);app.render();assert.equal(content().props.showCloseButton,true);dialog().props.onOpenChange(false);assert.equal(closed,1)
 }finally{app.cleanup()}
})
