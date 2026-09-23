import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const salesPage = fs.readFileSync(
  'src/app/(protected)/ventas/page.tsx',
  'utf8'
)

test('Ventas usa las relaciones tenant canónicas para actividades comerciales', () => {
  assert.match(
    salesPage,
    /clientes!sales_activities_tenant_cliente_fkey\(nombre\)/
  )
  assert.match(
    salesPage,
    /profiles!sales_activities_tenant_created_by_fkey\(nombre, apellido\)/
  )
  assert.doesNotMatch(salesPage, /clientes\(nombre\), profiles\(nombre, apellido\)/)
  assert.equal(
    [...salesPage.matchAll(/\.select\(SALES_ACTIVITY_SELECT\)/g)].length,
    2
  )
})
