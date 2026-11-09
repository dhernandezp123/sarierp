import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { searchRecords, searchPattern } = loadTs('src/lib/global-search.ts')
function clientMock(fail = '') {
  const calls = []
  return { calls, from(table) {
    const call = {table}; calls.push(call)
    const request = {
      select(value) { call.select = value; return this },
      eq(field,value) { call[field] = value; return this },
      or(value) { call.filter = value; return this },
      is(field,value) { call[field] = value; return this },
      order() { return this }, limit() { return this },
      async abortSignal() { return table === fail ? {error: {message:'denied'}} : {data:[{id:'one',quotation_number:'COT-abc',name:'abc',shipping_instruction_id:'si'}]} },
    }; return request
  }}
}
const signal = new AbortController().signal
test('literal filters escape quotes, wildcards and backslashes', () => {
  assert.equal(searchPattern('a%_'), '"%a\\%\\_%"')
  assert.equal(searchPattern('a"b'), '"%a\\"b%"')
  assert.equal(searchPattern('a\\b'), '"%a\\\\b%"')
})
test('search is tenant scoped, preserves RLS client and excludes forbidden modules', async () => {
  const client = clientMock()
  const result = await searchRecords(client, 'abc', 'Ventas', 'tenant-one', signal)
  assert.ok(client.calls.every(call => call.tenant_id === 'tenant-one'))
  assert.ok(!client.calls.some(call => ['bookings','invoices','suppliers'].includes(call.table)))
  assert.ok(result.results.some(row => row.href === '/quotations/one'))
  assert.equal(client.calls.find(c=>c.table==='quotations').deleted_at,null)
})
test('pricing opens its existing comparison and partial failure stays explicit', async () => {
  const client = clientMock('agents')
  const result = await searchRecords(client, 'abc', 'Pricing', 'tenant', signal)
  assert.ok(result.results.some(row => row.href === '/pricing-comparison?quotation=one'))
  assert.deepEqual(result.failed,['Agente'])
})
test('short queries and unknown roles never query tables', async () => {
  const client = clientMock()
  await searchRecords(client, 'a', 'Admin', 'tenant', signal)
  await searchRecords(client, 'abc', 'Unknown', 'tenant', signal)
  assert.equal(client.calls.length,0)
})
