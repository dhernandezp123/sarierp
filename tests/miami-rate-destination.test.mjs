import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'
const { selectMiamiDestinationRates, hasMiamiFreightRates } = loadTs('src/lib/miami-rate-destination.ts')
const catalogs = loadTs('src/lib/pricing-catalogs.ts')
const { defaultClientRateCatalog } = catalogs
const row = (code, destination, amount) => ({cliente_id:'client',rate_code:code,miami_rate_destination:destination,amount,rate_label:code,category:'Freight',currency:'USD',unit:'KG',is_active:true,notes:null})
const rates = [row('consolidado_aereo_kg','TGU',4),row('consolidado_aereo_kg','SPS',3),row('documentos_manejo',null,50),
  ...['lcl_maritimo_sps_ft3','lcl_maritimo_sps_lbs','small_maritimo_min_lcl_1000_lbs_45_ft3','minimo_maritimo_2mil_lbs_90_ft3'].flatMap(code=>[row(code,'SPS',2),row(code,'TGU',5)])]

test('destinations never mix, globals stay shared and explicit rates win independently of order', () => {
  for (const source of [rates,[...rates].reverse()]) {
    assert.equal(selectMiamiDestinationRates(source,'SPS').find(r=>r.rate_code==='consolidado_aereo_kg').amount,3)
    assert.equal(selectMiamiDestinationRates(source,'TGU').find(r=>r.rate_code==='consolidado_aereo_kg').amount,4)
    assert.equal(selectMiamiDestinationRates(source,'TGU').find(r=>r.rate_code==='documentos_manejo').amount,50)
  }
  const mixed=[row('x',null,10),row('x','TGU',0),row('y','SPS',99)]
  assert.equal(selectMiamiDestinationRates(mixed,'TGU').find(r=>r.rate_code==='x').amount,0)
  assert.equal(selectMiamiDestinationRates(mixed.reverse(),'TGU').find(r=>r.rate_code==='x').amount,0)
  assert.equal(selectMiamiDestinationRates(mixed,'TGU').some(r=>r.rate_code==='y'),false)
  assert.equal(hasMiamiFreightRates(selectMiamiDestinationRates(rates.filter(r=>r.miami_rate_destination!=='TGU'),'TGU'),'miami_air'),false)
  assert.equal(hasMiamiFreightRates(selectMiamiDestinationRates(rates,'TGU'),'miami_lcl'),true)
  const lcl=selectMiamiDestinationRates(rates,'TGU').map(r=>({...r,amount:r.rate_code==='lcl_maritimo_sps_ft3'?5:0}))
  assert.equal(hasMiamiFreightRates(lcl,'miami_lcl'),true,'An explicit zero minimum or per-pound rate remains valid')
  assert.equal(hasMiamiFreightRates(lcl.filter(r=>r.rate_code!=='minimo_maritimo_2mil_lbs_90_ft3'),'miami_lcl'),false)
})

function mountMiami(props, responses = {}) {
  const requests=[]
  const client={from(table){const q={select(){return q},eq(){return q},order(){return q},then(resolve,reject){requests.push(table);return (responses[table] || Promise.resolve({data:table==='client_rates'?rates:[],error:null})).then(resolve,reject)}};return q}}
  const page=mountPage('src/hooks/useMiamiQuotation.ts',{
    '@/src/lib/supabase/client':{supabase:client},
    '@/src/lib/company-settings':{loadCurrentCompanySettings:async()=>({data:{default_tax_rate:15}})},
    '@/src/lib/pricing-catalogs':{...catalogs,defaultClientRateCatalog,fetchActiveClientRateCatalog:async()=>defaultClientRateCatalog},
  },{exported:'useMiamiQuotation',props})
  return {page,requests}
}
const params=()=>({clienteId:'client',serviceProduct:'miami_air',rateDestination:'SPS',incoterm:'FOB',totalCargoFt3:100,totalCargoCbm:1,totalCargoWeight:220.462})

test('real Miami hook switches air and LCL rates without writing or refetching the client profile', async () => {
  const props=params(),{page,requests}=mountMiami(props)
  try {
    await page.ready(); page.render()
    assert.equal(page.render().canUseMiamiCalculator,true)
    assert.equal(page.render().getClientRateAmount('consolidado_aereo_kg'),3)
    const before=page.render().airEstimated
    props.rateDestination='TGU'
    assert.equal(page.render().getClientRateAmount('consolidado_aereo_kg'),4)
    assert.ok(page.render().airEstimated>before)
    assert.equal(requests.filter(t=>t==='client_rates').length,1)
    props.serviceProduct='miami_lcl';page.render();await page.tick();page.render()
    assert.equal(page.render().miamiLclResult.ft3Amount,500)
    props.rateDestination='SPS';page.render()
    assert.equal(page.render().miamiLclResult.ft3Amount,200)
    props.clienteId='other'
    assert.equal(page.render().canUseMiamiCalculator,false)
    assert.deepEqual(page.render().clientRates,[])
  } finally {page.cleanup()}
})

