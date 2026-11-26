import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { benefitWindows, benefitRows } = loadTs('src/lib/hr-benefits.ts')
test('benefit input windows match PostgreSQL clamped month arithmetic, hire limit and fiscal bonus years', () => {
 assert.deepEqual(benefitWindows('2020-01-01','2026-11-23'),{average:{start:'2026-05-24',end:'2026-11-23'},bonus13:{start:'2026-01-01',end:'2026-11-23'},bonus14:{start:'2026-07-01',end:'2026-11-23'}})
 assert.equal(benefitWindows('2020-01-01','2024-08-30').average.start,'2024-02-29')
 assert.equal(benefitWindows('2026-11-01','2026-11-23').average.start,'2026-11-01')
 assert.equal(benefitWindows('2020-01-01','2026-06-30').bonus14.start,'2025-07-01')
 assert.equal(benefitWindows('2020-01-01','2026-07-01').bonus14.start,'2026-07-01')
 assert.throws(()=>benefitWindows('2026-02-30','2026-11-23'))
 assert.throws(()=>benefitWindows('2026-12-01','2026-11-23'))
})
test('monthly evidence rows cover an exact partial window without guessing salary or actual worked days', () => {
 const rows=benefitRows('2024-02-29','2024-04-02',true)
 assert.deepEqual(rows.map(r=>[r.start,r.end]),[['2024-02-29','2024-02-29'],['2024-03-01','2024-03-31'],['2024-04-01','2024-04-02']])
 assert.ok(rows.every(r=>r.ordinary===''&&r.worked_days===''&&r.source===''))
 assert.equal(benefitRows('2024-02-01','2024-02-29',false)[0].worked_days,'0')
})
