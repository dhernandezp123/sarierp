import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {depreciationSchedule}=loadTs('src/lib/fixed-assets.ts')
test('depreciación mensual concilia centavos con costo y residual',()=>{
 const amounts=depreciationSchedule(100,1,7)
 assert.deepEqual(amounts,[14.14,14.15,14.14,14.14,14.14,14.15,14.14])
 assert.equal(amounts.reduce((s,a)=>s+Math.round(a*100),0),9900)
 assert.deepEqual(depreciationSchedule(1,1,2),[0,0])
 assert.deepEqual(depreciationSchedule(0.01,0,3),[0,0.01,0])
})
test('no calcula bases o vida útil inválidas',()=>{
 for(const input of [[0,0,12],[NaN,0,12],[10,-1,12],[10,11,12],[10,0,0],[10,0,1.5],[10,0,1201]])assert.deepEqual(depreciationSchedule(...input),[])
})
