'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '../../lib/supabase/client'
import AppLayout from '../../components/layout/app-layout'
import { useUser } from '../../hooks/useUser'

export default function ClientesPage() {
  const { profile } = useUser()
  const router = useRouter()

  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchClientes()
  }, [])

  const fetchClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select(`
        *,
        vendedor:profiles!clientes_vendedor_asignado_fkey (
          id,
          nombre,
          apellido
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    setClientes(data || [])
    setLoading(false)
  }

  const filteredClientes = clientes.filter((cliente) => {
    const query = search.toLowerCase().trim()

    return (
      !query ||
      cliente.codigo_cliente?.toLowerCase().includes(query) ||
      cliente.nombre?.toLowerCase().includes(query) ||
      cliente.nit?.toLowerCase().includes(query) ||
      cliente.telefono?.toLowerCase().includes(query) ||
      cliente.email_1?.toLowerCase().includes(query) ||
      cliente.ciudad?.toLowerCase().includes(query) ||
      cliente.pais?.toLowerCase().includes(query)
    )
  })

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Clientes</h1>
            <p className="text-gray-500 mt-2">
              Consulta clientes registrados y abre su perfil comercial.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/clientes/nuevo')}
            className="rounded-xl bg-black px-5 py-3 text-white font-semibold"
          >
            Nuevo Cliente
          </button>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold">
              Clientes Registrados
            </h2>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código, nombre, RTN, ciudad..."
              className="w-full max-w-md border p-3 rounded-xl"
            />
          </div>

          {loading ? (
            <p>Cargando clientes...</p>
          ) : filteredClientes.length === 0 ? (
            <p className="text-gray-500">No hay clientes registrados.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="p-3 text-left">Código</th>
                    <th className="p-3 text-left">Cliente</th>
                    <th className="p-3 text-left">RTN</th>
                    <th className="p-3 text-left">Ciudad / País</th>
                    <th className="p-3 text-left">Tipo</th>
                    <th className="p-3 text-left">Condición</th>
                    <th className="p-3 text-left">Vendedor</th>
                    <th className="p-3 text-left">Creado</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredClientes.map((cliente) => (
                    <tr key={cliente.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-semibold">
                        {cliente.codigo_cliente || 'N/A'}
                      </td>

                      <td className="p-3 font-semibold">
                        {cliente.nombre || 'Sin nombre'}
                      </td>

                      <td className="p-3">
                        {cliente.rtn || cliente.nit || 'N/A'}
                      </td>

                      <td className="p-3">
                        {cliente.ciudad || 'N/A'}, {cliente.pais || 'N/A'}
                      </td>

                      <td className="p-3">
                        {cliente.tipo_cliente || 'N/A'}
                      </td>

                      <td className="p-3">
                        {cliente.condicion_pago || 'Contado'}
                        {cliente.condicion_pago === 'Crédito' && cliente.dias_credito
                          ? ` / ${cliente.dias_credito} días`
                          : ''}
                      </td>

                      <td className="p-3">
                        {cliente.vendedor
                          ? `${cliente.vendedor.nombre} ${cliente.vendedor.apellido}`
                          : cliente.vendedor_nombre || 'No asignado'}
                      </td>

                      <td className="p-3">
                        {cliente.created_at
                          ? new Date(cliente.created_at).toLocaleDateString()
                          : 'N/A'}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => router.push(`/clientes/${cliente.id}`)}
                          className="rounded-xl border px-3 py-2 font-semibold hover:bg-black hover:text-white"
                        >
                          Ver Perfil
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
