import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {withMiamiInsurance}=loadTs('src/lib/miami-insurance.ts')
const {partitionInsuranceCoverage}=loadTs('src/lib/insurance-coverage.ts')
const settings={default_tax_rate:15,insurance_cost_rate_percent:0.28,insurance_included_service_patterns:['Ocean Freight','Air Freight','origin_charge'],insurance_excluded_service_patterns:['DTHC']}
const freight={rate_code:'miami_lcl_freight',description:'Flete Miami LCL',item_type:'freight',quantity:1,cost_amount:0,sale_amount:500}
const base={quotationId:'quote',items:[freight],required:true,commercialValue:10000,saleRatePercent:1,settings,createdBy:'seller'}
const close=(a,b)=>assert.ok(Math.abs(a-b)<0.000001,`${a} ≈ ${b}`)

test('Miami LCL y aéreo reconocen la póliza corporativa y crean un único seguro con costo, venta e ISV',()=>{
  for(const item of [freight,{...freight,rate_code:'miami_air_freight',description:'Flete Miami Aéreo Consolidado'}]){
    const result=withMiamiInsurance({...base,items:[item]})
    assert.equal(result.error,null);assert.equal(result.items.length,2)
    close(result.insurance.sale_amount,115.5);close(result.insurance.cost_amount,75)
    close(result.insurance.tax_amount,17.325);close(result.insurance.total_amount,132.825)
    assert.equal(result.insurance.quotation_id,'quote')
    assert.match(result.insurance.notes,/0.28%/)
    assert.match(result.insurance.notes,/Mínimo de seguro aplicado al costo: USD 75.00/)
  }
})

test('la cobertura respeta cantidades y exclusiones; no asegura el ISV ni el seguro anterior',()=>{
  const items=[{...freight,quantity:2,cost_amount:100},{rate_code:'DTHC',description:'DTHC',item_type:'origin_charge',quantity:1,sale_amount:999,cost_amount:888,tax_amount:100},
    {description:'Seguro de Carga',item_type:'Seguro',quantity:1,sale_amount:5000,cost_amount:5000}]
  const result=withMiamiInsurance({...base,items})
  close(result.insurance.sale_amount,121);close(result.insurance.cost_amount,75)
  assert.equal(result.items.filter(item=>item.item_type==='Seguro').length,1)
  assert.match(result.insurance.notes,/DTHC/)
  assert.equal(partitionInsuranceCoverage([freight],['Ocean Freight'],['Ocean Freight']).included.length,0)
})

test('mínimo USD75 y tasa fiscal cero explícita se conservan; sin solicitud no se añade seguro',()=>{
  const result=withMiamiInsurance({...base,commercialValue:1000,settings:{...settings,default_tax_rate:0}})
  assert.equal(result.insurance.sale_amount,75);assert.equal(result.insurance.cost_amount,75)
  assert.equal(result.insurance.tax_rate,0);assert.equal(result.insurance.tax_amount,0);assert.equal(result.insurance.total_amount,75)
  assert.deepEqual(withMiamiInsurance({...base,required:false,settings:null,commercialValue:0}).items,[freight])
})

test('no se produce una prima estimada con FOB, tasa, configuración o cobertura inválidos',()=>{
  for(const values of [{commercialValue:0},{commercialValue:NaN},{saleRatePercent:0},{saleRatePercent:Infinity},{settings:null},{settings:{...settings,insurance_cost_rate_percent:0}},{settings:{...settings,insurance_included_service_patterns:[]}}]){
    const result=withMiamiInsurance({...base,...values})
    assert.ok(result.error);assert.equal(result.insurance,null);assert.equal(result.items.length,1)
  }
})
