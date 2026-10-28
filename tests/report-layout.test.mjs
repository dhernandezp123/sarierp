import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {reportColumnWidths}=loadTs('src/lib/report-layout.ts')
test('columnas financieras distribuyen espacio restante sin rebasar el ancho imprimible',()=>{
 const columns=[{width:'18%'},{width:'18%'},...Array.from({length:11},()=>({}))]
 const widths=reportColumnWidths(columns).map(parseFloat)
 assert.ok(Math.abs(widths.reduce((sum,v)=>sum+v,0)-100)<1e-9)
 assert.ok(widths.slice(0,2).every(v=>Math.abs(v-18)<1e-9));assert.ok(widths[2]>5&&widths[2]<6)
 const malformed=reportColumnWidths([{width:'90%'},{width:'90%'},{}]).map(parseFloat)
 assert.ok(Math.abs(malformed.reduce((sum,v)=>sum+v,0)-100)<1e-9);assert.ok(malformed.every(v=>v>0))
})
