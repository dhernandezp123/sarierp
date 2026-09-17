import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

const { default: HouseBLPdf, getHblRouteValues, HBL_ROUTE_LABELS } = loadTs(
  'src/components/pdf/house-bl-pdf.tsx'
)

test('HBL separa la naviera de Vessel / Voy. No.', () => {
  const route = getHblRouteValues({
    carrier: 'COSCO',
    vessel_name: 'ZHONG HANG 937',
    voyage: '922S',
    port_of_discharge: 'Puerto Cortés',
    place_of_delivery: 'San Pedro Sula',
  })

  assert.equal(route.preCarriageBy, 'COSCO')
  assert.equal(HBL_ROUTE_LABELS.vesselVoyage, 'Vessel / Voy. No.')
  assert.equal(route.vesselVoyage, 'ZHONG HANG 937 / 922S')
})

test('HBL conserva destino final y etiqueta el puerto como Port of Discharge', () => {
  const route = getHblRouteValues({
    carrier: 'COSCO',
    vessel_name: 'ZHONG HANG 937',
    voyage: '922S',
    port_of_discharge: 'Puerto Cortés',
    place_of_delivery: 'San Pedro Sula',
  })

  assert.equal(HBL_ROUTE_LABELS.portOfDischarge, 'Port of Discharge')
  assert.equal(route.portOfDischarge, 'Puerto Cortés')
  assert.equal(route.placeOfDelivery, 'San Pedro Sula')
})

test('HBL corregido conserva el render de una pagina', async () => {
  const buffer = await renderer.renderToBuffer(
    React.createElement(HouseBLPdf, {
      bl: {
        status: 'Borrador',
        bl_number: 'SARI-HBL-20260917-001',
        carrier: 'COSCO',
        vessel_name: 'ZHONG HANG 937',
        voyage: '922S',
        port_of_discharge: 'Puerto Cortés',
        place_of_delivery: 'Puerto Cortés',
        containers: [],
      },
    })
  )

  assert.equal(buffer.subarray(0, 4).toString(), '%PDF')
  assert.equal((buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1)
})
