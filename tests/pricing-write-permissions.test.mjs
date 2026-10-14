import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { canManageClientRates, canAccessPath } = loadTs('src/lib/permissions.ts')

test('consultar clientes no permite modificar sus tarifas por defecto', () => {
  for (const role of ['Admin', 'Pricing', 'Ventas']) assert.equal(canManageClientRates(role), true)
  for (const role of ['Operaciones', 'Contabilidad', 'Finanzas']) {
    assert.equal(canAccessPath(role, '/clientes'), role === 'Operaciones')
    assert.equal(canManageClientRates(role), false)
  }
  for (const role of ['Cliente', 'Desconocido', '', null, undefined]) {
    assert.equal(canManageClientRates(role), false)
  }
})

test('vencimientos delegan reserva y avisos a una sola RPC y propagan fallos', async () => {
  const calls = []
  const failure = new Error('RPC no disponible')
  let error = null
  const { checkAndNotifyExpiredTarifas } = loadTs('src/lib/tarifa-expiry-check.ts', {
    '@/src/lib/supabase/client': { supabase: {
      rpc: async (name, args) => { calls.push({ name, args }); return { error } },
      from: () => { throw new Error('El navegador no debe reservar tarifas ni escribir avisos separados') },
    } },
  })
  await checkAndNotifyExpiredTarifas()
  assert.deepEqual(calls, [{ name: 'notify_expired_agent_quotes_for_current_tenant', args: undefined }])
  error = failure
  await assert.rejects(checkAndNotifyExpiredTarifas, (value) => value === failure)
})
