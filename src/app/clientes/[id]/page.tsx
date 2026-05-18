'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { supabase } from '../../../lib/supabase/client'
import AppLayout from '../../../components/layout/app-layout'
import { useUser } from '../../../hooks/useUser'

export default function ClienteProfilePage() {
  const { profile } = useUser()
  const params = useParams()
  const router = useRouter()

  const [cliente, setCliente] = useState<any>(null)
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchCliente()
      fetchQuotations()
    }
  }, [params.id])

  const fetchCliente = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', params.id as string)
      .single()

    if (error) {
      alert(error.message)
      return
    }

    setCliente(data)
    setLoading(false)
  }

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('cliente_id', params.id as string)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setQuotations(data || [])
  }

  if (loading) {
    return <div className="p-8">Cargando cliente...</div>
  }

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/clientes')}
          className="rounded-xl border px-4 py-2 font-semibold"
        >
          Volver a clientes
        </button>

        <div>
          <h1 className="text-4xl font-bold">
            {cliente?.nombre}
          </h1>

          <p className="text-gray-500 mt-2">
            Perfil comercial del cliente
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">Código</p>
            <p className="font-bold">{cliente?.codigo_cliente || 'N/A'}</p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">RTN / NIT / RUC</p>
            <p className="font-bold">
              {cliente?.rtn || cliente?.nit || cliente?.ruc || 'N/A'}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">Condición de pago</p>
            <p className="font-bold">
              {cliente?.condicion_pago ||
                cliente?.payment_terms ||
                'Contado'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-bold mb-4">
            Información del Cliente
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{cliente?.email_1 || 'N/A'}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Teléfono</p>
              <p className="font-medium">{cliente?.telefono || 'N/A'}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Ciudad</p>
              <p className="font-medium">{cliente?.ciudad || 'N/A'}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">País</p>
              <p className="font-medium">{cliente?.pais || 'N/A'}</p>
            </div>

            <div className="md:col-span-2">
              <p className="text-sm text-gray-500">Dirección</p>
              <p className="font-medium">{cliente?.direccion || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-bold mb-4">
            Cotizaciones del Cliente
          </h2>

          {quotations.length === 0 ? (
            <p className="text-gray-500">
              Este cliente todavía no tiene cotizaciones.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">No.</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Ruta</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {quotations.map((quote) => (
                    <tr key={quote.id} className="border-b">
                      <td className="p-3 font-semibold">
                        {quote.quotation_number || 'Sin número'}
                      </td>

                      <td className="p-3">
                        {quote.quote_type || 'N/A'}
                      </td>

                      <td className="p-3">
                        {quote.origen || 'N/A'} → {quote.destino || 'N/A'}
                      </td>

                      <td className="p-3">
                        {quote.status || 'N/A'}
                      </td>

                      <td className="p-3">
                        {quote.created_at
                          ? new Date(quote.created_at).toLocaleDateString()
                          : 'N/A'}
                      </td>

                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => router.push(`/quotations/${quote.id}`)}
                          className="rounded-xl border px-3 py-2 font-semibold"
                        >
                          Ver detalle
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