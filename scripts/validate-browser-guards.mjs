// Requires the isolated fixture app at 3116 and a fresh Chrome/Edge CDP profile
// at 9237. See docs/uat/audit-browser-rehearsal.md. No production credentials.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const base = 'http://127.0.0.1:3116'
const pages = await (await fetch('http://127.0.0.1:9237/json/list')).json()
const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let nextId = 0
const pending = new Map(), checks = [], requests = [], errors = []
let beforeUnload = 0, leadOutcome = 'success'
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')) }, 45000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
socket.addEventListener('message', async ({ data }) => {
  const message = JSON.parse(data)
  if (message.id) {
    const call = pending.get(message.id); pending.delete(message.id)
    if (message.error) call?.reject(Error(message.error.message))
    else call?.resolve(message.result)
  } else if (message.method === 'Fetch.requestPaused') {
    const { request, requestId } = message.params
    requests.push({ method: request.method, path: new URL(request.url).pathname })
    const lead = request.url.includes('/api/demo-request') && request.method === 'POST'
    await send('Fetch.fulfillRequest', { requestId, responseCode: lead && leadOutcome === 'success' ? 202 : lead ? 503 : 200,
      responseHeaders: [{ name:'Content-Type', value:'application/json' }, { name:'Access-Control-Allow-Origin', value:'*' },
        { name:'Access-Control-Allow-Headers', value:'*' }, { name:'Access-Control-Allow-Methods', value:'GET,POST,OPTIONS' }],
      body: Buffer.from(lead ? JSON.stringify(leadOutcome === 'failure' ? { error:'Synthetic network failure' } : { ok:true }) : '[]').toString('base64') })
  } else if (message.method === 'Page.javascriptDialogOpening') {
    if (message.params.type === 'beforeunload') beforeUnload++
    await send('Page.handleJavaScriptDialog', { accept:false })
  } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
})
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true })
  if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
  return response.result.value
}
async function until(expression, label) {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    if (await evaluate(`document.documentElement.dataset.auditPath === location.pathname && Boolean(${expression})`)) return
    await pause(150)
  }
  throw Error('Browser assertion timed out: ' + label)
}
async function click(selector) {
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), true, selector)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  await pause(250)
}
async function button(label) {
  assert.equal(await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)}); button?.click();return !!button })()`), true, label)
  await pause(250)
}
async function edit(selector, value) {
  await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)});input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await pause(250)
}
const dialog = "Boolean(document.querySelector('[role=dialog]'))"
function pass(name) { checks.push(name); console.log('PASS ' + name) }

try {
  await send('Runtime.enable'); await send('Page.enable')
  await send('Fetch.enable', { patterns:[{ urlPattern:'http://127.0.0.1:59999/*' }, { urlPattern:base + '/api/demo-request' }] })
  await send('Page.navigate', { url:base + '/away' })
  await until("location.origin==='http://127.0.0.1:3116' && document.readyState==='complete' && document.querySelector('#away')", 'fixture ready')
  await click('nav a[href="/guard"]'); await until("document.querySelector('#inside')", 'guard hydrated')
  await edit('#outside','synthetic filter')
  await click('nav a[href="/away"]'); await until("location.pathname==='/away' && document.querySelector('#away')", 'unrelated input does not block')
  pass('unrelated controls do not mark the form dirty')
  await click('nav a[href="/guard"]'); await until("document.querySelector('#inside')", 'guard remounted')
  await edit('#inside','synthetic draft')
  await click('nav a[href="/away"]'); await until(dialog,'sidebar blocked')
  await button('Seguir editando')
  assert.equal(await evaluate('location.pathname'), '/guard')
  assert.equal(await evaluate("document.querySelector('#inside').value"), 'synthetic draft')
  await click('#cancel'); await until(dialog,'cancel button blocked'); await button('Seguir editando')
  await click('#failed'); await click('nav a[href="/away"]'); await until(dialog,'failed save stays dirty'); await button('Seguir editando')
  pass('links, cancel button and failed save preserve the edited form')
  await evaluate('history.back()'); await until(dialog,'browser Back blocked')
  await button('Seguir editando'); assert.equal(await evaluate('location.pathname'), '/guard')
  await evaluate('history.back()'); await until(dialog,'Back asks again'); await button('Salir sin guardar')
  await until("location.pathname==='/away' && document.querySelector('#away')",'exact previous history entry')
  pass('browser Back can be cancelled and confirmed without losing history')
  await click('nav a[href="/guard"]'); await until("document.querySelector('#inside')",'saved form ready')
  await edit('#inside','confirmed draft'); await click('#saved'); await click('nav a[href="/away"]')
  await until("location.pathname==='/away' && document.querySelector('#away')",'confirmed save clears guard')
  pass('confirmed save allows navigation')
  await click('nav a[href="/manual"]'); await until("document.querySelector('input[type=text]')", 'manual editor ready')
  await edit('input[type=text]', 'AUD-SYNTHETIC-INVOICE')
  await click('nav a[href="/away"]'); await until(dialog,'manual editor blocks sidebar'); await button('Seguir editando')
  assert.equal(await evaluate("document.querySelector('input[type=text]').value"),'AUD-SYNTHETIC-INVOICE')
  await button('Nueva factura'); await until(dialog,'manual replacement dialog')
  assert.match(await evaluate("document.querySelector('[role=dialog]').textContent"), /sin guardar|reemplazar|cambios/i)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'})
  await pause(250)
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'manual editor mobile overflow')
  pass('manual editor preserves its document, sidebar guard and replacement dialog at mobile width')
  await click('nav a[href="/landing"]'); await until(dialog,'leave manual document'); await button('Salir sin guardar')
  await until("document.querySelector('#demo-nombre')",'demo form ready')
  await evaluate("window.auditMeasurements=[];window.addEventListener('sari:measurement',event=>window.auditMeasurements.push(event.detail))")
  await edit('#demo-nombre','Synthetic person'); await edit('#demo-empresa','Synthetic company'); await edit('#demo-email','audit@example.invalid')
  leadOutcome='failure'
  await evaluate("document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
  await until("document.body.innerText.includes('No se pudo enviar')",'intercepted failure')
  assert.equal(await evaluate("document.querySelector('#demo-email').value"),'audit@example.invalid')
  leadOutcome='success'
  await evaluate("document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
  await until("document.body.textContent.includes('Solicitud registrada')",'intercepted confirmed request')
  assert.equal(requests.filter(request=>request.path==='/api/demo-request'&&request.method==='POST').length,2)
  const measurements=await evaluate('window.auditMeasurements')
  assert.ok(measurements.some(row=>row.name==='demo_submit'&&row.stage==='failed'))
  assert.ok(measurements.some(row=>row.name==='demo_submit'&&row.stage==='succeeded'))
  assert.doesNotMatch(JSON.stringify(measurements),/Synthetic|example.invalid/)
  pass('demo failure/retry/double click and measurements use intercepted requests without PII')
  assert.deepEqual(errors,[])
  const version=await send('Browser.getVersion')
  fs.mkdirSync('.ua/intermediate',{recursive:true})
  fs.writeFileSync('.ua/intermediate/audit-browser-results.json',JSON.stringify({ measured_at:new Date().toISOString(), browser:version.product,
    scope:'Real components in isolated fixture; no authenticated production UAT',checks, beforeUnload, requests:requests.length, measurements },null,2)+'\n')
} catch (error) {
  console.error(JSON.stringify({ browser_errors:errors, state:await evaluate('({path:location.pathname,ready:document.readyState,hydrated:document.documentElement.dataset.auditPath})') }))
  throw error
} finally { await send('Fetch.disable'); socket.close() }
