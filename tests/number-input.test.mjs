import test from 'node:test'
import assert from 'node:assert/strict'
import {mountPage} from './page-harness.mjs'

function mountNumeric(initial,normalize=value=>Number(value)) {
 const events=[],props={value:initial,min:0,step:0.0001,'aria-label':'Importe',onChange:event=>{events.push(event.target.value);props.value=normalize(event.target.value)}}
 const app=mountPage('src/components/ui/NumberInput.tsx',{}, {exported:'NumberInput',props})
 app.render()
 const input=()=>app.find(n=>n.type==='input')
 const type=value=>{input().props.onChange({target:{value}});app.render()}
 return {app,props,events,input,type}
}
test('se puede borrar el cero aunque el formulario convierta vacío a 0 en cada cambio',()=>{
 const f=mountNumeric(0)
 try {f.type('');assert.equal(f.props.value,0);assert.equal(f.input().props.value,'')
  f.type('2');f.type('25');f.type('25.3');assert.equal(f.props.value,25.3);assert.equal(f.input().props.value,'25.3')
  assert.deepEqual(f.events,['','2','25','25.3'])
 }finally{f.app.cleanup()}
})
test('preserva decimales y ceros escritos durante la edición; al salir muestra el valor normalizado',()=>{
 const f=mountNumeric(0)
 try{for(const value of ['','0','0.','0.2','0.28','0.2800'])f.type(value)
  assert.equal(f.props.value,0.28);assert.equal(f.input().props.value,'0.2800')
  f.input().props.onBlur({target:{value:'0.2800'}});f.app.render();assert.equal(f.input().props.value,'0.28')
  f.type('0');f.input().props.onBlur({target:{value:'0'}});f.app.render();assert.equal(f.input().props.value,'0')
 }finally{f.app.cleanup()}
})
test('acepta un valor externo diferente y conserva contratos nativos de validación y lectura',()=>{
 const f=mountNumeric(1)
 try{f.type('2');f.props.value=26.75;f.app.render();assert.equal(f.input().props.value,'26.75')
  assert.equal(f.input().props.type,'number');assert.equal(f.input().props.min,0);assert.equal(f.input().props.step,0.0001)
  f.type('');f.props.disabled=true;f.app.render();assert.equal(f.input().props.value,'0');assert.equal(f.input().props.disabled,true)
  f.props.disabled=false;f.props.readOnly=true;f.app.render();assert.equal(f.input().props.readOnly,true)
 }finally{f.app.cleanup()}
})
test('permite vacío en padres de texto y pasa el valor original al perder el foco',()=>{
 const f=mountNumeric('0',value=>value);let blurred
 try{f.props.onBlur=event=>{blurred=event.target.value};f.app.render();f.type('');assert.equal(f.input().props.value,'')
  f.input().props.onBlur({target:{value:''}});f.app.render();assert.equal(blurred,'');assert.equal(f.input().props.value,'')
 }finally{f.app.cleanup()}
})
