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
        profiles:vendedor_asignado (
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
            <div className="space-y-3">
              {filteredClientes.map((cliente) => (
                <div key={cliente.id} className="border rounded-lg p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-bold">
                        {cliente.codigo_cliente} - {cliente.nombre}
                      </p>

                      <p className="text-sm text-gray-500">
                        RTN/NIT: {cliente.nit || cliente.rtn || 'N/A'}
                      </p>

                      <p className="text-sm text-gray-500">
                        {cliente.ciudad || 'N/A'}, {cliente.pais || 'N/A'}
                      </p>

                      <p className="text-sm text-gray-500">
                        Vendedor: {cliente.profiles
                          ? `${cliente.profiles.nombre} ${cliente.profiles.apellido}`
                          : 'No asignado'}
                      </p>
                    </div>

                    <div className="text-right text-sm text-gray-500">
                      <p>{cliente.tipo_persona || 'N/A'}</p>
                      <p>{cliente.condicion_pago || 'N/A'}</p>

                      {cliente.condicion_pago === 'Credito' && (
                        <p>{cliente.dias_credito} días</p>
                      )}

                      <p>
                        Creado: {new Date(cliente.created_at).toLocaleDateString()}
                      </p>

                      <button
                        type="button"
                        onClick={() => router.push(`/clientes/${cliente.id}`)}
                        className="rounded-xl border px-4 py-2 font-semibold"
                      >
                        Ver Perfil
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
