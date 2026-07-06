'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase/client'
import { cardClass } from '@/src/lib/ui-classes'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import AgentForm from '@/src/components/agents/AgentForm'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTipoBadge(tipo?: string | null) {
  switch (tipo) {
    case 'Agente':        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    case 'Naviera':       return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    case 'Transportista': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'Aduana':        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
    case 'Almacén':       return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'Courier':       return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    default:              return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents,  setAgents]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  useEffect(() => { fetchAgents() }, [])

  const fetchAgents = async () => {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) toast.error('Error al cargar agentes')
    setAgents(data || [])
    setLoading(false)
  }

  const filtered = agents.filter((a) => {
    const q = search.toLowerCase()
    return (
      a.name?.toLowerCase().includes(q) ||
      a.country?.toLowerCase().includes(q) ||
      a.city?.toLowerCase().includes(q) ||
      a.contact_name?.toLowerCase().includes(q) ||
      a.type?.toLowerCase().includes(q)
    )
  })

  if (loading) return <PageSkeleton cards={1} rows={5} />

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
          Catálogos
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
          Agentes de Carga
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Catálogo operativo de agentes con tarifas base y rutas. Para pagos y cuentas por pagar, ve a <a href="/suppliers" className="text-blue-600 hover:underline dark:text-blue-400">Proveedores</a>.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">

        {/* ── Formulario nuevo agente ── */}
        <div className={`${cardClass} self-start`}>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Nuevo Agente
          </h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            Completa los datos del agente o proveedor.
          </p>

          <div className="mt-5">
            <AgentForm onCreated={fetchAgents} />
          </div>
        </div>

        {/* ── Tabla de agentes ── */}
        <div className={`${cardClass} p-0 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700/60">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Agentes Registrados
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {agents.length} agente{agents.length !== 1 ? 's' : ''} en el catálogo
              </p>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="h-9 w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {search ? 'Sin resultados' : 'No hay agentes registrados.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 dark:bg-[#081120]">
                    {['Agente', 'Tipo', 'País / Ciudad', 'Contacto', 'Profit/Cont.', 'MBL', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {agent.name}
                        </p>
                        {agent.email && (
                          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                            {agent.email}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getTipoBadge(agent.type)}`}>
                          {agent.type || 'N/A'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <p>{agent.country || 'N/A'}</p>
                        {agent.city && (
                          <p className="text-xs text-slate-400 dark:text-slate-500">{agent.city}</p>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {agent.contact_name || 'N/A'}
                      </td>

                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">
                        {agent.currency} {Number(agent.profit_per_container || 0).toFixed(2)}
                      </td>

                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">
                        {agent.currency} {Number(agent.mbl_fee || 0).toFixed(2)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/agents/${agent.id}`}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Mostrando {filtered.length} de {agents.length} agentes
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}