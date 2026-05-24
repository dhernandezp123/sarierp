'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { useUser } from '../../../hooks/useUser'
import { supabase } from '../../../lib/supabase/client'

type ShipmentCostValidationItem = {
  id: string
  routing_number: string | null
  booking_number: string | null
  carrier: string | null
  shipment_status: string | null
  quotation:
    | {
        id: string
        quotation_number: string | null
        status: string | null
        financial_validation_status: string | null
        cliente?: {
          nombre: string | null
        } | null
      }
    | null
}

export default function CostValidationPage() {
  const { profile, loading: userLoading } = useUser()
  const router = useRouter()
  const role = profile?.rol || ''
  const isAdmin = role === 'Admin'
  const isFinance = role === 'Finanzas' || role === 'Contabilidad'
  const canViewCostValidation = isAdmin || isFinance

  const [shipments, setShipments] = useState<ShipmentCostValidationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userLoading) return

    if (!canViewCostValidation) {
      setLoading(false)
      return
    }

    fetchShipments()
  }, [userLoading, canViewCostValidation])

  const AccessDenied = () => (
    <div className="rounded-2xl border bg-white p-8">
      <h1 className="text-2xl font-bold">Acceso restringido</h1>

      <p className="mt-2 text-gray-500">
        No tienes permiso para ver este modulo.
      </p>
    </div>
  )

  const fetchShipments = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('shipping_instructions')
      .select(`
        id,
        routing_number,
        booking_number,
        carrier,
        shipment_status,
        quotation:quotations (
          id,
          quotation_number,
          status,
          financial_validation_status,
          cliente:clientes (
            nombre
          )
        )
      `)
      .eq('quotation.status', 'Ganada')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    const normalizedShipments = (data || [])
      .map((shipment) => {
        const quotation = Array.isArray(shipment.quotation)
          ? shipment.quotation[0] ?? null
          : shipment.quotation

        return {
          ...shipment,
          quotation: quotation
            ? {
                ...quotation,
                cliente: Array.isArray(quotation.cliente)
                  ? quotation.cliente[0] ?? null
                  : quotation.cliente,
              }
            : null,
        }
      })
      .filter((shipment) => shipment.quotation && shipment.routing_number)

    setShipments(normalizedShipments)
    setLoading(false)
  }

  if (userLoading || loading) {
    return <div className="p-8">Cargando validaciones...</div>
  }

  if (!canViewCostValidation) {
    return <AccessDenied />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold">
          Validación de Costos Operativos
        </h1>

        <p className="mt-2 text-gray-500">
          Compara costos cotizados contra facturas reales de proveedores por
          operación.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">
          Operaciones con cotizacion ganada
        </h2>

        {shipments.length === 0 ? (
          <p className="text-gray-500">
            No hay operaciones con cotizacion ganada pendientes de validar.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="p-3 text-left">RT</th>
                  <th className="p-3 text-left">Booking</th>
                  <th className="p-3 text-left">Cotización</th>
                  <th className="p-3 text-left">Cliente</th>
                  <th className="p-3 text-left">Carrier</th>
                  <th className="p-3 text-left">Estado operativo</th>
                  <th className="p-3 text-left">Estado financiero</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>

              <tbody>
                {shipments.map((shipment) => {
                  const quotation = shipment.quotation

                  return (
                    <tr
                      key={shipment.id}
                      className="border-b hover:bg-slate-50"
                    >
                      <td className="p-3 font-semibold">
                        {shipment.routing_number || 'N/A'}
                      </td>

                      <td className="p-3">
                        {shipment.booking_number || 'Pendiente'}
                      </td>

                      <td className="p-3">
                        {quotation?.quotation_number || 'Sin número'}
                      </td>

                      <td className="p-3">
                        {quotation?.cliente?.nombre || 'Sin cliente'}
                      </td>

                      <td className="p-3">
                        {shipment.carrier || 'N/A'}
                      </td>

                      <td className="p-3">
                        {shipment.shipment_status || 'N/A'}
                      </td>

                      <td className="p-3">
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          {quotation?.financial_validation_status ||
                            'Pendiente'}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            quotation?.id &&
                            router.push(`/cost-validation/${quotation.id}`)
                          }
                          disabled={!quotation?.id}
                          className="rounded-xl border px-4 py-2 font-semibold hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Validar Costos
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