test('missing destination and failed rate read cannot enable the calculator',async()=>{
  for(const response of [{data:rates.filter(r=>r.miami_rate_destination==='SPS'),error:null},{data:rates,error:{message:'offline'}}]){
    const props={...params(),rateDestination:'TGU'}, {page}=mountMiami(props,{client_rates:Promise.resolve(response)})
    try {await page.ready();assert.equal(page.render().canUseMiamiCalculator,false)} finally {page.cleanup()}
  }
})

test('rates recover after retry and ignore the previous client response',async()=>{
  const responses={client_rates:Promise.resolve({data:null,error:{message:'offline'}})},props=params()
  const {page}=mountMiami(props,responses)
  try {
    await page.ready();assert.ok(page.render().ratesError)
    responses.client_rates=Promise.resolve({data:rates,error:null})
    page.render().reloadClientRates();page.render();await page.tick()
    assert.equal(page.render().canUseMiamiCalculator,true)
    let oldResolve,newResolve
    responses.client_rates=new Promise(resolve=>{oldResolve=resolve})
    props.clienteId='old';page.render()
    responses.client_rates=new Promise(resolve=>{newResolve=resolve})
    props.clienteId='new';page.render()
    oldResolve({data:rates,error:null});await page.tick()
    assert.equal(page.render().canUseMiamiCalculator,false)
    newResolve({data:rates,error:null});await page.tick()
    assert.equal(page.render().canUseMiamiCalculator,true)
  } finally {page.cleanup()}
})

test('real client profile edits TGU without changing SPS preference, protects unsaved changes and uses the atomic rates RPC',async()=>{
  const calls=[],reads=[]
  const client={from(table){let single=false,destination='SPS';const q=new Proxy({},{get(_t,key){
    if(key==='then')return(resolve,reject)=>{
      if(table==='client_rates')reads.push(destination)
      const data=table==='clientes'?(single?{id:'client',nombre:'Cliente ficticio',preferred_miami_rate_destination:'SPS'}:[]):table==='client_rates'?rates.filter(r=>!r.miami_rate_destination||r.miami_rate_destination===destination):[]
      return Promise.resolve({data,error:null}).then(resolve,reject)
    }
    if(key==='single')return()=>{single=true;return q}
    if(key==='or')return value=>{destination=value.endsWith('TGU')?'TGU':'SPS';return q}
    if(['update','insert','delete'].includes(key))throw Error('Client profile must not mutate the client preference')
    return()=>q
  }});return q},rpc:async(name,args)=>{calls.push({name,args});return{data:1,error:null}}}
  const page=mountPage('src/app/(protected)/clientes/[id]/page.tsx',{
    '../../../../hooks/useUser':{useUser:()=>({profile:{id:'admin',rol:'Admin'}})},
    '../../../../lib/supabase/client':{supabase:client},'@/src/lib/supabase/client':{supabase:client},
    '@/src/hooks/useClientRateAccess':{useClientRateAccess:()=>({hasIndividualAccess:true})},
    '@/src/components/clientes/ClientRateHistory':{ClientRateHistory:'History'},
    'next/navigation':{useParams:()=>({id:'client'}),useRouter:()=>({push(){}})},
    '@/src/lib/pricing-catalogs':{...catalogs,fetchActiveClientRateCatalog:async()=>defaultClientRateCatalog},
  })
  const selector=()=>page.find(n=>n.props?.['aria-label']==='Tarifario del cliente')
  try {
    await page.ready();page.button('Tarifas').props.onClick();page.render()
    assert.equal(selector().props.value,'SPS')
    selector().props.onChange({target:{value:'TGU'}});page.render();await page.tick();page.render()
    assert.equal(selector().props.value,'TGU')
    const amount=page.find(n=>n.type==='input'&&Number(n.props.value)===4)
    assert.ok(amount);amount.props.onChange({target:{value:'4.5'}});page.render()
    selector().props.onChange({target:{value:'SPS'}});page.render()
    const confirmation=page.find(n=>n.type==='ConfirmDialog'&&n.props.title==='Cambiar de tarifario')
    assert.equal(confirmation.props.open,true)
    assert.equal(selector().props.value,'TGU')
    confirmation.props.onOpenChange(false);page.render()
    await page.button('Guardar tarifas').props.onClick();page.render()
    assert.equal(calls[0].name,'replace_client_rates')
    assert.equal(calls[0].args.p_destination,'TGU')
    assert.equal(calls[0].args.p_rows.find(r=>r.rate_code==='consolidado_aereo_kg').amount,4.5)
    assert.equal(calls[0].args.p_rows.some(r=>r.rate_code==='documentos_manejo'),false)
    assert.deepEqual(calls[0].args.p_destination_rate_codes,['consolidado_aereo_kg'])
    assert.deepEqual(calls[0].args.p_global_rate_codes,[])
    assert.equal(calls[0].args.p_rows.length,1)
    assert.deepEqual(reads,['SPS','TGU','TGU'])
  }finally{page.cleanup()}
})
