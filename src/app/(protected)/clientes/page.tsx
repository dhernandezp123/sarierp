'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { supabase } from '../../../lib/supabase/client'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { filterSelectClass } from '@/src/lib/ui-classes'
import { Users } from 'lucide-react'

const getTipoBadgeClass = (tipo?: string | null) => {
  if (tipo === 'Corporativo') {
    return 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-900/70'
  }
  if (tipo === 'Retail') {
    return 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/50 dark:text-purple-200 dark:ring-purple-900/70'
  }
  if (tipo === 'Industrial') {
    return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900/70'
  }

  return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
}

const getCondicionBadgeClass = (condicion?: string | null) => {
  const normalized = condicion
    ?.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized?.includes('credito')) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900/70'
  }

  if (normalized?.includes('contado')) {
    return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
  }

  return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
}

export default function ClientesPage() {
  const router = useRouter()

  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState('Todos')
  const [condicionFilter, setCondicionFilter] = useState('Todos')

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
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    setClientes(data || [])
    setLoading(false)
  }

  const filteredClientes = clientes.filter((cliente) => {
    const query = search.toLowerCase().trim()
    const matchesTipo =
      tipoFilter === 'Todos' || cliente.tipo_cliente === tipoFilter
    const matchesCondicion =
      condicionFilter === 'Todos' ||
      cliente.condicion_pago === condicionFilter

    const matchesSearch =
      !query ||
      cliente.codigo_cliente?.toLowerCase().includes(query) ||
      cliente.nombre?.toLowerCase().includes(query) ||
      cliente.nit?.toLowerCase().includes(query) ||
      cliente.telefono?.toLowerCase().includes(query) ||
      cliente.email_1?.toLowerCase().includes(query) ||
      cliente.ciudad?.toLowerCase().includes(query) ||
      cliente.pais?.toLowerCase().includes(query)

    return matchesTipo && matchesCondicion && matchesSearch
  })

  const tipoOptions = Array.from(
    new Set(clientes.map((cliente) => cliente.tipo_cliente).filter(Boolean))
  )
  const condicionOptions = Array.from(
    new Set(clientes.map((cliente) => cliente.condicion_pago).filter(Boolean))
  )

  return (
    <>
      <div className="space-y-6">
        <div>
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Clientes</h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              Consulta clientes registrados y abre su perfil comercial.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <div className="mb-6 space-y-4">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Clientes Registrados
            </h2>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="Todos">Todos los tipos</option>
                {tipoOptions.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>

              <select
                value={condicionFilter}
                onChange={(e) => setCondicionFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="Todos">Todas las condiciones</option>
                {condicionOptions.map((condicion) => (
                  <option key={condicion} value={condicion}>
                    {condicion}
                  </option>
                ))}
              </select>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="h-11 min-w-[280px] flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-950"
            />

              <button
                type="button"
                onClick={() => router.push('/clientes/nuevo')}
                className="ml-auto inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                Nuevo Cliente
              </button>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : filteredClientes.length === 0 ? (
            clientes.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Sin clientes registrados"
                description="Agrega tu primer cliente para comenzar."
                action={{ label: 'Nuevo Cliente', href: '/clientes/nuevo' }}
              />
            ) : (
              <EmptyState
                title="Sin resultados"
                description="Ningún cliente coincide con los filtros aplicados."
              />
            )
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-900 text-white dark:bg-slate-950">
                  <tr>
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
                    <tr
                      key={cliente.id}
                      onClick={() => router.push(`/clientes/${cliente.id}`)}
                      className="cursor-pointer border-b border-slate-200 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/70"
                    >
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {cliente.nombre || 'Sin nombre'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {cliente.codigo_cliente || cliente.codigo || cliente.id}
                          </p>
                        </div>
                      </td>

                      <td className="p-3">
                        {cliente.rtn || cliente.nit || 'N/A'}
                      </td>

                      <td className="p-3">
                        {cliente.ciudad || 'N/A'}, {cliente.pais || 'N/A'}
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getTipoBadgeClass(
                            cliente.tipo_cliente
                          )}`}
                        >
                          {cliente.tipo_cliente || 'N/A'}
                        </span>
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getCondicionBadgeClass(
                            cliente.condicion_pago
                          )}`}
                        >
                          {cliente.condicion_pago || 'N/A'}
                        </span>
                      </td>

                      <td className="p-3">
                        {cliente.vendedor ? (
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {cliente.vendedor.nombre} {cliente.vendedor.apellido}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                            Sin asignar
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        {cliente.created_at
                          ? new Date(cliente.created_at).toLocaleDateString()
                          : 'N/A'}
                      </td>

                      <td className="p-3 text-right">
                        <Link
                          href={`/clientes/${cliente.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                        >
                          Ver perfil
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
