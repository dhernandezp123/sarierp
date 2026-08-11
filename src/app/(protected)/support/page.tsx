'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import {
  formatSupportDateTime,
  supportProfileName,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  type SupportTicket,
} from '@/src/lib/support'
import type { SupportTicketPriority, SupportTicketStatus } from '@/src/types'

type StatusFilter = 'Todos' | SupportTicketStatus
type PriorityFilter = 'Todas' | SupportTicketPriority

function statusClass(status: SupportTicketStatus) {
  if (status === 'Nuevo') return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200'
  if (status === 'En revisión') return 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200'
  if (status === 'Esperando al cliente') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
  if (status === 'En desarrollo') return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-200'
  if (status === 'Resuelto') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200'
  return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
}

function priorityClass(priority: SupportTicketPriority) {
  if (priority === 'Crítica') return 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200'
  if (priority === 'Alta') return 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-200'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

export default function SupportPage() {
  const { profile } = useUser()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('Todas')

  const loadTickets = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)

    const { data, error } = await supabase
      .from('support_tickets')
      .select(`
        id, ticket_number, subject, category, priority, status,
        created_by, assigned_to, source_path, source_module, browser_info,
        last_activity_at, first_response_at, resolved_at, closed_at,
        created_at, updated_at,
        creator:profiles!support_tickets_created_by_fkey(nombre, apellido, email),
        assignee:profiles!support_tickets_assigned_to_fkey(nombre, apellido, email)
      `)
      .order('last_activity_at', { ascending: false })

    if (error) {
      toast.error('No se pudieron cargar los tickets de soporte')
      setTickets([])
    } else {
      setTickets((data ?? []) as unknown as SupportTicket[])
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadTickets(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadTickets])

  const summary = useMemo(() => ({
    open: tickets.filter((ticket) => !['Resuelto', 'Cerrado'].includes(ticket.status)).length,
    waiting: tickets.filter((ticket) => ticket.status === 'Esperando al cliente').length,
    critical: tickets.filter((ticket) => ticket.priority === 'Crítica' && ticket.status !== 'Cerrado').length,
    resolved: tickets.filter((ticket) => ticket.status === 'Resuelto').length,
  }), [tickets])

  const filteredTickets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      const matchesSearch = !normalizedSearch
        || ticket.ticket_number.toLowerCase().includes(normalizedSearch)
        || ticket.subject.toLowerCase().includes(normalizedSearch)
        || supportProfileName(ticket.creator).toLowerCase().includes(normalizedSearch)
      const matchesStatus = statusFilter === 'Todos' || ticket.status === statusFilter
      const matchesPriority = priorityFilter === 'Todas' || ticket.priority === priorityFilter
      return matchesSearch && matchesStatus && matchesPriority
    })
  }, [priorityFilter, search, statusFilter, tickets])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {profile?.is_platform_admin ? 'Consola de Hernova Systems' : 'Atención técnica'}
          </p>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">
            Mesa de ayuda
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registra consultas, errores y solicitudes relacionadas con el ERP.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadTickets(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <Link
            href="/support/new"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo ticket
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Tickets abiertos" value={summary.open} icon={<LifeBuoy className="h-5 w-5" />} tone="blue" />
        <SummaryCard label="Esperando respuesta" value={summary.waiting} icon={<Clock3 className="h-5 w-5" />} tone="amber" />
        <SummaryCard label="Prioridad crítica" value={summary.critical} icon={<AlertCircle className="h-5 w-5" />} tone="rose" />
        <SummaryCard label="Resueltos" value={summary.resolved} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
        <div className="space-y-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por número, asunto o usuario..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="Todos">Todos los estados</option>
              {SUPPORT_TICKET_STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="Todas">Todas las prioridades</option>
              {SUPPORT_TICKET_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
            </select>
            <span className="ml-auto self-center text-xs text-slate-500">
              {filteredTickets.length} de {tickets.length} tickets
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-6"><TableSkeleton rows={5} cols={6} /></div>
        ) : filteredTickets.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy className="h-6 w-6" />}
            title={tickets.length === 0 ? 'Todavía no hay tickets' : 'Sin resultados'}
            description={tickets.length === 0
              ? 'Cuando necesites ayuda, registra aquí tu primera solicitud.'
              : 'No encontramos tickets que coincidan con los filtros.'}
            action={tickets.length === 0 ? { label: 'Crear ticket', href: '/support/new' } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr>
                  {['Ticket', 'Asunto', 'Estado', 'Prioridad', 'Última actividad', ''].map((label) => (
                    <th key={label || 'action'} className="px-5 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-blue-700 dark:text-blue-300">
                      {ticket.ticket_number}
                    </td>
                    <td className="min-w-72 px-5 py-4">
                      <p className="font-semibold text-slate-950 dark:text-white">{ticket.subject}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {ticket.category} · {supportProfileName(ticket.creator)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityClass(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatSupportDateTime(ticket.last_activity_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/support/${ticket.id}`}
                        aria-label={`Abrir ${ticket.ticket_number}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: 'blue' | 'amber' | 'rose' | 'emerald'
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
      <div className={`inline-flex rounded-xl p-2.5 ${toneClasses[tone]}`}>{icon}</div>
      <p className="mt-4 text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}
