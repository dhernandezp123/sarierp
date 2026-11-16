import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'

const workflow = loadTs('src/lib/purchase-workflow.ts')
const {canAccessPath} = loadTs('src/lib/permissions.ts')
const {workspaceBreadcrumbs} = loadTs('src/lib/workspace-breadcrumbs.ts')
const base = { id:'order', kind:'Orden', document_number:'OC-FIXTURE', status:'Aprobada', revision:3,
  supplier_snapshot:{name:'Proveedor ficticio'}, currency:'HNL', total:115, issue_date:'2026-11-16',due_date:'2026-12-16',
  items:[{id:'line',description:'Compra ficticia',quantity:3,unit_price:100,discount_amount:1,tax_rate:15,tax_treatment:'Gravada'}],
}
test('purchasing permission requires an approved active Admin or Contabilidad', () => {
  for(const rol of ['Admin','Contabilidad']) assert.equal(workflow.canManagePurchaseWorkflow({rol,status:'Aprobado',is_active:true}),true)
  for(const rol of ['Finanzas','Ventas','Operaciones','Pricing','Cliente']) assert.equal(workflow.canManagePurchaseWorkflow({rol,status:'Aprobado',is_active:true}),false)
  assert.equal(workflow.canManagePurchaseWorkflow({rol:'Admin',status:'Pendiente',is_active:true}),false)
  assert.equal(workflow.canManagePurchaseWorkflow({rol:'Contabilidad',status:'Aprobado',is_active:false}),false)
  assert.equal(canAccessPath('Finanzas','/accounting/purchase-orders'),false)
  assert.equal(canAccessPath('Contabilidad','/accounting/purchase-orders'),true)
  assert.equal(workspaceBreadcrumbs('/accounting/purchase-requests').at(-1).label,'Solicitudes de compra')
})
test('purchasing uses invoice fiscal rules and respects global exemption and calendar terms', () => {
  assert.equal(workflow.purchaseWorkflowAmounts(base.items,'Mixta').total,343.85)
  assert.equal(workflow.purchaseWorkflowAmounts(base.items,'Exenta').total,299)
  assert.equal(workflow.purchaseWorkflowAmounts(base.items,'Exonerada').exonerated,299)
  assert.equal(workflow.purchaseWorkflowDueDate('2026-12-31',30),'2027-01-30')
  assert.equal(workflow.purchaseWorkflowDueDate('2028-02-28',1),'2028-02-29')
  assert.throws(()=>workflow.purchaseWorkflowAmounts([{...base.items[0],discount_amount:301}],'Mixta'))
  const small=Array.from({length:2},()=>({...base.items[0],quantity:1,unit_price:0.03,discount_amount:0,amount:0.03,tax:0}))
  assert.equal(workflow.purchaseWorkflowAmounts(small,'Mixta').total,0.06)
  assert.equal(workflow.purchaseWorkflowAmounts(small,'Mixta',true).tax15,0)
})
test('remaining quantities ignore voided allocations and other orders and lines', () => {
  assert.equal(workflow.purchaseWorkflowRemaining(base,[{order_id:'order',item_id:'line',quantity:1,is_active:true},
    {order_id:'order',item_id:'line',quantity:1,is_active:false}, {order_id:'other',item_id:'line',quantity:999}])[0].remaining,2)
})

async function mount({delay=false,allocations=[]}={}) {
  let profile={id:'user',tenant_id:'tenant',rol:'Contabilidad',status:'Aprobado',is_active:true}
  const calls=[],errors=[],pending=[]
  const api={from(table){let start=0;const query={select:()=>query,eq:()=>query,in:()=>query,order:()=>query,range:a=>{start=a;return query},then:resolve=>Promise.resolve({data:start?[]:table==='purchase_workflow_documents'?[base]:table==='purchase_order_allocations'?allocations:[],error:null}).then(resolve)};return query},rpc(name,args){calls.push({name,args});return delay?new Promise(resolve=>pending.push(resolve)):Promise.resolve({data:'order',error:null})}}
  const app=mountPage('src/components/accounting/PurchaseWorkflowPage.tsx',{
    '@/src/hooks/useUser':{useUser:()=>({user:{id:profile.id},profile,loading:false})},
    '@/src/lib/supabase/client':{supabase:api},
    '@/src/components/pdf/purchase-workflow-pdf':{PurchaseWorkflowPdf:'PurchaseWorkflowPdf'},
    '@/src/components/pdf/PdfDownloadButton':{PdfDownloadButton:'PdfDownloadButton'},
    '@/src/components/ui/UnsavedChangesGuard':{UnsavedChangesGuard:'Guard',markFormSaved(){},requestFormNavigation(fn){fn()}},
    sonner:{toast:{success(){},error:v=>errors.push(v)}},
  },{exported:'PurchaseWorkflowPage',props:{kind:'Orden'}})
  await app.ready();await app.tick();app.render()
  app.button('OC-FIXTURE').props.onClick();app.render();await app.tick();app.render()
  return {app,calls,errors,pending,setProfile(p){profile=p;app.render()},cleanup(){app.cleanup()}}
}
test('real purchasing screen loads allocation rows and displays the actual remaining quantity',async()=>{
  const h=await mount({allocations:[{id:'allocation',order_id:'order',item_id:'line',quantity:1,is_active:true}]})
  try {assert.match(h.app.text(),/Pendiente de facturar: 2/)} finally {h.cleanup()}
})
test('real purchasing screen retries a failed command with the same request id', async () => {
  const h=await mount({delay:true})
  try {
    const edit=h.app.button('Editar · vuelve a borrador');edit.props.onClick();h.app.render()
    const editor=h.app.find(n=>typeof n.type==='function'&&n.type.name==='PurchaseWorkflowEditor')
    editor.props.onSave({kind:'Orden',items:base.items})
    assert.equal(h.calls.length,1)
    editor.props.onSave({kind:'Orden',items:base.items});assert.equal(h.calls.length,1)
    h.pending.shift()({data:null,error:{message:'Conexión interrumpida'}});await h.app.tick();h.app.render()
    const editorAgain=h.app.find(n=>typeof n.type==='function'&&n.type.name==='PurchaseWorkflowEditor')
    editorAgain.props.onSave({kind:'Orden',items:base.items})
    assert.equal(h.calls[0].args.p_request_id,h.calls[1].args.p_request_id)
    assert.equal(h.calls[0].args.p_revision,3)
    h.pending.shift()({data:'order',error:null});await h.app.tick()
  } finally {h.cleanup()}
})
test('role or identity change immediately hides old purchasing data and ignores late writes', async () => {
  const h=await mount({delay:true})
  try {
    const edit=h.app.button('Editar · vuelve a borrador');edit.props.onClick();h.app.render()
    h.app.find(n=>typeof n.type==='function'&&n.type.name==='PurchaseWorkflowEditor').props.onSave({kind:'Orden',items:base.items})
    h.setProfile({id:'other',tenant_id:'other',rol:'Finanzas',status:'Aprobado',is_active:true})
    assert.doesNotMatch(h.app.text(),/OC-FIXTURE/)
    h.pending.shift()({data:'order',error:null});await h.app.tick();h.app.render()
    assert.match(h.app.text(),/Solo Admin y Contabilidad/)
    assert.equal(h.errors.length,0)
  } finally {h.cleanup()}
})
