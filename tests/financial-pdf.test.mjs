import test from 'node:test'
import assert from 'node:assert/strict'
import {inflateSync} from 'node:zlib'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'
const {ReportPdf}=loadTs('src/components/pdf/report-pdf.tsx',{'@react-pdf/renderer':renderer})
test('PDF financiero real conserva fila 505, columnas dentro de página y firmas en la última página',async()=>{
 const columns=[{key:'party',label:'Cliente',width:'18%'},{key:'reference',label:'Documento',width:'18%'},...Array.from({length:10},(_,i)=>({key:'v'+i,label:'Valor '+i,format:'money'}))]
 const data={complete:true,title:'Cartera ficticia',subtitle:'Validación',filters:[],metrics:[],columns,rows:Array.from({length:505},(_,i)=>({party:'Cliente ficticio',reference:`FIN${String(i+1).padStart(4,'0')}`,...Object.fromEntries(Array.from({length:10},(_,j)=>['v'+j,1234.56]))})),signatures:[{label:'Elaborado por',name:'Contador ficticio',role:'Contador General'},{label:'Revisado por',name:'Gerencia ficticia',role:'Gerencia General'}]}
 let layout;const element=React.cloneElement(ReportPdf({data,company:{legal_name:'Empresa ficticia',trade_name:'Empresa ficticia',primary_color:'#B3282D'}}),{onRender:r=>{layout=r._INTERNAL__LAYOUT__DATA_}})
 const buffer=await renderer.renderToBuffer(element);assert.equal(buffer.subarray(0,4).toString(),'%PDF');assert.ok(layout.children.length>1)
 const streams=[...buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(([,s])=>{try{return inflateSync(Buffer.from(s,'latin1')).toString('latin1')}catch{return ''}}).join('\n')
 const decoded=[...streams.matchAll(/<([a-f0-9]+)>/gi)].map(([,hex])=>Buffer.from(hex,'hex').toString('latin1')).join('')
 assert.match(decoded,/FIN0505/);assert.match(decoded,/Contador ficticio/);assert.match(decoded,/Gerencia ficticia/)
 // Rotated sandbox watermarks intentionally extend past the page background.
 // Business columns and signatures must remain within the printable page.
 function walk(node,left=0){if(node.style?.transform)return;const x=left+(node.box?.left||0);if(node.type==='TEXT'&&node.box)assert.ok(x+node.box.width<=792-20,`Texto fuera de página: ${x+node.box.width}`);for(const child of node.children||[])walk(child,x)}
 for(const page of layout.children)walk(page)
 const text=node=>String(node.value||'')+(node.children||[]).map(text).join('')
 assert.match(text(layout.children.at(-1)),/Contador ficticio/);assert.match(text(layout.children.at(-1)),/Gerencia ficticia/)
})
