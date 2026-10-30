import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'
function setup({blocked=false}={}){
 const prior={window:globalThis.window,create:URL.createObjectURL,revoke:URL.revokeObjectURL},events=[],errors=[],timers=new Map(),intervals=new Map(),listeners={}
 let renderer=async()=>new Blob(['PDF']),n=0
 const tab={closed:false,opener:{},close(){this.closed=true;events.push('close')},focus(){events.push('focus')},print(){events.push('print')},location:{replace:url=>events.push(['navigate',url])},addEventListener:(name,fn)=>{listeners[name]=fn}}
 globalThis.window={open(){events.push('open');return blocked?null:tab},setTimeout:fn=>{timers.set(++n,fn);return n},clearTimeout:id=>timers.delete(id),setInterval:fn=>{intervals.set(++n,fn);return n},clearInterval:id=>intervals.delete(id)}
 URL.createObjectURL=()=>{events.push('blob');return 'blob:synthetic'};URL.revokeObjectURL=url=>events.push(['revoke',url])
 const app=mountPage('src/components/pdf/PdfPrintButton.tsx',{'@react-pdf/renderer':{pdf:()=>{events.push('pdf');return{toBlob:()=>renderer()}}},sonner:{toast:{error:msg=>errors.push(msg)}}},{exported:'PdfPrintButton',props:{document:{type:'Document',props:{}},children:'Imprimir'}})
 app.render()
 return{app,tab,events,errors,listeners,timers,intervals,setRenderer:fn=>renderer=fn,click:()=>app.find(n=>n.type==='button').props.onClick(),cleanup(){app.cleanup();globalThis.window=prior.window;URL.createObjectURL=prior.create;URL.revokeObjectURL=prior.revoke}}
}
test('reserva pestaña antes del PDF, bloquea doble clic y conserva visor al cerrar modal',async()=>{
 const f=setup();try{assert.deepEqual(f.events,[]);let finish;f.setRenderer(()=>new Promise(r=>finish=r));const running=f.click();await f.click();assert.deepEqual(f.events,['open','pdf']);assert.equal(f.tab.opener,null);finish(new Blob(['PDF']));await running;assert.deepEqual(f.events.slice(-2),['blob',['navigate','blob:synthetic']]);f.listeners.load();assert.deepEqual(f.events.slice(-2),['focus','print']);f.app.cleanup();assert.equal(f.tab.closed,false);assert.ok(!f.events.some(e=>Array.isArray(e)&&e[0]==='revoke'));f.tab.closed=true;for(const fn of [...f.intervals.values()])fn();assert.ok(f.events.some(e=>Array.isArray(e)&&e[0]==='revoke'))}finally{f.cleanup()}
})
test('popup bloqueado no genera PDF y error de render cierra pestaña',async()=>{
 const blocked=setup({blocked:true});try{await blocked.click();assert.deepEqual(blocked.events,['open']);assert.equal(blocked.errors.length,1)}finally{blocked.cleanup()}
 const f=setup();try{f.setRenderer(async()=>{throw Error('render error')});await f.click();assert.equal(f.tab.closed,true);assert.equal(f.errors.length,1);assert.ok(!f.events.includes('blob'))}finally{f.cleanup()}
})
test('desmontaje durante generacion no deja pestaña vacia ni crea URL',async()=>{
 const f=setup();try{let finish;f.setRenderer(()=>new Promise(r=>finish=r));const pending=f.click();f.app.cleanup();finish(new Blob(['PDF']));await pending;assert.equal(f.tab.closed,true);assert.ok(!f.events.includes('blob'))}finally{f.cleanup()}
})
