import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { serviceAssignmentCounts, serviceAssignmentStatus, eligibleServiceAccount, fiscalAccountVariant, pricingServiceReference } = loadTs('src/lib/service-accounting.ts')
const { draftItemPayload, draftEditorFromInvoice } = loadTs('src/lib/invoice-drafts.ts')
const account = (id,kind='Ingreso',patch={}) => ({id,code:id,name:'ADUANA',kind,active:true,postable:true,account_level:'Auxiliar',...patch})
const accounts = [account('I'),account('E'),account('C','Costo')]
const variant = (tax_variant,patch={}) => ({tax_variant,income_applicable:true,expense_applicable:true,income_account_id:tax_variant,expense_account_id:null,...patch})

test('pendientes cuenta conceptos únicos aunque falten ingreso, gasto y clasificación a la vez',()=>{
  assert.deepEqual(serviceAssignmentCounts([{variants:[]},{variants:[]}],accounts),{total:2,pending:2,income:2,expense:2,classification:2})
  const configured = [variant('I',{expense_account_id:'C'}),variant('E',{expense_applicable:false})]
  assert.deepEqual(serviceAssignmentCounts([{variants:configured},{variants:[variant('I'),variant('E')]}],accounts),{total:2,pending:1,income:0,expense:1,classification:0})
})
test('solo exige variantes seleccionadas y lados aplicables; no supone que toda cuenta final sea auxiliar',()=>{
  assert.equal(serviceAssignmentStatus([variant('I',{expense_applicable:false})],accounts).pending,false)
  assert.equal(eligibleServiceAccount(account('x','Ingreso',{account_level:'SubCuenta'}),'income'),false)
  for(const patch of [{active:false},{postable:false},{kind:'Gasto'}]) assert.equal(serviceAssignmentStatus([variant('I',{expense_applicable:false})],[account('I','Ingreso',patch)]).income,true)
  assert.equal(eligibleServiceAccount(account('G','Gasto'),'expense'),true)
  assert.equal(eligibleServiceAccount(account('A','Activo'),'expense'),false)
})
test('I, E y exonerada permanecen independientes incluso con nombres iguales',()=>{
  assert.equal(fiscalAccountVariant('Gravada',15),'I')
  assert.equal(fiscalAccountVariant('Exenta',15),'E')
  assert.equal(fiscalAccountVariant('Exonerada',0),'Exonerada')
  const rows = [variant('I',{expense_applicable:false}),variant('E',{expense_applicable:false}),variant('Exonerada',{income_account_id:null,expense_applicable:false})]
  assert.equal(serviceAssignmentStatus(rows,accounts).income,true)
  assert.equal(rows[0].income_account_id,'I'); assert.equal(rows[1].income_account_id,'E')
})
test('identificadores enlazan el cargo exacto; familia de flete nunca cae sobre cargos accesorios',()=>{
  const concepts=[{kind:'service',code:'bl',label:'Documentación'},{kind:'product',code:'miami_lcl',label:'Flete marítimo'}]
  assert.equal(pricingServiceReference('origin_charge:bl:uuid','origin_charge','miami_lcl',concepts)?.code,'bl')
  assert.equal(pricingServiceReference('miami_lcl_freight','freight','miami_lcl',concepts)?.kind,'product')
  for(const type of ['destination_charge','fee','insurance']) assert.equal(pricingServiceReference('unknown',type,'miami_lcl',concepts),undefined)
  assert.equal(pricingServiceReference('origin_charge:unknown:uuid','freight','miami_lcl',concepts),undefined)
  assert.equal(pricingServiceReference('bl','origin_charge','other',concepts)?.kind,'service')
})
test('borradores y sustituciones conservan referencia y cuenta histórica sin reclasificar por descripción',()=>{
  const line={id:'line',description:'Nombre comercial',quantity:'1',unit_price:'10',amount:10,isv_rate:0,tax_treatment:'Exenta',income_account_id:'E',service_catalog_kind:'service',service_catalog_code:'bl'}
  const payload=draftItemPayload([line])[0]
  assert.equal(payload.service_catalog_kind,'service');assert.equal(payload.service_catalog_code,'bl');assert.equal(payload.income_account_id,'E')
  const copy=draftEditorFromInvoice({currency:'HNL'},[line],{},'2026-10-29').items[0]
  assert.equal(copy.service_catalog_code,'bl');assert.equal(copy.income_account_id,'E');assert.equal(copy.tax_treatment,'Exenta')
})
