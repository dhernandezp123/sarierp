'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '../../lib/supabase/client'
import AppLayout from '../../components/layout/app-layout'
import { useUser } from '../../hooks/useUser'

export default function CostValidationPage() {
  const { profile } = useUser()
  const router = useRouter()

  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchQuotations()
  }, [])

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select(`
        *,
        clientes (
          nombre,
          codigo_cliente
        )
      `)
      .eq('status', 'Ganada')
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setQuotations(data || [])
    setLoading(false)
  }

  const getFinancialStatusBadge = (status: string) => {
    switch (status) {
      case 'Validado':
        return 'bg-green-100 text-green-700'
      case 'En revisión':
        return 'bg-yellow-100 text-yellow-700'
      case 'Pérdida confirmada':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  if (loading) {
    return <div className="p-8">Cargando validaciones...</div>
  }

  return (
    <AppLayout role={profile?.rol || 'Contabilidad'}>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold">
            Validación de Costos
          </h1>

          <p className="text-gray-500 mt-2">
            Valida los costos reales de proveedor contra las cotizaciones ganadas.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-bold mb-4">
            Cotizaciones Ganadas
          </h2>

          {quotations.length === 0 ? (
            <p className="text-gray-500">
              No hay cotizaciones ganadas pendientes de validar.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="p-3 text-left">No.</th>
                    <th className="p-3 text-left">Cliente</th>
                    <th className="p-3 text-left">Tipo</th>
                    <th className="p-3 text-left">Ruta</th>
                    <th className="p-3 text-left">Fecha</th>
                    <th className="p-3 text-left">Estado financiero</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {quotations.map((quote) => (
                    <tr key={quote.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-semibold">
                        {quote.quotation_number || 'Sin número'}
                      </td>

                      <td className="p-3">
                        {quote.clientes?.nombre || 'Sin cliente'}
                      </td>

                      <td className="p-3">
                        {quote.quote_type || 'N/A'}
                      </td>

                      <td className="p-3">
                        {quote.origen || 'N/A'} → {quote.destino || 'N/A'}
                      </td>

                      <td className="p-3">
                        {quote.created_at
                          ? new Date(quote.created_at).toLocaleDateString()
                          : 'N/A'}
                      </td>

                      <td className="p-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getFinancialStatusBadge(
                            quote.financial_validation_status || 'Pendiente'
                          )}`}
                        >
                          {quote.financial_validation_status || 'Pendiente'}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/cost-validation/${quote.id}`)
                          }
                          className="rounded-xl border px-4 py-2 font-semibold hover:bg-black hover:text-white"
                        >
                          Validar Costos
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
